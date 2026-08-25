import { DEMO_STORY } from "../../lib/demo/story";
import { DEMO_SEED_VERSION, generateMembers, generateUnits } from "./demo-fixtures";

/**
 * The seed plan, derived with no database.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE DRY RUN
 * `seedDemoTenant({ dryRun: true })` is the better instrument, but it cannot
 * run until the demo organization exists -- its guard reads that row and
 * refuses without it. Creating that row is itself a database write, so the dry
 * run cannot be the artefact that gets reviewed BEFORE the first write.
 *
 * This closes that gap. Everything below is a consequence of `lib/demo/story.ts`
 * and the fixtures, both of which are deterministic, so the plan is exactly
 * what the seed will attempt against an empty demo tenant. It opens no
 * connection and reads no environment variable.
 *
 * WHAT IT CANNOT TELL YOU
 * Anything that depends on the database: whether the chart of accounts cloned,
 * which account codes resolved, whether an RPC accepted its arguments. Those
 * are the dry run's job, and the dry run still has to be read before the apply.
 */

export type PlannedObject = {
  stage: string;
  count: number;
  detail: string;
};

export type SeedPlan = {
  seedVersion: string;
  organization: string;
  slug: string;
  period: string;
  objects: PlannedObject[];
  /** Stages that exist in the story but are not implemented in the seed yet. */
  notImplemented: string[];
};

export function buildSeedPlan(): SeedPlan {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);

  const active = units.filter((u) => !u.archived);
  const archived = units.filter((u) => u.archived);
  const leased = active.filter((u) => u.tenure === "LEASED");
  const ownerResident = active.filter((u) => u.tenure === "OWNER_RESIDENT");
  const vacant = active.filter((u) => u.tenure === "VACANT");

  const zones = new Set(DEMO_STORY.buildings.map((b) => `${b.propertyCode}::${b.zoneEn}`));

  const byType = new Map<string, number>();
  for (const unit of units) byType.set(unit.unitType, (byType.get(unit.unitType) ?? 0) + 1);

  const multiUnitHolders = new Map<string, number>();
  for (const memberKey of assignment.values()) {
    multiUnitHolders.set(memberKey, (multiUnitHolders.get(memberKey) ?? 0) + 1);
  }
  const holdingMoreThanOne = [...multiUnitHolders.values()].filter((n) => n > 1).length;

  return {
    seedVersion: DEMO_SEED_VERSION,
    organization: DEMO_STORY.organization.nameEn,
    slug: DEMO_STORY.organization.slug,
    period: DEMO_STORY.headline.periodEn,
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
      {
        stage: "zones",
        count: zones.size,
        detail: [...zones].join(", "),
      },
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
        stage: "  of which occupied",
        count: ownerResident.length + leased.length,
        detail: `${ownerResident.length} owner-resident, ${leased.length} leased, ${vacant.length} vacant (target occupancy ${(DEMO_STORY.targets.occupancy * 100).toFixed(0)}%)`,
      },
      {
        stage: "members",
        count: members.length,
        detail: `all @demo.aqarbooks.invalid (RFC 2606, undeliverable); ${holdingMoreThanOne} hold more than one unit`,
      },
      {
        stage: "ownership links",
        count: ownerResident.length,
        detail: "created via link_unit_ownership RPC, 100% share, primary contact",
      },
      {
        stage: "due types",
        count: 2,
        detail: "Common Area Service Charge, Unit Rent",
      },
      {
        stage: "banks",
        count: 1,
        detail: "Commercial International Bank",
      },
      {
        stage: "bank accounts",
        count: 2,
        detail: "one per legal entity (Nile Heights, Marina)",
      },
    ],
    notImplemented: [
      // Listed first because it is the one gap that leaves the STRUCTURAL
      // seed internally inconsistent rather than merely empty: members are
      // created for every occupied unit, but only owner-resident units get a
      // link. Until leases exist, the leased units show no occupant and their
      // members are attached to nothing.
      `leases for the ${leased.length} leased units (create_unit_lease, activate_unit_lease) -- ` +
        `until these exist those units show no occupant and ${leased.length} members link to nothing`,
      "dues issuance for the operating month (issue_dues)",
      "payments and allocations (record_payment), leaving the overdue share",
      "CAM levy: create, compute_service_charge_allocations, issue_service_charge_levy",
      "cashbox and cashier session",
      "post-dated cheques (record_incoming_cheque)",
      "suppliers, expenses and supplier invoices",
      "bank statement lines, auto_match_bank_statement, and an unfinalised reconciliation",
    ],
  };
}

/** Renders the plan for a human to approve. */
export function renderSeedPlan(plan: SeedPlan): string {
  const lines: string[] = [];

  lines.push("AqarBooks — public demo seed plan");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push("THIS IS A PLAN, NOT A DRY RUN.");
  lines.push("");
  lines.push("It is derived from lib/demo/story.ts and scripts/demo/demo-fixtures.ts,");
  lines.push("which are deterministic. No database was contacted and nothing was");
  lines.push("written. It says what the seed will ATTEMPT against an empty demo");
  lines.push("tenant; it cannot say what the database will accept.");
  lines.push("");
  lines.push(`seed version    ${plan.seedVersion}`);
  lines.push(`organization    ${plan.organization}`);
  lines.push(`slug            ${plan.slug}`);
  lines.push(`operating month ${plan.period}`);
  lines.push("");
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
  lines.push("Until these exist, the demo tenant will hold a complete property");
  lines.push("structure and no money. Dashboard KPIs, aging, CAM and reconciliation");
  lines.push("screens will render empty.");
  lines.push("");
  for (const item of plan.notImplemented) lines.push(`  - ${item}`);

  lines.push("");
  lines.push("-".repeat(72));
  lines.push("BEFORE ANY WRITE");
  lines.push("-".repeat(72));
  lines.push("");
  lines.push("  1. Provision the demo organization and the two accounts");
  lines.push("     (docs/demo-environment.md §5). This is the first database write");
  lines.push("     and is NOT covered by this plan.");
  lines.push("  2. Set the DEMO_* environment variables.");
  lines.push("  3. Run the real dry run, which exercises the four seed guards and");
  lines.push("     resolves every account code and id against the database:");
  lines.push("         npx vitest run tests/demo-seed.manual.test.ts");
  lines.push("  4. Read test-results/demo-seed-report.txt.");
  lines.push("  5. Only then: DEMO_SEED_APPLY=1 npx vitest run tests/demo-seed.manual.test.ts");
  lines.push("");

  return lines.join("\n");
}
