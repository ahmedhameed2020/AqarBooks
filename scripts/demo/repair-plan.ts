import { DEMO_STORY } from "../../lib/demo/story";
import {
  generateLeases,
  generateMembers,
  generateUnits,
  type GeneratedLease,
  type GeneratedMember,
} from "./demo-fixtures";

/**
 * The structural repair, planned as a diff.
 *
 * WHAT IS BEING REPAIRED
 * The applied tenant was built by the previous `assignTenure`, which spent a
 * portfolio-wide occupancy quota in array order. Three buildings came out fully
 * occupied and Palm Gate -- last in the fixture list -- absorbed the entire
 * vacancy and stood empty. The fixtures have since been corrected to distribute
 * occupancy per property, so the database and the fixtures now disagree.
 *
 * WHY A DIFF AND NOT A RESEED
 * Deleting and re-creating would be simpler and wrong. Leases are real records
 * with an audit trail; an active one is ENDED through end_unit_lease, never
 * removed, and the same will be true of everything the financial stages write.
 * A repair that works by deletion teaches a habit that stops being available
 * the moment money is posted.
 *
 * WHAT THIS FILE DOES NOT DO
 * It writes nothing. It reads the applied rows, computes what would have to
 * change, and reports it for review -- including anything it finds that was not
 * anticipated, such as ownership churn.
 */

export type CurrentLease = {
  id: string;
  unitId: string;
  unitCode: string;
  tenantMemberId: string;
  status: string;
  rentFrequency: string;
};

export type CurrentOwnership = { unitId: string; unitCode: string; memberId: string };

export type CurrentMember = { id: string; email: string | null; isCompany: boolean };

export type RepairInput = {
  unitIdByCode: Map<string, string>;
  propertyCodeByUnitCode: Map<string, string>;
  currentLeases: CurrentLease[];
  currentOwnerships: CurrentOwnership[];
  currentMembers: CurrentMember[];
};

export type RepairPlan = {
  /** Active leases whose unit is no longer leased in the corrected fixtures. */
  leasesToEnd: Array<{ leaseId: string; unitCode: string; propertyCode: string; reason: string }>;
  /** Fixture leases with no active lease on their unit. */
  leasesToCreate: Array<{
    unitCode: string;
    propertyCode: string;
    memberEmail: string;
    rentAmount: number;
    rentFrequency: string;
    startsOn: string;
    endsOn: string;
  }>;
  /** Members the corrected fixtures need that the tenant does not have. */
  membersToCreate: GeneratedMember[];
  /** Ownership links that would have to change, if any. */
  ownershipsToEnd: Array<{ unitCode: string; propertyCode: string }>;
  ownershipsToCreate: Array<{ unitCode: string; propertyCode: string; memberEmail: string }>;
  /** Target distribution after the repair, from the corrected fixtures. */
  target: Array<{
    propertyCode: string;
    active: number;
    occupied: number;
    leased: number;
    ownerResident: number;
    vacant: number;
  }>;
  warnings: string[];
};

export function buildRepairPlan(input: RepairInput): RepairPlan {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);
  const leases = generateLeases(units, assignment);

  const warnings: string[] = [];

  const targetLeaseByUnitCode = new Map(leases.map((l) => [l.unitCode, l]));
  const targetOwnerCodes = new Set(
    units.filter((u) => !u.archived && u.tenure === "OWNER_RESIDENT").map((u) => u.code),
  );

  const propertyOf = (unitCode: string) => input.propertyCodeByUnitCode.get(unitCode) ?? "?";

  // --- leases --------------------------------------------------------------
  const activeLeases = input.currentLeases.filter((l) => l.status === "ACTIVE");

  const leasesToEnd = activeLeases
    .filter((lease) => !targetLeaseByUnitCode.has(lease.unitCode))
    .map((lease) => ({
      leaseId: lease.id,
      unitCode: lease.unitCode,
      propertyCode: propertyOf(lease.unitCode),
      reason: targetOwnerCodes.has(lease.unitCode)
        ? "unit becomes owner-resident in the corrected distribution"
        : "unit becomes vacant in the corrected distribution",
    }));

  const leasedUnitCodes = new Set(activeLeases.map((l) => l.unitCode));
  const leasesToCreate = leases
    .filter((lease) => !leasedUnitCodes.has(lease.unitCode))
    .map((lease: GeneratedLease) => ({
      unitCode: lease.unitCode,
      propertyCode: propertyOf(lease.unitCode),
      memberEmail: lease.memberEmail,
      rentAmount: lease.rentAmount,
      rentFrequency: lease.rentFrequency,
      startsOn: lease.startsOn,
      endsOn: lease.endsOn,
    }));

  // A lease that survives but whose TENANT changed would be a silent
  // substitution of one party for another on a live contract. Worth refusing
  // rather than quietly re-pointing.
  const memberById = new Map(input.currentMembers.map((m) => [m.id, m]));
  for (const lease of activeLeases) {
    const target = targetLeaseByUnitCode.get(lease.unitCode);
    if (!target) continue;
    const currentEmail = memberById.get(lease.tenantMemberId)?.email ?? null;
    if (currentEmail && currentEmail !== target.memberEmail) {
      warnings.push(
        `Lease on ${lease.unitCode} survives the repair but the corrected fixtures name a ` +
          `different tenant (${target.memberEmail} vs ${currentEmail}). The repair does NOT ` +
          "re-point tenants on live contracts; the existing tenant is kept.",
      );
    }
  }

  // --- members -------------------------------------------------------------
  const existingEmails = new Set(
    input.currentMembers.map((m) => m.email).filter(Boolean) as string[],
  );
  const neededEmails = new Set(leasesToCreate.map((l) => l.memberEmail));
  const membersToCreate = members.filter(
    (m) => neededEmails.has(m.email) && !existingEmails.has(m.email),
  );

  // --- ownership -----------------------------------------------------------
  // The instruction was to leave the 72 ownership links alone. Whether that is
  // possible is a question about the data, so it is measured rather than
  // assumed.
  const currentOwnedCodes = new Set(input.currentOwnerships.map((o) => o.unitCode));

  const ownershipsToEnd = [...currentOwnedCodes]
    .filter((code) => !targetOwnerCodes.has(code))
    .map((code) => ({ unitCode: code, propertyCode: propertyOf(code) }));

  const ownershipsToCreate = [...targetOwnerCodes]
    .filter((code) => !currentOwnedCodes.has(code))
    .map((code) => ({
      unitCode: code,
      propertyCode: propertyOf(code),
      memberEmail: assignment.get(code) ?? "?",
    }));

  if (ownershipsToEnd.length > 0 || ownershipsToCreate.length > 0) {
    warnings.push(
      `The corrected distribution moves ownership on ${ownershipsToEnd.length} unit(s) out and ` +
        `${ownershipsToCreate.length} in. The instruction was to leave the 72 ownership links ` +
        "untouched, so this is a decision: either accept the churn, or pin the owner-resident " +
        "set to what the database already holds and distribute only the tenancies.",
    );
  }

  // --- target --------------------------------------------------------------
  const target = DEMO_STORY.occupancyPlan.map((plan) => {
    const inProperty = units.filter((u) => !u.archived && u.propertyCode === plan.propertyCode);
    return {
      propertyCode: plan.propertyCode,
      active: inProperty.length,
      occupied: inProperty.filter((u) => u.tenure !== "VACANT").length,
      leased: inProperty.filter((u) => u.tenure === "LEASED").length,
      ownerResident: inProperty.filter((u) => u.tenure === "OWNER_RESIDENT").length,
      vacant: inProperty.filter((u) => u.tenure === "VACANT").length,
    };
  });

  return {
    leasesToEnd,
    leasesToCreate,
    membersToCreate,
    ownershipsToEnd,
    ownershipsToCreate,
    target,
    warnings,
  };
}

export function renderRepairPlan(plan: RepairPlan): string {
  const L: string[] = [];
  L.push("DEMO STRUCTURAL REPAIR PLAN");
  L.push("=".repeat(76));
  L.push("");
  L.push("Palm Gate Tower was applied 100% vacant because occupancy was spent in");
  L.push("array order rather than distributed. assignTenure is fixed; this is the");
  L.push("diff between what the database holds and what the corrected fixtures say.");
  L.push("");
  L.push("Nothing here has been applied. No row was written.");
  L.push("");

  L.push("-".repeat(76));
  L.push("TARGET DISTRIBUTION");
  L.push("-".repeat(76));
  L.push(
    `  ${"prop".padEnd(6)}${"active".padStart(8)}${"occupied".padStart(10)}${"leased".padStart(8)}${"owner".padStart(8)}${"vacant".padStart(8)}${"occ%".padStart(8)}`,
  );
  let totals = { active: 0, occupied: 0, leased: 0, ownerResident: 0, vacant: 0 };
  for (const row of plan.target) {
    const pct = ((100 * row.occupied) / row.active).toFixed(1) + "%";
    L.push(
      `  ${row.propertyCode.padEnd(6)}${String(row.active).padStart(8)}${String(row.occupied).padStart(10)}${String(row.leased).padStart(8)}${String(row.ownerResident).padStart(8)}${String(row.vacant).padStart(8)}${pct.padStart(8)}`,
    );
    totals = {
      active: totals.active + row.active,
      occupied: totals.occupied + row.occupied,
      leased: totals.leased + row.leased,
      ownerResident: totals.ownerResident + row.ownerResident,
      vacant: totals.vacant + row.vacant,
    };
  }
  L.push(
    `  ${"TOTAL".padEnd(6)}${String(totals.active).padStart(8)}${String(totals.occupied).padStart(10)}${String(totals.leased).padStart(8)}${String(totals.ownerResident).padStart(8)}${String(totals.vacant).padStart(8)}`,
  );

  L.push("");
  L.push("-".repeat(76));
  L.push(`LEASES TO END  (${plan.leasesToEnd.length})   via end_unit_lease -- never DELETE`);
  L.push("-".repeat(76));
  const endByProperty = new Map<string, number>();
  for (const lease of plan.leasesToEnd) {
    endByProperty.set(lease.propertyCode, (endByProperty.get(lease.propertyCode) ?? 0) + 1);
  }
  for (const [code, count] of [...endByProperty].sort()) L.push(`  ${code}   ${count}`);
  L.push("");
  for (const lease of plan.leasesToEnd.slice(0, 8)) {
    L.push(`    ${lease.unitCode.padEnd(12)}${lease.reason}`);
  }
  if (plan.leasesToEnd.length > 8) L.push(`    ... and ${plan.leasesToEnd.length - 8} more`);

  L.push("");
  L.push("-".repeat(76));
  L.push(`LEASES TO CREATE  (${plan.leasesToCreate.length})   create_unit_lease + activate_unit_lease`);
  L.push("-".repeat(76));
  const createByProperty = new Map<string, { count: number; quarterly: number }>();
  for (const lease of plan.leasesToCreate) {
    const entry = createByProperty.get(lease.propertyCode) ?? { count: 0, quarterly: 0 };
    entry.count++;
    if (lease.rentFrequency === "QUARTERLY") entry.quarterly++;
    createByProperty.set(lease.propertyCode, entry);
  }
  for (const [code, entry] of [...createByProperty].sort()) {
    L.push(`  ${code}   ${entry.count} lease(s), ${entry.quarterly} quarterly`);
  }
  L.push("");
  for (const lease of plan.leasesToCreate.slice(0, 8)) {
    L.push(
      `    ${lease.unitCode.padEnd(12)}${lease.rentFrequency.padEnd(11)}${String(lease.rentAmount).padStart(9)} EGP   ${lease.memberEmail}`,
    );
  }
  if (plan.leasesToCreate.length > 8) {
    L.push(`    ... and ${plan.leasesToCreate.length - 8} more`);
  }

  L.push("");
  L.push("-".repeat(76));
  L.push(`MEMBERS TO CREATE  (${plan.membersToCreate.length})`);
  L.push("-".repeat(76));
  const companies = plan.membersToCreate.filter((m) => m.isCompany);
  L.push(`  companies (is_company = true)   ${companies.length}`);
  L.push(`  individuals                     ${plan.membersToCreate.length - companies.length}`);
  L.push("");
  for (const member of companies.slice(0, 6)) L.push(`    ${member.fullName}`);
  if (companies.length > 6) L.push(`    ... and ${companies.length - 6} more`);

  L.push("");
  L.push("-".repeat(76));
  L.push("OWNERSHIP");
  L.push("-".repeat(76));
  L.push(`  links to end      ${plan.ownershipsToEnd.length}`);
  L.push(`  links to create   ${plan.ownershipsToCreate.length}`);

  if (plan.warnings.length > 0) {
    L.push("");
    L.push("-".repeat(76));
    L.push("DECISIONS AND WARNINGS");
    L.push("-".repeat(76));
    for (const warning of plan.warnings) {
      L.push("");
      for (const line of wrap(warning, 72)) L.push(`  ${line}`);
    }
  }

  L.push("");
  L.push("=".repeat(76));
  L.push("Nothing applied. Review, then authorise the structural repair apply.");
  return L.join("\n");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      lines.push(current.trim());
      current = word;
    } else current += ` ${word}`;
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}
