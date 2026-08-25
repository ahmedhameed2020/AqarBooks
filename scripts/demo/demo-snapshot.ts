import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";

/**
 * The final state of the demo's financial narrative, read entirely from the
 * ledger.
 *
 * NOTHING HERE IS A TARGET. Every figure is computed from rows that exist:
 * aging comes from what was billed and what was allocated against it, the
 * collection rate is one divided by the other, occupancy is counted from active
 * leases. If a number looks unimpressive, that is the number.
 *
 * The identities at the end are the part that matters. A snapshot that only
 * showed totals could be internally consistent and still describe a broken
 * book; these check that the subledger agrees with the control account, that
 * the ledger balances, that the audit chain verifies, and that nothing is
 * over-allocated or duplicated.
 */

const AS_OF = DEMO_STORY.asOfDate;

export type Check = { label: string; expected: string; actual: string; pass: boolean };

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function bucketOf(dueDate: string, asOf: string): string {
  const a = Date.UTC(...(dueDate.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(asOf.split("-").map(Number) as [number, number, number]));
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 0) return "not yet due";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "over 90";
}

export async function renderDemoSnapshot(
  admin: SupabaseClient<Database>,
  owner: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ pass: boolean; checks: Check[]; text: string }> {
  const checks: Check[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({ label, expected: String(exp), actual: String(act), pass: String(exp) === String(act) });

  const [properties, units, leases, dues, payments, entries, accounts] = await Promise.all([
    admin.from("properties").select("id, code").eq("organization_id", organizationId).range(0, 999),
    admin.from("units").select("id, code, area, property_id, is_active").eq("organization_id", organizationId).range(0, 4999),
    admin.from("unit_leases").select("id, unit_id, status, rent_frequency, rent_amount").eq("organization_id", organizationId).range(0, 4999),
    admin.from("dues").select("id, unit_id, property_id, amount, status, issue_date, due_date, source_type").eq("organization_id", organizationId).range(0, 4999),
    admin.from("payments").select("id, amount, method, payment_date, property_id, journal_entry_id").eq("organization_id", organizationId).range(0, 4999),
    admin.from("journal_entries").select("id, status, entry_date").eq("organization_id", organizationId).range(0, 9999),
    admin.from("chart_of_accounts").select("id, code, name_en").eq("organization_id", organizationId).range(0, 999),
  ]);

  const propertyName = new Map((properties.data ?? []).map((p) => [p.id, p.code]));
  const paymentIds = (payments.data ?? []).map((p) => p.id);
  const { data: allocations } = await admin
    .from("payment_allocations")
    .select("payment_id, due_id, amount")
    .in("payment_id", paymentIds.length > 0 ? paymentIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);

  const allocatedByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    allocatedByDue.set(a.due_id, (allocatedByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }

  const billed = round2((dues.data ?? []).reduce((s, d) => s + Number(d.amount), 0));
  const collected = round2((payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0));
  const outstanding = round2(billed - collected);

  // ---- aging ---------------------------------------------------------------
  const aging = new Map<string, { count: number; amount: number }>();
  for (const due of dues.data ?? []) {
    const open = round2(Number(due.amount) - (allocatedByDue.get(due.id) ?? 0));
    if (open <= 0) continue;
    const bucket = bucketOf(due.due_date, AS_OF);
    const cur = aging.get(bucket) ?? { count: 0, amount: 0 };
    aging.set(bucket, { count: cur.count + 1, amount: round2(cur.amount + open) });
  }
  const agingTotal = round2([...aging.values()].reduce((s, b) => s + b.amount, 0));

  // ---- per property ---------------------------------------------------------
  const perProperty = new Map<string, { billed: number; open: number; units: number; leased: number }>();
  for (const p of properties.data ?? []) {
    perProperty.set(p.id, { billed: 0, open: 0, units: 0, leased: 0 });
  }
  for (const u of units.data ?? []) {
    const row = perProperty.get(u.property_id);
    if (row && u.is_active) row.units++;
  }
  const activeLeaseUnits = new Set(
    (leases.data ?? []).filter((l) => l.status === "ACTIVE").map((l) => l.unit_id),
  );
  for (const u of units.data ?? []) {
    const row = perProperty.get(u.property_id);
    if (row && u.is_active && activeLeaseUnits.has(u.id)) row.leased++;
  }
  for (const due of dues.data ?? []) {
    const row = perProperty.get(due.property_id);
    if (!row) continue;
    row.billed = round2(row.billed + Number(due.amount));
    row.open = round2(row.open + Number(due.amount) - (allocatedByDue.get(due.id) ?? 0));
  }

  // ---- revenue --------------------------------------------------------------
  const codeById = new Map((accounts.data ?? []).map((a) => [a.id, a.code]));
  // Joined rather than filtered by an id list: with several hundred entries an
  // `.in(...)` list overruns the URL PostgREST accepts and returns nothing,
  // which would make every balance below agree with itself at zero.
  const { data: allLines, error: linesError } = await admin
    .from("journal_entry_lines")
    .select("account_id, debit, credit, journal_entries!inner(organization_id, status)")
    .eq("journal_entries.organization_id", organizationId)
    .eq("journal_entries.status", "POSTED")
    .range(0, 49999);
  if (linesError) throw new Error(`journal_entry_lines read failed: ${linesError.message}`);

  const byAccount = new Map<string, { dr: number; cr: number }>();
  for (const l of allLines ?? []) {
    const code = codeById.get(l.account_id) ?? l.account_id;
    const cur = byAccount.get(code) ?? { dr: 0, cr: 0 };
    byAccount.set(code, {
      dr: round2(cur.dr + Number(l.debit ?? 0)),
      cr: round2(cur.cr + Number(l.credit ?? 0)),
    });
  }
  const balance = (code: string) => {
    const b = byAccount.get(code) ?? { dr: 0, cr: 0 };
    return round2(b.dr - b.cr);
  };
  const revenue = (code: string) => {
    const b = byAccount.get(code) ?? { dr: 0, cr: 0 };
    return round2(b.cr - b.dr);
  };

  const tbDebit = round2([...byAccount.values()].reduce((s, b) => s + b.dr, 0));
  const tbCredit = round2([...byAccount.values()].reduce((s, b) => s + b.cr, 0));

  // ---- cashier and bank -----------------------------------------------------
  const [sessions, cashTx, statements, statementLines] = await Promise.all([
    admin.from("cashier_sessions").select("id, status, variance, expected_closing_balance").eq("organization_id", organizationId).range(0, 999),
    admin.from("cash_transactions").select("id, amount, type").eq("organization_id", organizationId).range(0, 9999),
    admin.from("bank_statements").select("id, status, opening_balance, closing_balance").eq("organization_id", organizationId).range(0, 999),
    admin.from("bank_statement_lines").select("id, statement_id, amount, matched_journal_entry_line_id").eq("organization_id", organizationId).range(0, 9999),
  ]);

  // ---- audit chain ----------------------------------------------------------
  const { data: chain } = await (admin as unknown as UntypedRpc).rpc("verify_financial_audit_chain", {
    p_organization_id: organizationId,
  });
  const chainEvents = (chain ?? []) as Array<{ is_valid: boolean }>;

  // ---- identities -----------------------------------------------------------
  add("AR control = AR subledger", outstanding.toFixed(2), balance("1130").toFixed(2));
  add("aging buckets = outstanding", outstanding.toFixed(2), agingTotal.toFixed(2));
  add("trial balance delta", "0.00", round2(tbDebit - tbCredit).toFixed(2));
  add("rent + CAM revenue = billed", billed.toFixed(2), round2(revenue("4400") + revenue("4100")).toFixed(2));
  add(
    "cash + bank = collected",
    collected.toFixed(2),
    round2(balance("1110") + balance("1120")).toFixed(2),
  );
  add(
    "no due over-allocated",
    0,
    (dues.data ?? []).filter((d) => (allocatedByDue.get(d.id) ?? 0) - Number(d.amount) > 0.004).length,
  );
  add(
    "every payment has a posted entry",
    0,
    (payments.data ?? []).filter((p) => {
      const e = (entries.data ?? []).find((x) => x.id === p.journal_entry_id);
      return !e || e.status !== "POSTED";
    }).length,
  );
  add("audit chain all valid", true, chainEvents.every((e) => e.is_valid));
  add(
    "cashier sessions all reconciled",
    0,
    (sessions.data ?? []).filter((s) => s.status !== "RECONCILED" || Number(s.variance ?? -1) !== 0).length,
  );
  add(
    "bank statements all reconciled",
    0,
    (statements.data ?? []).filter((s) => s.status !== "RECONCILED").length,
  );
  add(
    "unmatched statement lines",
    0,
    (statementLines.data ?? []).filter((l) => !l.matched_journal_entry_line_id).length,
  );

  // Business keys: two live leases sharing one identity would give one payer
  // two behaviours, which is the failure the whole stable-key design exists to
  // prevent. Checked here at the end as well as inside the planner.
  const activeKeys = new Map<string, number>();
  for (const l of (leases.data ?? []).filter((x) => x.status === "ACTIVE")) {
    const unit = (units.data ?? []).find((u) => u.id === l.unit_id);
    const key = `${propertyName.get(unit?.property_id ?? "") ?? "?"}:${unit?.code}:${l.rent_frequency}`;
    activeKeys.set(key, (activeKeys.get(key) ?? 0) + 1);
  }
  add("duplicate active lease keys", 0, [...activeKeys.values()].filter((n) => n > 1).length);
  // Anti-vacuity. Every balance above is a sum over these lines, and a read
  // that came back empty would make all of them agree at zero.
  add("journal lines read", true, (allLines ?? []).length > 0);

  // ---- render ---------------------------------------------------------------
  const text: string[] = [];
  const push = (l = "") => text.push(l);

  push("=".repeat(72));
  push(`DEMO FINANCIAL SNAPSHOT   as of ${AS_OF}`);
  push("=".repeat(72));
  push();
  push("Every figure below is read from the ledger. Nothing is a target.");
  push();

  push("PORTFOLIO");
  push("-".repeat(72));
  for (const p of properties.data ?? []) {
    const row = perProperty.get(p.id)!;
    const occupancy = row.units > 0 ? (row.leased / row.units) * 100 : 0;
    push(
      `  ${p.code.padEnd(4)} ${String(row.units).padStart(4)} units` +
        `   ${String(row.leased).padStart(3)} leased  ${occupancy.toFixed(0).padStart(3)}%` +
        `   billed ${row.billed.toFixed(2).padStart(14)}   outstanding ${row.open.toFixed(2).padStart(13)}`,
    );
  }
  push();

  push("RECEIVABLES");
  push("-".repeat(72));
  push(`  billed                        ${billed.toFixed(2).padStart(14)}`);
  push(`  collected                     ${collected.toFixed(2).padStart(14)}`);
  push(`  outstanding                   ${outstanding.toFixed(2).padStart(14)}`);
  push(`  collection rate               ${((collected / billed) * 100).toFixed(1).padStart(13)}%`);
  push();

  push("AGING");
  push("-".repeat(72));
  for (const bucket of ["not yet due", "1-30", "31-60", "61-90", "over 90"]) {
    const b = aging.get(bucket) ?? { count: 0, amount: 0 };
    push(`  ${bucket.padEnd(14)}${String(b.count).padStart(4)} dues  ${b.amount.toFixed(2).padStart(14)}`);
  }
  push();

  push("REVENUE");
  push("-".repeat(72));
  push(`  4400 Rental Income            ${revenue("4400").toFixed(2).padStart(14)}`);
  push(`  4100 Maintenance Fee Revenue  ${revenue("4100").toFixed(2).padStart(14)}`);
  push();

  push("TREASURY");
  push("-".repeat(72));
  push(`  1110 Cash on Hand             ${balance("1110").toFixed(2).padStart(14)}`);
  push(`  1120 Banks                    ${balance("1120").toFixed(2).padStart(14)}`);
  push(`  1130 Accounts Receivable      ${balance("1130").toFixed(2).padStart(14)}`);
  push();

  const byMethod = new Map<string, { count: number; amount: number }>();
  for (const p of payments.data ?? []) {
    const cur = byMethod.get(p.method) ?? { count: 0, amount: 0 };
    byMethod.set(p.method, { count: cur.count + 1, amount: round2(cur.amount + Number(p.amount)) });
  }
  push("COLLECTIONS BY METHOD");
  push("-".repeat(72));
  for (const [method, v] of [...byMethod.entries()].sort()) {
    push(`  ${method.padEnd(16)}${String(v.count).padStart(4)}  ${v.amount.toFixed(2).padStart(14)}`);
  }
  push();

  push("CASHIER");
  push("-".repeat(72));
  push(`  sessions                      ${String((sessions.data ?? []).length).padStart(14)}`);
  push(`  cash transactions             ${String((cashTx.data ?? []).length).padStart(14)}`);
  push(
    `  reconciled with nil variance  ${String(
      (sessions.data ?? []).filter((s) => s.status === "RECONCILED" && Number(s.variance) === 0).length,
    ).padStart(14)}`,
  );
  push();

  push("BANK RECONCILIATION");
  push("-".repeat(72));
  for (const s of statements.data ?? []) {
    const own = (statementLines.data ?? []).filter((l) => l.statement_id === s.id);
    push(
      `  statement ${s.status.padEnd(12)} ${own.length} lines` +
        `   opening ${Number(s.opening_balance).toFixed(2)}   closing ${Number(s.closing_balance).toFixed(2)}`,
    );
  }
  push();

  push("IDENTITIES");
  push("-".repeat(72));
  for (const c of checks) {
    push(
      `  ${c.label.padEnd(38)}${c.actual.padStart(16)}   expected ${c.expected.padStart(16)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }

  const pass = checks.every((c) => c.pass);
  push();
  push("=".repeat(72));
  push(`DEMO FINANCIAL DATASET   ${pass ? "COMPLETE" : "FAILED"}`);
  push("=".repeat(72));

  return { pass, checks, text: text.join("\n") };
}
