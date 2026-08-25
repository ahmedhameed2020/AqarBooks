import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { monthBounds } from "./apply-collections";
import { quarterBounds } from "./quarter-alignment";

/**
 * Monthly rent obligations for one month, generic over which.
 *
 * COVERAGE, NOT OVERLAP. The May stage selected leases OVERLAPPING the month,
 * which was the RPC's behaviour at the time. Since the partial-period guard the
 * RPC RAISES on a lease that touches a period without covering it, so selecting
 * on overlap would queue a call that must fail. A lease that does not cover the
 * month is reported as skipped, with which end falls short.
 *
 * ONE FREQUENCY PER RUN. July is the first month where a monthly period and a
 * quarterly one start on the same day, so both kinds of due carry issue_date
 * 2026-07-01. A run that billed both at once would report a single total with
 * no way to say which half was which, and a skip in one would be invisible in
 * the other. The caller runs the generator once per frequency and the reports
 * stay separable.
 */

/** The inclusive bounds of a period key, whichever frequency it belongs to. */
export function periodBounds(
  frequency: "MONTHLY" | "QUARTERLY",
  periodKey: string,
): { first: string; last: string } {
  if (frequency === "MONTHLY") return monthBounds(periodKey);
  const { start, end } = quarterBounds(periodKey);
  return { first: start, last: end };
}

export type RentOutcome = {
  unitCode: string;
  leaseId: string;
  dueId: string | null;
  amount: number;
  outcome: string;
};

export type RentReport = {
  ok: boolean;
  dryRun: boolean;
  month: string;
  billable: number;
  notCalled: Array<{ unitCode: string; term: string; why: string }>;
  generated: number;
  idempotent: number;
  results: RentOutcome[];
  plannedTotal: number;
  failure?: string;
};

export type RentOptions = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  /** The period key the RPC is called with: `2026-07` or `2026-Q3`. */
  month: string;
  /** Which leases this run bills. Defaults to MONTHLY. */
  frequency?: "MONTHLY" | "QUARTERLY";
  /**
   * The fiscal month the dues are posted into. Defaults to the period key,
   * which is right for a monthly run; a quarterly run bills 2026-Q3 but posts
   * into 2026-07, and the two are not the same string.
   */
  fiscalMonth?: string;
  dryRun: boolean;
  log: (line: string) => void;
};

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function applyMonthlyRent(options: RentOptions): Promise<RentReport> {
  const { admin, owner, organizationId, month, dryRun, log } = options;
  const frequency = options.frequency ?? "MONTHLY";
  const fiscalMonth = options.fiscalMonth ?? month;
  const { first, last } = periodBounds(frequency, month);

  const report: RentReport = {
    ok: false,
    dryRun,
    month,
    billable: 0,
    notCalled: [],
    generated: 0,
    idempotent: 0,
    results: [],
    plannedTotal: 0,
  };

  try {
    const { data: periods } = await admin
      .from("fiscal_periods")
      .select("id, start_date, end_date, status")
      .eq("organization_id", organizationId);
    const period = (periods ?? []).find((p) => p.start_date.slice(0, 7) === fiscalMonth);
    if (!period) throw new Error(`no fiscal period covers ${fiscalMonth}`);
    if (period.status !== "OPEN") {
      throw new Error(
        `${fiscalMonth} is ${period.status}, not OPEN. generate_lease_rent_dues would create ` +
          "dues the posting trigger then defers, leaving unposted obligations.",
      );
    }
    // The period the dues will be DATED to must be the one that is open. A
    // quarterly run bills 2026-Q3 and dates every due 2026-07-01, so the fiscal
    // month has to be the month that date falls in -- not the quarter key.
    if (first < period.start_date || first > period.end_date) {
      throw new Error(
        `${month} is issued ${first}, which is outside the open ${fiscalMonth} period`,
      );
    }

    const { data: units } = await admin
      .from("units")
      .select("id, code")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    const codeByUnit = new Map((units ?? []).map((u) => [u.id, u.code]));

    const { data: leases, error } = await admin
      .from("unit_leases")
      .select("id, unit_id, rent_amount, starts_on, ends_on")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .eq("rent_frequency", frequency)
      .order("starts_on")
      .order("id")
      .range(0, 4999);
    if (error) throw new Error(`unit_leases read failed: ${error.message}`);

    const billable: NonNullable<typeof leases> = [];
    for (const lease of leases ?? []) {
      const endsOn = lease.ends_on ?? "9999-12-31";
      const covers = lease.starts_on <= first && endsOn >= last;
      if (covers) {
        billable.push(lease);
        continue;
      }
      const touches = lease.starts_on <= last && endsOn >= first;
      report.notCalled.push({
        unitCode: codeByUnit.get(lease.unit_id) ?? lease.id,
        term: `${lease.starts_on}..${lease.ends_on ?? "open"}`,
        why: touches
          ? `PARTIAL COVERAGE — begins ${lease.starts_on > first ? "after the month starts" : "before"}` +
            `${endsOn < last ? " / ends before the month finishes" : ""}; the guard would refuse it`
          : `outside ${month} entirely`,
      });
    }
    report.billable = billable.length;
    report.plannedTotal = billable.reduce((s, l) => s + Number(l.rent_amount), 0);

    const partial = report.notCalled.filter((n) => n.why.startsWith("PARTIAL"));
    if (partial.length > 0) {
      // Not billed at a full month's rent, and not prorated either -- there is
      // no proration policy to apply. Reported and left alone; see
      // docs/defects/partial-period-rent-billing-proration.md.
      log(`  ${partial.length} lease(s) partially cover ${month} and are NOT billed`);
      for (const p of partial) log(`    ${p.unitCode}  ${p.term}  ${p.why}`);
    }

    if (dryRun) {
      log(`  would generate ${report.billable} dues totalling ${report.plannedTotal.toFixed(2)}`);
      report.ok = true;
      return report;
    }

    for (const lease of billable) {
      const unitCode = codeByUnit.get(lease.unit_id) ?? lease.id;
      const { data, error: rpcError } = await (owner as unknown as UntypedRpc).rpc(
        "generate_lease_rent_dues",
        {
          p_organization_id: organizationId,
          p_lease_id: lease.id,
          p_period: month,
          p_issue_date: null,
        },
      );

      if (rpcError) {
        report.results.push({
          unitCode,
          leaseId: lease.id,
          dueId: null,
          amount: Number(lease.rent_amount),
          outcome: `error: ${rpcError.message}`,
        });
        report.failure =
          `${unitCode}: generate_lease_rent_dues failed (${rpcError.message}). ` +
          `${month} is still OPEN; nothing after this lease was attempted.`;
        return report;
      }

      const result = (data ?? {}) as Record<string, unknown>;
      const outcome = result.generated
        ? "generated"
        : result.idempotent
          ? "idempotent"
          : result.skipped
            ? `skipped: ${String(result.reason)}`
            : result.blocked
              ? `blocked: ${String(result.reason)}`
              : "unknown";

      if (result.generated) report.generated++;
      if (result.idempotent) report.idempotent++;

      report.results.push({
        unitCode,
        leaseId: lease.id,
        dueId: (result.due_id as string) ?? null,
        amount: Number(lease.rent_amount),
        outcome,
      });

      if (!result.generated && !result.idempotent) {
        report.failure = `${unitCode}: expected a due, got "${outcome}". ${month} is still OPEN.`;
        return report;
      }
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

export type Check = { label: string; expected: string; actual: string; pass: boolean };

/**
 * Verifies the month's rent and the cumulative rent book together.
 *
 * The month alone can be internally consistent while having disturbed an
 * earlier one; the cumulative totals alone can balance while a single due in
 * this month posted to the wrong account.
 */
export async function verifyMonthlyRent(
  admin: SupabaseClient<Database>,
  organizationId: string,
  month: string,
  expected: { count: number; amount: number; totalCount: number; totalAmount: number },
  frequency: "MONTHLY" | "QUARTERLY" = "MONTHLY",
): Promise<{ pass: boolean; checks: Check[]; text: string }> {
  const { first } = periodBounds(frequency, month);
  const checks: Check[] = [];
  const detail: string[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({ label, expected: String(exp), actual: String(act), pass: String(exp) === String(act) });

  const { data: dues } = await admin
    .from("dues")
    .select("id, amount, status, issue_date, due_date, journal_entry_id, source_type, source_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: entries } = await admin
    .from("journal_entries")
    .select("id, status, entry_date, fiscal_period_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

  const { data: periods } = await admin
    .from("fiscal_periods")
    .select("id, start_date, end_date")
    .eq("organization_id", organizationId);
  // The month the dues are DATED into, which for a quarterly run is the first
  // month of the quarter rather than anything named in the period key.
  const period = (periods ?? []).find((p) => p.start_date <= first && first <= p.end_date);

  const { data: accounts } = await admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", organizationId);
  const idByCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  // SLICED BY THE LEASE'S FREQUENCY, NOT BY THE DATE ALONE.
  //
  // July is the first month where a monthly period and a quarterly one begin on
  // the same day: 31 monthly dues and 18 Q3 dues all carry issue_date
  // 2026-07-01. Filtering on the date would have reported 49 against an
  // expectation of 31 -- and, worse, would have let a missing monthly due hide
  // behind an extra quarterly one.
  const { data: leaseRows } = await admin
    .from("unit_leases")
    .select("id, rent_frequency")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const frequencyByLease = new Map((leaseRows ?? []).map((l) => [l.id, l.rent_frequency]));

  const rentDues = (dues ?? []).filter((d) => d.source_type === "LEASE_RENT");
  const monthDues = rentDues.filter(
    (d) =>
      d.issue_date === first &&
      d.source_id !== null &&
      frequencyByLease.get(d.source_id) === frequency,
  );

  const problems: string[] = [];
  for (const due of monthDues) {
    if (due.status !== "ISSUED" && due.status !== "PAID" && due.status !== "PARTIALLY_PAID") {
      problems.push(`${due.id}: status ${due.status}`);
    }
    if (due.due_date !== first) problems.push(`${due.id}: due_date ${due.due_date}`);
    if (!due.journal_entry_id) {
      problems.push(`${due.id}: not posted`);
      continue;
    }
    const entry = entryById.get(due.journal_entry_id);
    if (!entry) problems.push(`${due.id}: journal entry missing`);
    else {
      if (entry.status !== "POSTED") problems.push(`${due.id}: journal ${entry.status}`);
      if (entry.fiscal_period_id !== period?.id) {
      problems.push(`${due.id}: posted outside the period covering ${first}`);
    }
    }
  }
  add(`every ${month} due issued and POSTED into its period`, 0, problems.length);
  detail.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  const entryIds = rentDues.map((d) => d.journal_entry_id).filter(Boolean) as string[];
  const entrySet = new Set(entryIds);
  // Read by join, then narrowed in memory. An `.in(...)` over every rent entry
  // outgrows the URL PostgREST accepts once the book has a few hundred of them,
  // and the empty result it returns would make the balance checks below pass on
  // nothing.
  const { data: joinedLines, error: linesError } = await admin
    .from("journal_entry_lines")
    .select("journal_entry_id, account_id, debit, credit, journal_entries!inner(organization_id)")
    .eq("journal_entries.organization_id", organizationId)
    .range(0, 49999);
  if (linesError) throw new Error(`journal_entry_lines read failed: ${linesError.message}`);
  const jLines = (joinedLines ?? []).filter((l) => entrySet.has(l.journal_entry_id));

  const receivable = idByCode.get("1130");
  const rental = idByCode.get("4400");
  let debitTotal = 0;
  let creditTotal = 0;
  const wrongAccount: string[] = [];
  const perEntry = new Map<string, { dr: number; cr: number }>();
  for (const line of jLines) {
    const dr = Number(line.debit ?? 0);
    const cr = Number(line.credit ?? 0);
    debitTotal += dr;
    creditTotal += cr;
    const seen = perEntry.get(line.journal_entry_id) ?? { dr: 0, cr: 0 };
    perEntry.set(line.journal_entry_id, { dr: seen.dr + dr, cr: seen.cr + cr });
    if (dr > 0 && line.account_id !== receivable) {
      wrongAccount.push(`debit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
    if (dr === 0 && line.account_id !== rental) {
      wrongAccount.push(`credit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
  }
  const unbalanced = [...perEntry.entries()].filter(([, v]) => v.dr.toFixed(2) !== v.cr.toFixed(2));

  add("Dr 1130 / Cr 4400 on every rent line", 0, wrongAccount.length);
  add("every rent journal entry balances", 0, unbalanced.length);
  add(`${month} dues`, expected.count, monthDues.length);
  add(`${month} rent`, expected.amount.toFixed(2), monthDues.reduce((s, d) => s + Number(d.amount), 0).toFixed(2));
  add("rent dues cumulative", expected.totalCount, rentDues.length);
  add(
    "rent billed cumulative",
    expected.totalAmount.toFixed(2),
    rentDues.reduce((s, d) => s + Number(d.amount), 0).toFixed(2),
  );
  add("posted rent journal entries", expected.totalCount, entryIds.length);
  add("rent debits = rent credits", debitTotal.toFixed(2), creditTotal.toFixed(2));
  add("rent journal lines read", true, jLines.length > 0);

  const lines = [`${month} RENT VERIFICATION (read from the ledger)`, "-".repeat(72)];
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(44)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  if (detail.filter(Boolean).length > 0) lines.push("", ...detail.filter(Boolean));

  const pass = checks.every((c) => c.pass);
  lines.push("", `${month} RENT   ${pass ? "PASS" : "FAIL"}`);
  return { pass, checks, text: lines.join("\n") };
}
