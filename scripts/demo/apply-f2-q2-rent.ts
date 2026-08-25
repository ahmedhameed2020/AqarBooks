import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { coversQuarter, quarterBounds } from "./quarter-alignment";

/**
 * F2 — 2026-Q2 commercial rent.
 *
 * WHY APRIL IS REOPENED AND NOT WORKED AROUND
 * `generate_lease_rent_dues` sets `due_date` to the period start and defaults
 * `issue_date` to it, and the dues trigger will not post to the ledger until an
 * OPEN period covers the issue date. 2026-Q2 begins 2026-04-01, so the honest
 * options were: reopen April, or override `issue_date` into May and date a
 * quarter's rent to a month it does not belong to.
 *
 * The second would have produced a demo whose commercial rent is dated wrong on
 * every invoice, to avoid an audit row. `set_fiscal_period_status` reopens a
 * closed period deliberately, permission-gated, with the reason recorded -- it
 * is a sanctioned exception, not a loophole, and using it leaves an explicit
 * trail saying why April moved twice.
 *
 * WHY ONLY THE FIFTEEN
 * Eighteen quarterly leases are ACTIVE. Fifteen cover 2026-Q2 in full; three do
 * not touch it at all after the alignment, PG-T-0502 among them -- it now
 * commences 2026-07-01 and belongs to Q3. Calling the RPC for those three would
 * return a benign `period_outside_lease_range` skip, but this stage does not
 * lean on that: it calls exactly the leases it intends to bill and reports the
 * three it deliberately did not.
 *
 * NOTHING HERE CHOOSES AN AMOUNT. Each due is the lease's own `rent_amount`,
 * read from the row by the RPC. The 599,150.00 in the verification is what the
 * fifteen leases add up to, not a figure this stage aims at.
 */

export const Q2_PERIOD = "2026-Q2";
export const APRIL_PERIOD = "2026-04";

export const APRIL_REOPEN_REASON =
  "Demo historical completion — Q2 commercial rent discovered after initial fiscal initialization";

export const APRIL_RECLOSE_REASON =
  "Demo historical completion — Q2 commercial rent posted; April complete and closed again";

export type Q2Generated = {
  unitCode: string;
  leaseId: string;
  dueId: string | null;
  amount: number;
  outcome: string;
};

export type Q2Report = {
  ok: boolean;
  dryRun: boolean;
  /** Leases that fully cover Q2 and are therefore billed. */
  billable: number;
  /** ACTIVE quarterly leases deliberately not called, with the reason. */
  notCalled: Array<{ unitCode: string; term: string; why: string }>;
  generated: number;
  idempotent: number;
  results: Q2Generated[];
  aprilReopened: boolean;
  aprilReclosed: boolean;
  failure?: string;
};

export type Q2Options = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
  log: (line: string) => void;
};

/**
 * `generate_lease_rent_dues` and `verify_financial_audit_chain` are absent from
 * the curated lib/supabase/types.ts. Narrow escape, same as apply-f1-may-rent.
 */
type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function periodByMonth(
  admin: SupabaseClient<Database>,
  organizationId: string,
  month: string,
): Promise<{ id: string; status: string } | null> {
  const { data } = await admin
    .from("fiscal_periods")
    .select("id, start_date, status")
    .eq("organization_id", organizationId)
    .order("start_date");
  // Matched on the month the period COVERS, never on its name: names are free
  // text and a rename would silently retarget a different month.
  const period = (data ?? []).find((p) => p.start_date.slice(0, 7) === month);
  return period ? { id: period.id, status: period.status } : null;
}

/**
 * Moves one period, and only if it is not already there.
 *
 * `set_fiscal_period_status` writes an audit row on every call including a
 * no-op one. A reopen that logged "April reopened" on a period already open
 * would put a reason into the trail that describes nothing.
 */
export async function setPeriodStatus(
  admin: SupabaseClient<Database>,
  owner: SupabaseClient<Database>,
  organizationId: string,
  month: string,
  status: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED",
  reason: string,
): Promise<{ changed: boolean; from: string }> {
  const period = await periodByMonth(admin, organizationId, month);
  if (!period) throw new Error(`no fiscal period covers ${month}`);
  if (period.status === status) return { changed: false, from: period.status };

  const { error } = await owner.rpc("set_fiscal_period_status", {
    p_fiscal_period_id: period.id,
    p_status: status,
    p_reason: reason,
  });
  if (error) {
    throw new Error(`set_fiscal_period_status(${month} -> ${status}) failed: ${error.message}`);
  }
  return { changed: true, from: period.status };
}

export async function applyF2Q2Rent(options: Q2Options): Promise<Q2Report> {
  const { admin, owner, organizationId, dryRun, log } = options;

  const report: Q2Report = {
    ok: false,
    dryRun,
    billable: 0,
    notCalled: [],
    generated: 0,
    idempotent: 0,
    results: [],
    aprilReopened: false,
    aprilReclosed: false,
  };

  try {
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
      .eq("rent_frequency", "QUARTERLY")
      .order("starts_on")
      .order("id")
      .range(0, 4999);
    if (error) throw new Error(`unit_leases read failed: ${error.message}`);

    const billable: typeof leases = [];
    for (const lease of leases ?? []) {
      const term = { startsOn: lease.starts_on, endsOn: lease.ends_on };
      if (coversQuarter(term, Q2_PERIOD)) {
        billable.push(lease);
        continue;
      }
      const { start, end } = quarterBounds(Q2_PERIOD);
      const touches = lease.starts_on <= end && (lease.ends_on ?? "9999-12-31") >= start;
      report.notCalled.push({
        unitCode: codeByUnit.get(lease.unit_id) ?? lease.id,
        term: `${lease.starts_on}..${lease.ends_on ?? "open"}`,
        // A lease that TOUCHES Q2 without covering it should not exist after
        // the alignment. Saying so out loud rather than lumping it in with the
        // ones that simply fall outside: the RPC would raise on it, and this
        // stage would then be about to attempt a call it knows must fail.
        why: touches
          ? "PARTIAL COVERAGE — the guard would refuse this; the alignment should have removed it"
          : "outside 2026-Q2 entirely",
      });
    }
    report.billable = billable.length;

    const partial = report.notCalled.filter((n) => n.why.startsWith("PARTIAL"));
    if (partial.length > 0) {
      report.failure =
        `${partial.length} ACTIVE quarterly lease(s) partially cover 2026-Q2: ` +
        partial.map((p) => `${p.unitCode} ${p.term}`).join(", ") +
        ". The alignment did not finish. Refusing to bill anything.";
      return report;
    }

    if (dryRun) {
      const total = billable.reduce((s, l) => s + Number(l.rent_amount), 0);
      log(`  would reopen   ${APRIL_PERIOD}`);
      log(`  would generate ${billable.length} dues totalling ${total.toFixed(2)}`);
      log(`  would reclose  ${APRIL_PERIOD}`);
      report.ok = true;
      return report;
    }

    // ---- 1. reopen April --------------------------------------------------
    const reopen = await setPeriodStatus(
      admin,
      owner,
      organizationId,
      APRIL_PERIOD,
      "OPEN",
      APRIL_REOPEN_REASON,
    );
    report.aprilReopened = reopen.changed;
    log(`  April ${reopen.from} -> OPEN${reopen.changed ? "" : " (already open)"}`);

    // ---- 2. generate ------------------------------------------------------
    for (const lease of billable) {
      const unitCode = codeByUnit.get(lease.unit_id) ?? lease.id;
      const { data, error: rpcError } = await (owner as unknown as UntypedRpc).rpc(
        "generate_lease_rent_dues",
        {
          p_organization_id: organizationId,
          p_lease_id: lease.id,
          p_period: Q2_PERIOD,
          // Deliberately NOT overridden. The obligation is dated to the period
          // it bills; that is the whole reason April was reopened.
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
          "April is still OPEN; nothing after this lease was attempted.";
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

      // A skip here is not benign: every lease in this list was chosen because
      // it covers the quarter, so a skip means the RPC disagrees with the
      // coverage rule this stage used to select it.
      if (!result.generated && !result.idempotent) {
        report.failure = `${unitCode}: expected a due, got "${outcome}". April is still OPEN.`;
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

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Check = { label: string; expected: string; actual: string; pass: boolean };
export type Q2Verification = { pass: boolean; checks: Check[]; text: string };

/**
 * Reads the ledger back — never the applier's account of what it did.
 *
 * Both the Q2 slice and the whole rent set are checked. Q2 alone could be
 * internally consistent while having disturbed May; the totals alone could
 * balance while a single Q2 due posted to the wrong account.
 */
export async function verifyQ2(
  admin: SupabaseClient<Database>,
  organizationId: string,
  expected: {
    q2Count: number;
    q2Amount: number;
    totalCount: number;
    totalAmount: number;
  },
): Promise<Q2Verification> {
  const checks: Check[] = [];
  const detail: string[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({
      label,
      expected: String(exp),
      actual: String(act),
      pass: String(exp) === String(act),
    });

  const { data: dues } = await admin
    .from("dues")
    .select("id, amount, status, issue_date, due_date, journal_entry_id, source_type, unit_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: entries } = await admin
    .from("journal_entries")
    .select("id, status, entry_date, fiscal_period_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

  const april = await periodByMonth(admin, organizationId, APRIL_PERIOD);

  const { data: accounts } = await admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", organizationId);
  const idByCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  const rentDues = (dues ?? []).filter((d) => d.source_type === "LEASE_RENT");
  const q2Dues = rentDues.filter((d) => d.issue_date === "2026-04-01");

  // ---- per Q2 due --------------------------------------------------------
  const problems: string[] = [];
  for (const due of q2Dues) {
    if (due.status !== "ISSUED") problems.push(`${due.id}: status ${due.status}`);
    if (due.issue_date !== "2026-04-01") problems.push(`${due.id}: issue_date ${due.issue_date}`);
    if (due.due_date !== "2026-04-01") problems.push(`${due.id}: due_date ${due.due_date}`);
    if (!due.journal_entry_id) {
      problems.push(`${due.id}: not posted (journal_entry_id null)`);
      continue;
    }
    const entry = entryById.get(due.journal_entry_id);
    if (!entry) problems.push(`${due.id}: journal entry missing`);
    else {
      if (entry.status !== "POSTED") problems.push(`${due.id}: journal ${entry.status}`);
      if (entry.fiscal_period_id !== april?.id) problems.push(`${due.id}: posted outside April`);
    }
  }
  add("every Q2 due ISSUED and POSTED into April", 0, problems.length);
  detail.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  // ---- lines, across the WHOLE rent set -----------------------------------
  const entryIds = rentDues.map((d) => d.journal_entry_id).filter(Boolean) as string[];
  const { data: jLines } = await admin
    .from("journal_entry_lines")
    .select("journal_entry_id, account_id, debit, credit")
    .in("journal_entry_id", entryIds.length > 0 ? entryIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);

  const receivable = idByCode.get("1130");
  const rental = idByCode.get("4400");

  let debitTotal = 0;
  let creditTotal = 0;
  const wrongAccount: string[] = [];
  const perEntry = new Map<string, { dr: number; cr: number }>();
  for (const line of jLines ?? []) {
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

  // Per entry, not just in aggregate: two entries wrong by equal and opposite
  // amounts would leave the total balanced.
  const unbalanced = [...perEntry.entries()].filter(([, v]) => v.dr.toFixed(2) !== v.cr.toFixed(2));

  add("Dr 1130 / Cr 4400 on every rent line", 0, wrongAccount.length);
  add("every journal entry balances", 0, unbalanced.length);
  add("posted rent journal entries", expected.totalCount, entryIds.length);

  // ---- aggregates ---------------------------------------------------------
  const q2Total = q2Dues.reduce((s, d) => s + Number(d.amount), 0);
  const rentTotal = rentDues.reduce((s, d) => s + Number(d.amount), 0);

  add("Q2 dues", expected.q2Count, q2Dues.length);
  add("Q2 rent", expected.q2Amount.toFixed(2), q2Total.toFixed(2));
  add("rent dues after Q2", expected.totalCount, rentDues.length);
  add("rent billed after Q2", expected.totalAmount.toFixed(2), rentTotal.toFixed(2));
  add("AR control = dues subledger", rentTotal.toFixed(2), debitTotal.toFixed(2));
  add("rent revenue = rent dues", rentTotal.toFixed(2), creditTotal.toFixed(2));
  add("trial balance delta", "0.00", (debitTotal - creditTotal).toFixed(2));

  // ---- nothing else moved -------------------------------------------------
  const { count: payments } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  add("payments created", 0, payments ?? -1);

  const foreign = (dues ?? []).filter((d) => d.source_type !== "LEASE_RENT");
  add("dues this stage did not create", 0, foreign.length);

  // ---- audit chain --------------------------------------------------------
  const { data: chain } = await (admin as unknown as UntypedRpc).rpc(
    "verify_financial_audit_chain",
    { p_organization_id: organizationId },
  );
  const events = (chain ?? []) as Array<{ is_valid: boolean }>;
  add("audit chain events", rentDues.length, events.length);
  add("audit chain all valid", true, events.every((e) => e.is_valid));

  const lines = ["Q2 VERIFICATION (read from the ledger)", "-".repeat(72)];
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(42)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  if (detail.length > 0) lines.push("", ...detail);

  const pass = checks.every((c) => c.pass);
  lines.push("", `F2 Q2 COMMERCIAL RENT   ${pass ? "PASS" : "FAIL"}`);

  return { pass, checks, text: lines.join("\n") };
}

/** The fiscal state, read back after April is closed again. */
export async function renderFiscalState(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ text: string; byMonth: Record<string, string> }> {
  const { data } = await admin
    .from("fiscal_periods")
    .select("start_date, status")
    .eq("organization_id", organizationId)
    .order("start_date");

  const byMonth: Record<string, string> = {};
  const lines = ["FISCAL STATE", "-".repeat(72)];
  for (const p of data ?? []) {
    const month = p.start_date.slice(0, 7);
    byMonth[month] = p.status;
    lines.push(`  ${month}   ${p.status}`);
  }
  return { text: lines.join("\n"), byMonth };
}
