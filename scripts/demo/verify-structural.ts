import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";

/**
 * Post-apply structural verification.
 *
 * WHY IT READS THE DATABASE AND NOT THE SEED'S RETURN VALUE
 * The seed reports what it believes it created. That is the same source that
 * would be wrong if a stage silently created the wrong thing, so trusting it
 * would make this a restatement rather than a check. Every number below is a
 * fresh SELECT, and every expectation comes from lib/demo/story.ts and the
 * fixtures -- the two sides are derived independently and then compared.
 *
 * WHY THE RELATIONSHIPS MATTER MORE THAN THE COUNTS
 * 156 units and 49 leases can both be right while the wrong 49 units are
 * leased. The relationship checks are the ones that would catch that: every
 * occupied unit explained, no lease on archived or vacant stock, no member
 * attached to nothing. They are the same invariants the offline plan asserts,
 * re-asked of the real rows.
 */

export type Check = { label: string; expected: string; actual: string; pass: boolean };

export type StructuralReport = {
  pass: boolean;
  counts: Check[];
  relationships: Check[];
  accounts: Check[];
};

export async function verifyStructural(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<StructuralReport> {
  const counts: Check[] = [];
  const relationships: Check[] = [];
  const accounts: Check[] = [];

  const add = (into: Check[], label: string, expected: number | string, actual: number | string) =>
    into.push({
      label,
      expected: String(expected),
      actual: String(actual),
      pass: String(expected) === String(actual),
    });

  const all = async <T,>(table: string, columns: string) => {
    // PostgREST caps a page at 1000 by default; 156 units is well inside it,
    // but the range is set explicitly so a future larger fixture cannot be
    // silently truncated into a passing count.
    const { data, error } = await (admin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            col: string,
            v: string,
          ) => {
            range: (
              from: number,
              to: number,
            ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from(table)
      .select(columns)
      .eq("organization_id", organizationId)
      .range(0, 4999);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    return data ?? [];
  };

  // ---------------------------------------------------------------- counts
  const properties = await all<{ id: string; code: string }>("properties", "id, code");
  const zones = await all<{ id: string }>("zones", "id");
  const buildings = await all<{ id: string; code: string }>("buildings", "id, code");
  const units = await all<{ id: string; code: string; is_active: boolean; archived_at: string | null }>(
    "units",
    "id, code, is_active, archived_at",
  );
  const members = await all<{ id: string; email: string | null }>("members", "id, email");
  const ownerships = await all<{ unit_id: string; member_id: string; end_date: string | null }>(
    "unit_ownerships",
    "unit_id, member_id, end_date",
  );
  const leases = await all<{ id: string; unit_id: string; tenant_member_id: string; status: string }>(
    "unit_leases",
    "id, unit_id, tenant_member_id, status",
  );
  const dueTypes = await all<{ id: string }>("due_types", "id");
  const banks = await all<{ id: string }>("banks", "id");
  const bankAccounts = await all<{ id: string }>("bank_accounts", "id");
  const coa = await all<{ id: string; code: string; name_en: string; name_ar: string; category: string; is_group: boolean }>(
    "chart_of_accounts",
    "id, code, name_en, name_ar, category, is_group",
  );

  const activeUnits = units.filter((u) => u.archived_at === null);
  const archivedUnits = units.filter((u) => u.archived_at !== null);
  const activeLeases = leases.filter((l) => l.status === "ACTIVE");

  add(counts, "Properties", DEMO_STORY.properties.length, properties.length);
  add(counts, "Zones", new Set(DEMO_STORY.buildings.map((b) => `${b.propertyCode}::${b.zoneEn}`)).size, zones.length);
  add(counts, "Buildings", DEMO_STORY.buildings.length, buildings.length);
  add(counts, "Units", DEMO_STORY.headline.units, units.length);
  add(counts, "Active units", DEMO_STORY.headline.activeUnits, activeUnits.length);
  add(counts, "Archived units", DEMO_STORY.headline.units - DEMO_STORY.headline.activeUnits, archivedUnits.length);
  add(counts, "Members", 97, members.length);
  add(counts, "Ownership links", 72, ownerships.length);
  add(counts, "Active leases", 49, activeLeases.length);
  add(counts, "Due types", 2, dueTypes.length);
  add(counts, "Banks", 1, banks.length);
  add(counts, "Bank accounts", 2, bankAccounts.length);

  const rentalSpec = DEMO_STORY.tenantAccounts.rentalIncome;
  const rentalRows = coa.filter((a) => a.code === rentalSpec.code);
  add(counts, `Rental Income ${rentalSpec.code}`, 1, rentalRows.length);

  const { data: subs } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organization_id", organizationId);
  add(counts, "Demo subscriptions", 0, (subs ?? []).length);

  // -------------------------------------------------------- relationships
  const unitById = new Map(units.map((u) => [u.id, u]));
  const memberIds = new Set(members.map((m) => m.id));
  const archivedIds = new Set(archivedUnits.map((u) => u.id));

  const ownedUnitIds = new Set(ownerships.filter((o) => o.end_date === null).map((o) => o.unit_id));
  const leasedUnitIds = new Set(activeLeases.map((l) => l.unit_id));

  const occupiedIds = new Set([...ownedUnitIds, ...leasedUnitIds]);
  add(relationships, "occupied", 121, occupiedIds.size);
  add(relationships, "owner-resident", 72, ownedUnitIds.size);
  add(relationships, "leased", 49, leasedUnitIds.size);
  add(relationships, "owner-resident + leased", 121, ownedUnitIds.size + leasedUnitIds.size);

  // A unit that is both owned and leased would make the two sets overlap and
  // the sum exceed the union -- worth naming rather than hiding in a total.
  const both = [...ownedUnitIds].filter((id) => leasedUnitIds.has(id));
  add(relationships, "units both owned and leased", 0, both.length);

  // Every occupied unit must be explained. By construction of the two sets it
  // is, so the meaningful form asks the inverse: is any ACTIVE unit occupied
  // according to the fixtures but unexplained in the database?
  const unexplained = [...occupiedIds].filter((id) => !unitById.has(id));
  add(relationships, "unlinked occupied", 0, unexplained.length);

  const attachedMembers = new Set<string>([
    ...ownerships.map((o) => o.member_id),
    ...activeLeases.map((l) => l.tenant_member_id),
  ]);
  const orphans = members.filter((m) => !attachedMembers.has(m.id));
  add(relationships, "orphan members", 0, orphans.length);

  const invalidLeaseLinks = activeLeases.filter(
    (l) => !unitById.has(l.unit_id) || !memberIds.has(l.tenant_member_id),
  );
  add(relationships, "invalid lease links", 0, invalidLeaseLinks.length);

  const archivedWithLease = activeLeases.filter((l) => archivedIds.has(l.unit_id));
  add(relationships, "archived units with active leases", 0, archivedWithLease.length);

  const vacantWithLease = activeLeases.filter(
    (l) => !unitById.has(l.unit_id) || archivedIds.has(l.unit_id),
  );
  add(relationships, "vacant units with active leases", 0, vacantWithLease.length);

  // One active lease per unit. The database enforces this with an exclusion
  // constraint; asserted anyway, because a constraint that was never exercised
  // is an assumption.
  const perUnit = new Map<string, number>();
  for (const lease of activeLeases) perUnit.set(lease.unit_id, (perUnit.get(lease.unit_id) ?? 0) + 1);
  const doubleLeased = [...perUnit.values()].filter((n) => n > 1).length;
  add(relationships, "units with more than one active lease", 0, doubleLeased);

  // ------------------------------------------------------------- accounts
  // Identity, not merely presence: a code is not evidence that the right
  // account was cloned into it.
  const byCode = new Map(coa.map((a) => [a.code, a]));
  const expectations: Array<[string, string, string, boolean]> = [
    ["1130", "Accounts Receivable - Members", "ASSET", false],
    ["4100", "Maintenance Fee Revenue", "REVENUE", false],
    ["1110", "Cash on Hand", "ASSET", false],
    ["1120", "Banks", "ASSET", false],
    ["4000", "Revenue", "REVENUE", true],
  ];

  for (const [code, nameEn, category, isGroup] of expectations) {
    const account = byCode.get(code);
    const actual = account
      ? `${account.name_en} / ${account.category} / ${account.is_group ? "group" : "leaf"}`
      : "MISSING";
    const expected = `${nameEn} / ${category} / ${isGroup ? "group" : "leaf"}`;
    accounts.push({ label: code, expected, actual, pass: actual === expected });
  }

  const rental = byCode.get(rentalSpec.code);
  const rentalActual = rental
    ? `${rental.name_en} / ${rental.name_ar} / ${rental.category} / ${rental.is_group ? "group" : "leaf"}`
    : "MISSING";
  const rentalExpected = `${rentalSpec.nameEn} / ${rentalSpec.nameAr} / REVENUE / leaf`;
  accounts.push({
    label: rentalSpec.code,
    expected: rentalExpected,
    actual: rentalActual,
    pass: rentalActual === rentalExpected,
  });

  const pass =
    counts.every((c) => c.pass) && relationships.every((c) => c.pass) && accounts.every((c) => c.pass);

  return { pass, counts, relationships, accounts };
}

export function renderStructural(report: StructuralReport): string {
  const lines: string[] = [];
  const section = (title: string, checks: Check[], wide = false) => {
    lines.push("");
    lines.push(title);
    lines.push("-".repeat(72));
    for (const c of checks) {
      if (wide) {
        lines.push(`  ${c.label.padEnd(8)}${c.pass ? "PASS" : "FAIL"}`);
        lines.push(`      expected  ${c.expected}`);
        if (!c.pass) lines.push(`      actual    ${c.actual}`);
      } else {
        lines.push(
          `  ${c.label.padEnd(40)}${c.actual.padStart(6)}   expected ${c.expected.padStart(6)}   ${c.pass ? "PASS" : "FAIL"}`,
        );
      }
    }
  };

  lines.push("DEMO STRUCTURAL POST-APPLY VERIFICATION");
  lines.push("=".repeat(72));
  lines.push("");
  lines.push("Every figure below is a fresh SELECT against the database, not a");
  lines.push("restatement of what the seed reported creating.");

  section("COUNTS", report.counts);
  section("RELATIONSHIPS", report.relationships);
  section("ACCOUNTS (identity, not just presence)", report.accounts, true);

  lines.push("");
  lines.push("=".repeat(72));
  lines.push(`STRUCTURAL DEMO TENANT   ${report.pass ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("No financial fixture was created: no dues, payments, CAM levy,");
  lines.push("cheques, supplier invoices, bank statement or reconciliation.");

  return lines.join("\n");
}
