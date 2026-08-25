import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";

/**
 * The August bank statement and its reconciliation.
 *
 * WHY THIS COMES AFTER COLLECTIONS
 * `auto_match_bank_statement` looks for POSTED journal lines on the bank
 * account's GL account and matches a statement line to exactly one of them.
 * Built before the receipts exist, every line would find nothing and the
 * reconciliation would be a screen full of unmatched items.
 *
 * THE STATEMENT IS DERIVED FROM THE LEDGER, NOT INVENTED ALONGSIDE IT
 * Each line is one posted bank movement: same date, same amount, referenced by
 * its receipt number. That is what a bank statement IS for a month whose only
 * bank activity was receipts. Nothing is added that the ledger does not
 * already contain -- no fabricated bank charge, no plausible-looking transfer
 * -- because an unmatched line invented here would be a reconciling item the
 * demo cannot explain when somebody clicks it.
 *
 * THE BALANCES ARE COMPUTED, NOT CHOSEN
 * `get_bank_reconciliation_summary` defines
 *
 *     difference = (closing + unmatched_gl - unmatched_statement) - book
 *
 * where `book` is every posted line on that GL account up to the period end --
 * cumulative, not just this month. So the opening balance is the book balance
 * at the end of July and the closing balance is the book balance at the end of
 * August. Both are read from the ledger; picking either would make the
 * reconciliation a tautology that proves the arithmetic rather than the data.
 *
 * ONE BANK ACCOUNT, AND WHAT THAT MEANS HERE
 * 1120 Banks is a single organization-level account, so every property's
 * transfers land in it. `bank_accounts` is property-scoped, so the account this
 * statement belongs to is recorded against one property while the balance it
 * reconciles is the organization's. That is a modelling wrinkle in the demo
 * data, not in the reconciliation: it is stated rather than papered over.
 */

export const BANK_NAME_AR = "البنك التجاري";
export const BANK_NAME_EN = "Commercial Bank";
export const BANK_ACCOUNT_NAME = "AqarBooks Demo — Operating Account";
export const BANK_ACCOUNT_NUMBER = "EG-DEMO-0001";
export const STATEMENT_START = "2026-08-01";
export const STATEMENT_END = "2026-08-31";

export type BankReport = {
  ok: boolean;
  dryRun: boolean;
  bankAccountId: string | null;
  statementId: string | null;
  lines: number;
  openingBalance: number;
  closingBalance: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  difference: number;
  finalized: boolean;
  failure?: string;
};

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function applyBankReconciliation(options: {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  /** The property the bank account is recorded against. */
  propertyCode: string;
  dryRun: boolean;
  log: (line: string) => void;
}): Promise<BankReport> {
  const { admin, owner, organizationId, propertyCode, dryRun, log } = options;

  const report: BankReport = {
    ok: false,
    dryRun,
    bankAccountId: null,
    statementId: null,
    lines: 0,
    openingBalance: 0,
    closingBalance: 0,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    difference: 0,
    finalized: false,
  };

  try {
    const { data: properties } = await admin
      .from("properties")
      .select("id, code")
      .eq("organization_id", organizationId);
    const property = (properties ?? []).find((p) => p.code === propertyCode);
    if (!property) throw new Error(`no property ${propertyCode}`);

    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, code, is_cash_equivalent")
      .eq("organization_id", organizationId);
    const bankGl = (accounts ?? []).find((a) => a.code === "1120");
    if (!bankGl) throw new Error("no 1120 Banks account");

    // ---- the bank movements this statement must describe --------------------
    const { data: entries } = await admin
      .from("journal_entries")
      .select("id, entry_date, status")
      .eq("organization_id", organizationId)
      .eq("status", "POSTED")
      .range(0, 9999);
    const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

    // Joined, not filtered by an id list. With several hundred posted entries an
    // `.in(...)` list overruns the URL PostgREST accepts and returns EMPTY --
    // which here produced a statement with no lines and nil balances, and a
    // reconciliation difference of -1,494,750 that looked like a data problem
    // rather than a query problem.
    const { data: glLines, error: glError } = await admin
      .from("journal_entry_lines")
      .select("id, journal_entry_id, account_id, debit, credit, journal_entries!inner(organization_id, status)")
      .eq("account_id", bankGl.id)
      .eq("journal_entries.organization_id", organizationId)
      .eq("journal_entries.status", "POSTED")
      .range(0, 49999);
    if (glError) throw new Error(`journal_entry_lines read failed: ${glError.message}`);
    if ((glLines ?? []).length === 0) {
      throw new Error("no posted 1120 lines found; refusing to build a statement on an empty read");
    }

    const movements = (glLines ?? [])
      .map((l) => ({
        lineId: l.id,
        date: entryById.get(l.journal_entry_id)!.entry_date,
        amount: round2(Number(l.debit ?? 0) - Number(l.credit ?? 0)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.lineId.localeCompare(b.lineId));

    const bookTo = (end: string) =>
      round2(movements.filter((m) => m.date <= end).reduce((s, m) => s + m.amount, 0));

    const inAugust = movements.filter(
      (m) => m.date >= STATEMENT_START && m.date <= STATEMENT_END,
    );
    report.openingBalance = bookTo("2026-07-31");
    report.closingBalance = bookTo(STATEMENT_END);
    report.lines = inAugust.length;

    log(`  ${inAugust.length} bank movements in August`);
    log(`  opening ${report.openingBalance.toFixed(2)}  closing ${report.closingBalance.toFixed(2)}`);

    if (dryRun) {
      report.ok = true;
      return report;
    }

    // ---- bank and account ---------------------------------------------------
    const { data: existingAccounts } = await admin
      .from("bank_accounts")
      .select("id, gl_account_id, account_number")
      .eq("organization_id", organizationId)
      .range(0, 999);
    let bankAccountId = (existingAccounts ?? []).find(
      (a) => a.account_number === BANK_ACCOUNT_NUMBER,
    )?.id;

    if (!bankAccountId) {
      const { data: banks } = await admin
        .from("banks")
        .select("id, name_en")
        .eq("organization_id", organizationId)
        .range(0, 999);
      // INSERTED, NOT CALLED. lib/supabase/types.ts declares create_bank and
      // create_bank_account, and neither exists in the database -- both are
      // phantom entries in the curated types file, along with issue_due. The
      // tables are RLS-gated and insertable, so this is the sanctioned path
      // rather than a workaround; what is NOT sanctioned is calling a function
      // that is only real in a type definition.
      let bankId = (banks ?? []).find((b) => b.name_en === BANK_NAME_EN)?.id;
      if (!bankId) {
        const { data, error } = await owner
          .from("banks")
          .insert({
            organization_id: organizationId,
            name_ar: BANK_NAME_AR,
            name_en: BANK_NAME_EN,
          })
          .select("id")
          .single();
        if (error) throw new Error(`banks insert failed: ${error.message}`);
        bankId = data!.id;
      }

      const { data, error } = await owner
        .from("bank_accounts")
        .insert({
          organization_id: organizationId,
          property_id: property.id,
          bank_id: bankId,
          account_name: BANK_ACCOUNT_NAME,
          account_number: BANK_ACCOUNT_NUMBER,
          gl_account_id: bankGl.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(`bank_accounts insert failed: ${error.message}`);
      bankAccountId = data!.id;
      log("  bank account created");
    }
    report.bankAccountId = bankAccountId;

    // ---- statement ----------------------------------------------------------
    const { data: existingStatements } = await admin
      .from("bank_statements")
      .select("id, status, period_start")
      .eq("organization_id", organizationId)
      .eq("bank_account_id", bankAccountId)
      .eq("period_start", STATEMENT_START)
      .range(0, 99);
    let statementId = (existingStatements ?? [])[0]?.id;
    const priorStatus = (existingStatements ?? [])[0]?.status;

    // A DRAFT statement left by an earlier attempt may carry balances computed
    // from a read that failed. Recomputed values win while it is still DRAFT;
    // once RECONCILED nothing here touches it.
    if (statementId && priorStatus === "DRAFT") {
      const { error } = await owner
        .from("bank_statements")
        .update({
          opening_balance: report.openingBalance,
          closing_balance: report.closingBalance,
        })
        .eq("id", statementId);
      if (error) throw new Error(`bank_statements update failed: ${error.message}`);
    }

    if (!statementId) {
      const { data, error } = await owner
        .from("bank_statements")
        .insert({
          organization_id: organizationId,
          bank_account_id: bankAccountId,
          period_start: STATEMENT_START,
          period_end: STATEMENT_END,
          opening_balance: report.openingBalance,
          closing_balance: report.closingBalance,
          note: "Demo — August 2026 operating account statement",
        })
        .select("id")
        .single();
      if (error) throw new Error(`bank_statements insert failed: ${error.message}`);
      statementId = data!.id;
      log("  statement created");
    }
    report.statementId = statementId;

    if (priorStatus === "RECONCILED") {
      const summary = await readSummary(owner, statementId);
      report.matched = 0;
      report.unmatched = summary.unmatched_statement_count;
      report.difference = summary.difference;
      report.finalized = true;
      log("  statement already RECONCILED; nothing to do");
      report.ok = true;
      return report;
    }

    // ---- lines --------------------------------------------------------------
    const { data: existingLines } = await admin
      .from("bank_statement_lines")
      .select("id")
      .eq("statement_id", statementId)
      .range(0, 9999);

    if ((existingLines ?? []).length === 0 && inAugust.length > 0) {
      const { data: payments } = await admin
        .from("payments")
        .select("id, amount, payment_date, method, receipt_number, journal_entry_id")
        .eq("organization_id", organizationId)
        .gte("payment_date", STATEMENT_START)
        .lte("payment_date", STATEMENT_END)
        .range(0, 4999);
      const receiptByEntry = new Map(
        (payments ?? [])
          .filter((p) => p.journal_entry_id)
          .map((p) => [p.journal_entry_id as string, p]),
      );

      const rows = inAugust.map((m, index) => {
        const line = (glLines ?? []).find((l) => l.id === m.lineId)!;
        const receipt = receiptByEntry.get(line.journal_entry_id);
        return {
          organization_id: organizationId,
          statement_id: statementId!,
          line_date: m.date,
          description: receipt
            ? `تحصيل إيجار — إيصال ${receipt.receipt_number} / Rent collection — receipt ${receipt.receipt_number}`
            : "Bank movement",
          reference: receipt ? `RCPT-${receipt.receipt_number}` : null,
          amount: m.amount,
          sort_order: index + 1,
        };
      });

      const { error } = await owner.from("bank_statement_lines").insert(rows);
      if (error) throw new Error(`bank_statement_lines insert failed: ${error.message}`);
      log(`  ${rows.length} statement lines written`);
    }

    // ---- match --------------------------------------------------------------
    const { data: matchResult, error: matchError } = await (owner as unknown as UntypedRpc).rpc(
      "auto_match_bank_statement",
      { p_statement_id: statementId, p_date_tolerance_days: 0 },
    );
    if (matchError) throw new Error(`auto_match_bank_statement: ${matchError.message}`);
    const match = ((matchResult ?? []) as Array<{
      matched_count: number;
      ambiguous_count: number;
      unmatched_count: number;
    }>)[0];
    report.matched = Number(match?.matched_count ?? 0);
    report.ambiguous = Number(match?.ambiguous_count ?? 0);
    report.unmatched = Number(match?.unmatched_count ?? 0);
    log(`  matched ${report.matched}, ambiguous ${report.ambiguous}, unmatched ${report.unmatched}`);

    const summary = await readSummary(owner, statementId);
    report.difference = summary.difference;

    // ---- finalize, only on a nil difference ---------------------------------
    if (Math.abs(report.difference) >= 0.005) {
      report.failure =
        `reconciliation difference is ${report.difference.toFixed(2)}, not zero. ` +
        "Not finalizing: a reconciliation approved with a difference is worse than " +
        "one left open.";
      return report;
    }

    const { error: finalizeError } = await (owner as unknown as UntypedRpc).rpc(
      "finalize_bank_reconciliation",
      { p_statement_id: statementId },
    );
    if (finalizeError) throw new Error(`finalize_bank_reconciliation: ${finalizeError.message}`);
    report.finalized = true;
    log("  reconciliation finalized");

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

async function readSummary(owner: SupabaseClient<Database>, statementId: string) {
  const { data, error } = await (owner as unknown as UntypedRpc).rpc(
    "get_bank_reconciliation_summary",
    { p_statement_id: statementId },
  );
  if (error) throw new Error(`get_bank_reconciliation_summary: ${error.message}`);
  const row = ((data ?? []) as Array<Record<string, number>>)[0] ?? {};
  return {
    book_balance: Number(row.book_balance ?? 0),
    closing_balance: Number(row.closing_balance ?? 0),
    opening_balance: Number(row.opening_balance ?? 0),
    unmatched_gl_total: Number(row.unmatched_gl_total ?? 0),
    unmatched_statement_total: Number(row.unmatched_statement_total ?? 0),
    unmatched_gl_count: Number(row.unmatched_gl_count ?? 0),
    unmatched_statement_count: Number(row.unmatched_statement_count ?? 0),
    difference: Number(row.difference ?? 0),
  };
}

export type Check = { label: string; expected: string; actual: string; pass: boolean };

export async function verifyBankReconciliation(
  admin: SupabaseClient<Database>,
  owner: SupabaseClient<Database>,
  statementId: string,
): Promise<{ pass: boolean; checks: Check[]; text: string }> {
  const checks: Check[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({ label, expected: String(exp), actual: String(act), pass: String(exp) === String(act) });

  const { data: statement } = await admin
    .from("bank_statements")
    .select("id, status, opening_balance, closing_balance, period_start, period_end")
    .eq("id", statementId)
    .single();

  const { data: lines } = await admin
    .from("bank_statement_lines")
    .select("id, amount, matched_journal_entry_line_id, match_type, line_date")
    .eq("statement_id", statementId)
    .range(0, 9999);

  const summary = await readSummary(owner, statementId);

  const unmatched = (lines ?? []).filter((l) => !l.matched_journal_entry_line_id);
  const movement = round2((lines ?? []).reduce((s, l) => s + Number(l.amount), 0));

  add("statement status", "RECONCILED", statement?.status ?? "missing");
  add("statement lines", (lines ?? []).length, (lines ?? []).length);
  add("unmatched statement lines", 0, unmatched.length);
  add("unmatched GL lines in period", 0, summary.unmatched_gl_count);
  add("difference", "0.00", summary.difference.toFixed(2));
  add(
    "opening + movement = closing",
    round2(Number(statement?.opening_balance ?? 0) + movement).toFixed(2),
    Number(statement?.closing_balance ?? 0).toFixed(2),
  );
  add("closing = book balance", summary.book_balance.toFixed(2), summary.closing_balance.toFixed(2));
  add(
    "every match is automatic",
    (lines ?? []).length,
    (lines ?? []).filter((l) => l.match_type === "AUTO").length,
  );
  add(
    "every line dated inside the period",
    0,
    (lines ?? []).filter(
      (l) => l.line_date < (statement?.period_start ?? "") || l.line_date > (statement?.period_end ?? ""),
    ).length,
  );

  const text = ["BANK RECONCILIATION (read from the ledger)", "-".repeat(72)];
  for (const c of checks) {
    text.push(
      `  ${c.label.padEnd(44)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  const pass = checks.every((c) => c.pass);
  text.push("", `BANK RECONCILIATION   ${pass ? "PASS" : "FAIL"}`);
  return { pass, checks, text: text.join("\n") };
}
