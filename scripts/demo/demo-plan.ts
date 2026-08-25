import { DEMO_STORY } from "../../lib/demo/story";
import {
  DEMO_SEED_VERSION,
  generateLeases,
  generateMembers,
  generateUnits,
  type GeneratedLease,
  type GeneratedMember,
  type GeneratedUnit,
} from "./demo-fixtures";

/**
 * The seed plan, derived with no database.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE DRY RUN
 * `seedDemoTenant({ dryRun: true })` is the better instrument, but it cannot
 * run until the demo organization exists -- its guard reads that row and
 * refuses without it. Creating that row is itself a database write, so the dry
 * run cannot be the artefact reviewed BEFORE the first write.
 *
 * These are two different verifications and both are needed:
 *
 *   OFFLINE PLAN (here)  proves the fixture graph is internally coherent --
 *                        that every occupied unit has something explaining its
 *                        occupancy, and no lease points at nothing.
 *   DATABASE DRY RUN     proves the plan survives contact with the schema and
 *                        real ids, once the designated demo organization
 *                        exists.
 *
 * WHAT THIS CANNOT TELL YOU
 * Anything that depends on the database: whether the chart of accounts cloned,
 * which account codes resolved, whether an RPC accepted its arguments.
 */

export type PlannedObject = {
  stage: string;
  count: number;
  detail: string;
};

/**
 * The four questions that decide PASS.
 *
 * Each is a count of contradictions, so zero is the only acceptable answer and
 * the report refuses to say PASS otherwise. They are counts rather than
 * booleans because when one is non-zero the number is the first thing you need.
 */
export type StructuralIntegrity = {
  /** Occupied, but with neither an ownership link nor a lease to explain it. */
  occupiedWithoutOwnerOrLease: number;
  /** A lease whose member does not exist in the fixtures. */
  leaseWithoutResident: number;
  /** A lease whose unit does not exist in the fixtures. */
  leaseWithoutUnit: number;
  /** Archived stock carrying an active lease. */
  archivedUnitWithActiveLease: number;
  /** A vacant unit carrying an active lease. */
  vacantUnitWithActiveLease: number;
  /** A member attached to neither an ownership link nor a lease. */
  orphanMembers: number;
  pass: boolean;
};

export type SeedPlan = {
  seedVersion: string;
  organization: string;
  slug: string;
  period: string;
  counts: {
    legalEntities: number;
    properties: number;
    zones: number;
    buildings: number;
    units: number;
    activeUnits: number;
    archivedUnits: number;
    occupied: number;
    ownerResident: number;
    leased: number;
    vacant: number;
    members: number;
    multiUnitOwners: number;
    ownershipLinks: number;
    activeLeases: number;
  };
  objects: PlannedObject[];
  integrity: StructuralIntegrity;
  notImplemented: string[];
  followUps: string[];
};

/**
 * The integrity computation, over inputs rather than over the fixtures.
 *
 * WHY IT TAKES ARGUMENTS
 * A gate that can only ever be run against known-good fixtures is not a gate --
 * nothing proves it would notice a problem. Taking the graph as parameters lets
 * the tests feed it a deliberately broken one and assert that it says FAIL, so
 * the PASS it prints for the real fixtures actually means something.
 */
export function computeStructuralIntegrity(
  units: GeneratedUnit[],
  members: GeneratedMember[],
  assignment: Map<string, string>,
  leases: GeneratedLease[],
): StructuralIntegrity {
  const active = units.filter((u) => !u.archived);
  const ownerResident = active.filter((u) => u.tenure === "OWNER_RESIDENT");
  const occupied = active.filter((u) => u.tenure !== "VACANT");

  const unitCodes = new Set(units.map((u) => u.code));
  const memberEmails = new Set(members.map((m) => m.email));
  const leasedUnitCodes = new Set(leases.map((l) => l.unitCode));
  const ownedUnitCodes = new Set(ownerResident.map((u) => u.code));

  const occupiedWithoutOwnerOrLease = occupied.filter(
    (u) => !ownedUnitCodes.has(u.code) && !leasedUnitCodes.has(u.code),
  ).length;

  const leaseWithoutResident = leases.filter((l) => !memberEmails.has(l.memberEmail)).length;
  const leaseWithoutUnit = leases.filter((l) => !unitCodes.has(l.unitCode)).length;

  const archivedCodes = new Set(units.filter((u) => u.archived).map((u) => u.code));
  const archivedUnitWithActiveLease = leases.filter((l) => archivedCodes.has(l.unitCode)).length;

  const vacantCodes = new Set(
    active.filter((u) => u.tenure === "VACANT").map((u) => u.code),
  );
  const vacantUnitWithActiveLease = leases.filter((l) => vacantCodes.has(l.unitCode)).length;

  // A member is accounted for if they own or rent at least one unit.
  const attached = new Set<string>();
  for (const unit of ownerResident) {
    const email = assignment.get(unit.code);
    if (email) attached.add(email);
  }
  for (const lease of leases) attached.add(lease.memberEmail);
  const orphanMembers = members.filter((m) => !attached.has(m.email)).length;

  return {
    occupiedWithoutOwnerOrLease,
    leaseWithoutResident,
    leaseWithoutUnit,
    archivedUnitWithActiveLease,
    vacantUnitWithActiveLease,
    orphanMembers,
    pass:
      occupiedWithoutOwnerOrLease === 0 &&
      leaseWithoutResident === 0 &&
      leaseWithoutUnit === 0 &&
      archivedUnitWithActiveLease === 0 &&
      vacantUnitWithActiveLease === 0 &&
      orphanMembers === 0,
  };
}

export function buildSeedPlan(): SeedPlan {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);
  const leases = generateLeases(units, assignment);

  const active = units.filter((u) => !u.archived);
  const archived = units.filter((u) => u.archived);
  const leased = active.filter((u) => u.tenure === "LEASED");
  const ownerResident = active.filter((u) => u.tenure === "OWNER_RESIDENT");
  const vacant = active.filter((u) => u.tenure === "VACANT");
  const occupied = [...ownerResident, ...leased];

  const zones = new Set(DEMO_STORY.buildings.map((b) => `${b.propertyCode}::${b.zoneEn}`));

  const byType = new Map<string, number>();
  for (const unit of units) byType.set(unit.unitType, (byType.get(unit.unitType) ?? 0) + 1);

  const heldCount = new Map<string, number>();
  for (const memberKey of assignment.values()) {
    heldCount.set(memberKey, (heldCount.get(memberKey) ?? 0) + 1);
  }
  const multiUnitOwners = [...heldCount.values()].filter((n) => n > 1).length;

  const integrity = computeStructuralIntegrity(units, members, assignment, leases);

  return {
    seedVersion: DEMO_SEED_VERSION,
    organization: DEMO_STORY.organization.nameEn,
    slug: DEMO_STORY.organization.slug,
    period: DEMO_STORY.headline.periodEn,
    counts: {
      legalEntities: DEMO_STORY.headline.legalEntities,
      properties: DEMO_STORY.properties.length,
      zones: zones.size,
      buildings: DEMO_STORY.buildings.length,
      units: units.length,
      activeUnits: active.length,
      archivedUnits: archived.length,
      occupied: occupied.length,
      ownerResident: ownerResident.length,
      leased: leased.length,
      vacant: vacant.length,
      members: members.length,
      multiUnitOwners,
      ownershipLinks: ownerResident.length,
      activeLeases: leases.length,
    },
    objects: [
      {
        stage: "chart of accounts",
        count: 0,
        detail: "cloned from the RESORT_STANDARD template via RPC (count decided by the template)",
      },
      {
        stage: "fiscal period",
        count: 1,
        detail: `FY${DEMO_STORY.period.year}, with an OPEN period covering ${DEMO_STORY.period.start}..${DEMO_STORY.period.end}`,
      },
      {
        stage: "properties",
        count: DEMO_STORY.properties.length,
        detail: DEMO_STORY.properties.map((p) => `${p.code} ${p.nameEn}`).join(", "),
      },
      { stage: "zones", count: zones.size, detail: [...zones].join(", ") },
      {
        stage: "buildings",
        count: DEMO_STORY.buildings.length,
        detail: DEMO_STORY.buildings.map((b) => `${b.code} (${b.count} units)`).join(", "),
      },
      {
        stage: "units",
        count: units.length,
        detail:
          `${active.length} active, ${archived.length} archived; ` +
          [...byType.entries()].map(([type, n]) => `${type} ${n}`).join(", "),
      },
      {
        stage: "members",
        count: members.length,
        detail: `all @demo.aqarbooks.invalid (RFC 2606, undeliverable); ${multiUnitOwners} hold more than one unit`,
      },
      {
        stage: "ownership links",
        count: ownerResident.length,
        detail: "link_unit_ownership RPC, 100% share, primary contact",
      },
      {
        stage: "tenant accounts",
        count: 1,
        detail:
          `${DEMO_STORY.tenantAccounts.rentalIncome.code} ` +
          `${DEMO_STORY.tenantAccounts.rentalIncome.nameEn} under ` +
          `${DEMO_STORY.tenantAccounts.rentalIncome.parentCode} -- tenant chart ` +
          "configuration, not a change to the global template",
      },
      {
        stage: "due types",
        count: 2,
        detail:
          "Common Area Service Charge -> 4100; Unit Rent -> " +
          `${DEMO_STORY.tenantAccounts.rentalIncome.code} ${DEMO_STORY.tenantAccounts.rentalIncome.nameEn}`,
      },
      { stage: "banks", count: 1, detail: "Commercial International Bank" },
      {
        stage: "bank accounts",
        count: 2,
        detail: "one per legal entity (Nile Heights, Marina)",
      },
      {
        stage: "leases",
        count: leases.length,
        detail:
          "create_unit_lease then activate_unit_lease; every term spans " +
          `${DEMO_STORY.headline.periodEn}; residential monthly, commercial quarterly; ` +
          "two months' security deposit",
      },
    ],
    integrity,
    notImplemented: [
      "dues issuance for the operating month (issue_dues)",
      "payments and allocations (record_payment), leaving the overdue share",
      "CAM levy: create, compute_service_charge_allocations, issue_service_charge_levy",
      "cashbox and cashier session",
      "post-dated cheques (record_incoming_cheque)",
      "suppliers, expenses and supplier invoices",
      "bank statement lines, auto_match_bank_statement, and an unfinalised reconciliation",
    ],
    followUps: [
      "The demo organization must be ACTIVE, not TRIAL: create_unit_lease calls " +
        "organization_is_active() and refuses otherwise. ACTIVE is a lifecycle " +
        "status, not a commercial one -- the demo must additionally be marked so " +
        "billing and analytics never count it as a paying customer.",
      "The demo tenant must have NO subscriptions row. Plans live in a separate " +
        "table, so an organization with no subscription is already excluded from " +
        "any paid-customer metric that counts subscriptions.",
    ],
  };
}

/** Renders the plan for a human to approve. */
export function renderSeedPlan(plan: SeedPlan): string {
  const lines: string[] = [];
  const row = (label: string, value: number | string) =>
    lines.push(`${label.padEnd(24)}${String(value).padStart(4)}`);

  lines.push("DEMO STRUCTURAL PLAN");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push("THIS IS A PLAN, NOT A DRY RUN.");
  lines.push("");
  lines.push("Derived from lib/demo/story.ts and scripts/demo/demo-fixtures.ts, both");
  lines.push("deterministic. No database was contacted and nothing was written. It says");
  lines.push("what the seed will ATTEMPT against an empty demo tenant, and whether the");
  lines.push("fixture graph is internally coherent. It cannot say what the database");
  lines.push("will accept -- that is the dry run's job, and it comes after provisioning.");
  lines.push("");
  lines.push(`seed version    ${plan.seedVersion}`);
  lines.push(`organization    ${plan.organization}`);
  lines.push(`slug            ${plan.slug}`);
  lines.push(`operating month ${plan.period}`);
  lines.push("");
  lines.push("-".repeat(72));
  lines.push("");

  const c = plan.counts;
  row("Legal entities", c.legalEntities);
  row("Properties", c.properties);
  row("Zones", c.zones);
  row("Buildings", c.buildings);
  lines.push("");
  row("Units", c.units);
  row("Active", c.activeUnits);
  row("Archived", c.archivedUnits);
  lines.push("");
  row("Occupied", c.occupied);
  row("Owner-resident", c.ownerResident);
  row("Leased", c.leased);
  row("Vacant", c.vacant);
  lines.push("");
  row("Members", c.members);
  row("Multi-unit owners", c.multiUnitOwners);
  lines.push("");
  row("Ownership links", c.ownershipLinks);
  row("Active leases", c.activeLeases);
  lines.push("");
  row("Unlinked occupied", plan.integrity.occupiedWithoutOwnerOrLease);
  row("Orphan members", plan.integrity.orphanMembers);
  row(
    "Invalid lease links",
    plan.integrity.leaseWithoutResident +
      plan.integrity.leaseWithoutUnit +
      plan.integrity.archivedUnitWithActiveLease +
      plan.integrity.vacantUnitWithActiveLease,
  );
  lines.push("");
  lines.push(`${"Structural integrity".padEnd(24)}${plan.integrity.pass ? "PASS" : "FAIL"}`);
  lines.push("");

  if (!plan.integrity.pass) {
    lines.push("-".repeat(72));
    lines.push("INTEGRITY FAILURES");
    lines.push("-".repeat(72));
    lines.push("");
    const failures: Array<[string, number]> = [
      ["occupied_without_owner_or_lease", plan.integrity.occupiedWithoutOwnerOrLease],
      ["lease_without_resident", plan.integrity.leaseWithoutResident],
      ["lease_without_unit", plan.integrity.leaseWithoutUnit],
      ["archived_unit_with_active_lease", plan.integrity.archivedUnitWithActiveLease],
      ["vacant_unit_with_active_lease", plan.integrity.vacantUnitWithActiveLease],
      ["orphan_members", plan.integrity.orphanMembers],
    ];
    for (const [name, value] of failures) {
      if (value > 0) lines.push(`  ${name.padEnd(36)}${value}`);
    }
    lines.push("");
    lines.push("  Do not provision or seed while any of these is non-zero.");
    lines.push("");
  }

  lines.push("-".repeat(72));
  lines.push("WOULD CREATE");
  lines.push("-".repeat(72));
  for (const object of plan.objects) {
    const count = object.count === 0 ? "   ?" : String(object.count).padStart(4);
    lines.push(`${count}  ${object.stage}`);
    lines.push(`      ${object.detail}`);
  }

  lines.push("");
  lines.push("-".repeat(72));
  lines.push("NOT IMPLEMENTED — no financial stage is written yet");
  lines.push("-".repeat(72));
  lines.push("");
  lines.push("The structure is coherent; the money is absent. Dashboard KPIs, aging,");
  lines.push("CAM and reconciliation screens will render empty until these land.");
  lines.push("");
  for (const item of plan.notImplemented) lines.push(`  - ${item}`);

  lines.push("");
  lines.push("-".repeat(72));
  lines.push("FOLLOW-UPS");
  lines.push("-".repeat(72));
  lines.push("");
  for (const item of plan.followUps) {
    lines.push(`  - ${item.replace(/\s+/g, " ")}`);
  }

  lines.push("");
  lines.push("-".repeat(72));
  lines.push("BEFORE ANY WRITE");
  lines.push("-".repeat(72));
  lines.push("");
  lines.push("  1. Bootstrap only: create the designated demo organization and the two");
  lines.push("     accounts (docs/demo-environment.md §5). This is the first database");
  lines.push("     write and is NOT covered by this plan.");
  lines.push("  2. Set the DEMO_* environment variables.");
  lines.push("  3. Database dry run -- exercises the four seed guards and resolves every");
  lines.push("     account code and id against the real schema:");
  lines.push("         npx vitest run tests/demo-seed.manual.test.ts");
  lines.push("  4. Read test-results/demo-seed-report.txt.");
  lines.push("  5. Only then: DEMO_SEED_APPLY=1 npx vitest run tests/demo-seed.manual.test.ts");
  lines.push("");

  return lines.join("\n");
}
