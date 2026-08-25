import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

/**
 * F1 — May 2026 rent obligations. The first intentional write to the ledger.
 *
 * SCOPE, DELIBERATELY NARROW
 * Rent only, May only, through `generate_lease_rent_dues` only. No direct
 * INSERT, no `issue_dues` substitute, no CAM, no payments, no treasury, no
 * supplier activity. Each of those is dated into a period of its own and gets
 * its own stage.
 *
 * WHY ONLY THE MONTHLY LEASES
 * 41 active leases overlap May: 26 monthly and 15 quarterly. The quarterly ones
 * bill period `2026-Q2`, whose range begins 2026-04-01, and
 * `generate_lease_rent_dues` sets `due_date` to the period start with no way to
 * override it. April is CLOSED, so those dues would be created and then NOT
 * posted -- the dues trigger defers until an OPEN period covers the issue date.
 * Unposted dues sitting in a demo tenant are exactly the state to avoid.
 *
 * So commercial rent is NOT part of this stage. It is a real decision that is
 * still open, and this file refuses to make it silently: the report names the
 * fifteen leases it did not bill and why.
 *
 * WHY MAY IS LEFT OPEN AFTERWARDS
 * A period closes when every event dated inside it is written, not when one
 * stage of them is. May-dated collections and cashier activity are still to
 * come; closing now would mean reopening a historical period later.
 */

export type GeneratedDue = {
  leaseId: string;
  unitCode: string;
  dueId: string | null;
  outcome: string;
};

export type F1Report = {
  ok: boolean;
  dryRun: boolean;
  attempted: number;
  generated: number;
  idempotent: number;
  skipped: Array<{ unitCode: string; reason: string }>;
  dues: GeneratedDue[];
  /** Quarterly leases deliberately not billed by this stage. */
  deferredCommercial: string[];
  failure?: string;
};

export type F1Options = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
  log: (line: string) => void;
};

/**
 * `generate_lease_rent_dues` and `verify_financial_audit_chain` are absent from
 * the curated lib/supabase/types.ts, so the typed client cannot name them. The
 * escape is deliberately narrow -- these two calls only -- rather than
 * hand-editing the generated types a third time and widening the gap between
 * that file and a real regeneration. The drift check in
 * tests/supabase-types-drift.integration.test.ts covers columns, not functions.
 */
type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export const MAY_PERIOD = "2026-05";

export async function applyF1MayRent(options: F1Options): Promise<F1Report> {
  const { admin, owner, organizationId, dryRun, log } = options;
  const report: F1Report = {
    ok: false,
    dryRun,
    attempted: 0,
    generated: 0,
    idempotent: 0,
    skipped: [],
    dues: [],
    deferredCommercial: [],
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
      .select("id, unit_id, rent_frequency, starts_on, ends_on, status")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .range(0, 4999);
    if (error) throw new Error(`unit_leases read failed: ${error.message}`);

    const covers = (l: { starts_on: string; ends_on: string | null }) =>
      l.starts_on <= "2026-05-31" && (l.ends_on ?? "9999-12-31") >= "2026-05-01";

    const monthly = (leases ?? []).filter((l) => l.rent_frequency === "MONTHLY" && covers(l));
    const quarterly = (leases ?? []).filter((l) => l.rent_frequency === "QUARTERLY" && covers(l));

    report.deferredCommercial = quarterly.map((l) => codeByUnit.get(l.unit_id) ?? l.id);
    report.attempted = monthly.length;

    log(`  monthly leases covering May   ${monthly.length}`);
    log(`  quarterly deferred (see note) ${quarterly.length}`);
    log("");

    for (const lease of monthly) {
      const unitCode = codeByUnit.get(lease.unit_id) ?? lease.unit_id;

      if (dryRun) {
        report.dues.push({ leaseId: lease.id, unitCode, dueId: null, outcome: "would generate" });
        continue;
      }

      const { data, error: rpcError } = await (owner as unknown as UntypedRpc).rpc(
        "generate_lease_rent_dues",
        {
          p_organization_id: organizationId,
          p_lease_id: lease.id,
          p_period: MAY_PERIOD,
        },
      );
      if (rpcError) {
        throw new Error(`generate_lease_rent_dues(${unitCode}) failed: ${rpcError.message}`);
      }

      const result = data as {
        generated?: boolean;
        idempotent?: boolean;
        skipped?: boolean;
        reason?: string;
        due_id?: string;
      };

      if (result?.generated) {
        report.generated++;
        report.dues.push({ leaseId: lease.id, unitCode, dueId: result.due_id ?? null, outcome: "generated" });
      } else if (result?.idempotent) {
        report.idempotent++;
        report.dues.push({ leaseId: lease.id, unitCode, dueId: null, outcome: "idempotent" });
      } else {
        report.skipped.push({ unitCode, reason: result?.reason ?? "unknown" });
      }
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    log("");
    log(`FAILED: ${report.failure}`);
    log("Nothing was rolled back. generate_lease_rent_dues is idempotent per");
    log("lease and period, so re-running resumes rather than duplicates.");
    return report;
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Check = { label: string; expected: string; actual: string; pass: boolean };

export type F1Verification = { pass: boolean; checks: Check[]; text: string };

/**
 * Reads the ledger back, never the applier's own account of what it did.
 *
 * The per-due checks matter more than the totals: 26 dues summing correctly
 * while one of them posted to the wrong account would satisfy every aggregate
 * and still be wrong.
 */
export async function verifyF1(
  admin: SupabaseClient<Database>,
  organizationId: string,
  expected: { count: number; amount: number },
): Promise<F1Verification> {
  const checks: Check[] = [];
  const lines: string[] = [];
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

  const { data: periods } = await admin
    .from("fiscal_periods")
    .select("id, start_date, status")
    .eq("organization_id", organizationId);
  const mayPeriod = (periods ?? []).find((p) => p.start_date.startsWith(MAY_PERIOD));

  const { data: accounts } = await admin
    .from("chart_of_accounts")
    .select("id, code")
    .eq("organization_id", organizationId);
  const idByCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

  // ---- per due -----------------------------------------------------------
  const problems: string[] = [];
  for (const due of dues ?? []) {
    if (due.status !== "ISSUED") problems.push(`${due.id}: status ${due.status}`);
    if (!due.journal_entry_id) {
      problems.push(`${due.id}: not posted (journal_entry_id null)`);
      continue;
    }
    const entry = entryById.get(due.journal_entry_id);
    if (!entry) problems.push(`${due.id}: journal entry missing`);
    else {
      if (entry.status !== "POSTED") problems.push(`${due.id}: journal ${entry.status}`);
      if (entry.fiscal_period_id !== mayPeriod?.id) {
        problems.push(`${due.id}: posted outside May`);
      }
    }
    if (due.source_type !== "LEASE_RENT") problems.push(`${due.id}: source ${due.source_type}`);
  }
  add("every due ISSUED and POSTED into May", 0, problems.length);
  if (problems.length > 0) lines.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  // ---- lines -------------------------------------------------------------
  const entryIds = (dues ?? []).map((d) => d.journal_entry_id).filter(Boolean) as string[];
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
  for (const line of jLines ?? []) {
    debitTotal += Number(line.debit ?? 0);
    creditTotal += Number(line.credit ?? 0);
    const isDebit = Number(line.debit ?? 0) > 0;
    if (isDebit && line.account_id !== receivable) {
      wrongAccount.push(`debit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
    if (!isDebit && line.account_id !== rental) {
      wrongAccount.push(`credit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
  }

  add("Dr 1130 / Cr 4400 on every line", 0, wrongAccount.length);
  add("debits = credits", debitTotal.toFixed(2), creditTotal.toFixed(2));

  // ---- aggregates --------------------------------------------------------
  const dueTotal = (dues ?? []).reduce((s, d) => s + Number(d.amount), 0);
  add("due count = planner May set", expected.count, (dues ?? []).length);
  add("due total = planner May billed", expected.amount.toFixed(2), dueTotal.toFixed(2));
  add("AR control = dues subledger", dueTotal.toFixed(2), debitTotal.toFixed(2));
  add("rent revenue = issued May rent", dueTotal.toFixed(2), creditTotal.toFixed(2));
  add("trial balance delta", "0.00", (debitTotal - creditTotal).toFixed(2));

  // ---- audit chain -------------------------------------------------------
  const { data: chain } = await (admin as unknown as UntypedRpc).rpc(
    "verify_financial_audit_chain",
    { p_organization_id: organizationId },
  );
  const events = (chain ?? []) as Array<{ is_valid: boolean }>;
  add("audit chain events", (dues ?? []).length, events.length);
  add("audit chain all valid", true, events.every((e) => e.is_valid));

  // ---- May still open ----------------------------------------------------
  add("May still OPEN", "OPEN", mayPeriod?.status ?? "missing");

  lines.unshift("F1 VERIFICATION", "-".repeat(72));
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(38)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }

  const pass = checks.every((c) => c.pass);
  lines.push("");
  lines.push(`F1 MAY RENT   ${pass ? "PASS" : "FAIL"}`);

  return { pass, checks, text: lines.join("\n") };
}

/**
 * Everything the narrative still intends to write with a date inside May.
 *
 * May cannot close while this is non-empty: a period closes when every event
 * dated inside it exists, not when one stage of them does.
 */
export async function mayCompletenessForecast(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<string> {
  const lines = ["MAY COMPLETENESS FORECAST", "-".repeat(72), ""];

  const { data: dues } = await admin
    .from("dues")
    .select("id, amount")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  // Payments settle May dues a few days after issue, so they are May-dated.
  // Their exact count comes from the collection plan, which is rebuilt from
  // the ledger rather than asserted here.
  lines.push("  WRITTEN");
  lines.push(`    May rent obligations                ${(dues ?? []).length}`);
  lines.push("");
  lines.push("  STILL TO COME, DATED INSIDE MAY");
  lines.push("    collections against May rent        planner-derived, not yet written");
  lines.push("    cashier session activity            if any May receipt is CASH");
  lines.push("    supplier invoices dated in May      none currently planned");
  lines.push("");
  lines.push("  NOT MAY-DATED, SO NOT BLOCKING");
  lines.push("    CAM levy                            August");
  lines.push("    bank statement / reconciliation     August");
  lines.push("");
  lines.push("  VERDICT: May must stay OPEN. Collections against these obligations");
  lines.push("  are dated inside May and have not been written.");

  return lines.join("\n");
}
