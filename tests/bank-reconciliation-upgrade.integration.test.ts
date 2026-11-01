/**
 * Phase 2e — upgrade path for a database that already applied the SUPERSEDED Phase 2c migration (the one with the
 * audited "explain a bank line instead of matching it" exception), WITHOUT rebuilding the database.
 *
 * The superseded text is reproduced exactly in scripts/demo-local/fixtures/phase2c-superseded-explain-exception.sql
 * (9,106 bytes, sha256 75a9fde2…, identical to the file that was shipped in the earlier review bundle). The test:
 *   1. puts the local clean database into the OLD state (columns, trigger, functions, permissive finalize);
 *   2. creates real data in that state: a DRAFT statement whose only line is an explained -15 fee, and a statement that
 *      was RECONCILED under the old rules with an explained line;
 *   3. applies migration 20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql exactly as written;
 *   4. proves: the explain functions, trigger, guard function, constraint and columns are gone; statements, lines and
 *      every existing audit row are intact; one 'explanation_retired' audit row per still-explained line keeps the
 *      original reason; the previously explained line STILL blocks finalize until its entry is booked, posted and
 *      matched; the normal accounting path then finalizes; the migration is idempotent.
 *
 * LOCAL ONLY (clean stack). It leaves the database in the strict state, which is also what a fresh build produces.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addBankAccount, adminClient, createJourneyFixture, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

vi.setConfig({ hookTimeout: 300_000, testTimeout: 180_000 });

const root = process.cwd();
const OLD = readFileSync(join(root, "scripts/demo-local/fixtures/phase2c-superseded-explain-exception.sql"), "utf8");
const UPGRADE = readFileSync(join(root, "supabase/migrations/20261014100000_phase2e_bank_reconciliation_strict_upgrade.sql"), "utf8");
const REASON = "Bank fee for March will be booked with the April bank charges batch";

let fx: JourneyFixture;
let draftStatement = "", draftLine = "", doneStatement = "", doneLine = "", controlStatement = "", controlLine = "";
let before: { lines: unknown; statements: unknown; explainedAudit: number };
const admin = adminClient();

const exists = (q: string) => sql(q) === "t";
const hasFn = (name: string) => exists(`select exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='${name}')`);
const hasCol = (col: string) => exists(`select exists (select 1 from information_schema.columns where table_schema='public' and table_name='bank_statement_lines' and column_name='${col}')`);
const hasTrigger = () => exists(`select exists (select 1 from pg_trigger where tgrelid='public.bank_statement_lines'::regclass and tgname='trg_guard_bank_statement_line_resolution')`);
const finalizeDef = () => sql(`select pg_get_functiondef('public.finalize_bank_reconciliation(uuid)'::regprocedure)`);
const audits = async (action: string) => (await admin.from("platform_audit_logs").select("actor_id,reason,entity_id,safe_change_summary").eq("organization_id", fx.orgId).eq("action", action)).data ?? [];
const dump = async () => ({
  lines: (await admin.from("bank_statement_lines").select("id,statement_id,line_date,description,reference,amount,matched_journal_entry_line_id,sort_order").eq("organization_id", fx.orgId).order("id")).data,
  statements: (await admin.from("bank_statements").select("id,status,reconciled_by,opening_balance,closing_balance,period_start,period_end").eq("organization_id", fx.orgId).order("id")).data,
});

beforeAll(async () => {
  sql(OLD); // OLD state: columns + constraint + trigger + explain/unexplain + permissive finalize
  expect(hasFn("explain_bank_statement_line")).toBe(true);
  expect(hasCol("resolution")).toBe(true);
  expect(hasTrigger()).toBe(true);
  expect(finalizeDef()).toContain("resolution");

  fx = await createJourneyFixture("upgrade", { approveReceivable: false });
  const bank = await addBankAccount(fx);
  const parent = (await admin.from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("code", "5000").single()).data!.id as string;
  const created = await admin.from("chart_of_accounts").insert({ organization_id: fx.orgId, parent_id: parent, code: "5410", name_ar: "رسوم بنكية", name_en: "Bank charges", category: "EXPENSE", normal_balance: "DEBIT", is_group: false, is_active: true }).select("id").single();
  fx.accounts["5410"] = created.data!.id as string;

  const mk = async (start: string, end: string, closing: number, date: string, description: string, amount: number) => {
    const st = (await admin.from("bank_statements").insert({ organization_id: fx.orgId, bank_account_id: bank.bankAccountId, period_start: start, period_end: end, opening_balance: 0, closing_balance: closing, created_by: fx.accountant.id }).select("id").single()).data!.id as string;
    const ln = (await admin.from("bank_statement_lines").insert({ organization_id: fx.orgId, statement_id: st, line_date: date, description, reference: "REF", amount, sort_order: 0 }).select("id").single()).data!.id as string;
    return [st, ln] as const;
  };
  [doneStatement, doneLine] = await mk("2026-02-01", "2026-02-28", -20, "2026-02-28", "February card fee", -20);
  [draftStatement, draftLine] = await mk("2026-03-01", "2026-03-31", -15, "2026-03-31", "Account maintenance fee", -15);
  [controlStatement, controlLine] = await mk("2026-01-01", "2026-01-31", -10, "2026-01-31", "January fee", -10);

  const accountant = await signedInClient(fx.accountant.email);
  for (const id of [doneLine, draftLine, controlLine]) {
    const r = await accountant.rpc("explain_bank_statement_line", { p_line_id: id, p_reason: REASON });
    expect(r.error, r.error?.message).toBeNull();
  }
  // history made under the old rules: these statements were RECONCILED with an explained, unbooked fee. The second one is
  // the NEGATIVE CONTROL: it proves the old state really accepts "zero difference + explained unbooked line".
  for (const st of [doneStatement, controlStatement]) {
    const fin = await accountant.rpc("finalize_bank_reconciliation", { p_statement_id: st });
    expect(fin.error, fin.error?.message).toBeNull();
    expect((await admin.from("bank_statements").select("status").eq("id", st).single()).data!.status).toBe("RECONCILED");
  }
  // and the old finalize would have accepted the draft one too (zero difference + explained line) - not run, it would change the state
  const sum = await accountant.rpc("get_bank_reconciliation_summary", { p_statement_id: draftStatement });
  expect(Number((Array.isArray(sum.data) ? sum.data[0] : sum.data).difference)).toBe(0);

  const d = await dump();
  before = { lines: d.lines, statements: d.statements, explainedAudit: (await audits("finance.bank_statement_line.explained")).length };
  expect(before.explainedAudit).toBe(3);
});

describe("upgrade from the superseded 2c to the strict design (no rebuild)", () => {
  it("applying the upgrade migration succeeds on the old state", () => {
    expect(() => sql(UPGRADE)).not.toThrow();
  });

  it("the explanation mechanism is gone: functions, trigger, guard function, constraint and columns", () => {
    for (const f of ["explain_bank_statement_line", "unexplain_bank_statement_line", "guard_bank_statement_line_resolution"]) expect(hasFn(f), f).toBe(false);
    expect(hasTrigger()).toBe(false);
    for (const c of ["resolution", "resolution_reason", "resolved_by", "resolved_at"]) expect(hasCol(c), c).toBe(false);
    expect(exists(`select exists (select 1 from pg_constraint where conname='bank_statement_lines_resolution_coherent')`)).toBe(false);
    expect(finalizeDef()).not.toContain("resolution");
  });

  it("statements, lines (date, description, reference, amount, match) and the RECONCILED history are untouched", async () => {
    const d = await dump();
    expect(d.lines).toEqual(before.lines);
    expect(d.statements).toEqual(before.statements);
    expect((d.statements as Array<{ id: string; status: string }>).find((s) => s.id === doneStatement)!.status).toBe("RECONCILED");
  });

  it("audit is preserved: earlier events intact, one 'explanation_retired' row per line that was still explained, with the original reason", async () => {
    expect(await audits("finance.bank_statement_line.explained")).toHaveLength(3);
    const retired = await audits("finance.bank_statement_line.explanation_retired");
    // every line was still marked explained at upgrade time (the RECONCILED ones keep their history too)
    expect(retired.map((r) => r.entity_id).sort()).toEqual([doneLine, draftLine, controlLine].sort());
    for (const r of retired) {
      expect(r.reason).toBe(REASON);
      expect(r.safe_change_summary).toMatchObject({ explained_by: fx.accountant.id });
    }
  });

  it("the previously explained line STILL blocks finalize (difference is zero, the line is unbooked)", async () => {
    const accountant = await signedInClient(fx.accountant.email);
    const sum = await accountant.rpc("get_bank_reconciliation_summary", { p_statement_id: draftStatement });
    const row = Array.isArray(sum.data) ? sum.data[0] : sum.data;
    expect([Number(row.difference), Number(row.unmatched_statement_count)]).toEqual([0, 1]);
    const refused = await accountant.rpc("finalize_bank_reconciliation", { p_statement_id: draftStatement });
    expect(refused.error?.message).toMatch(/RECONCILIATION_UNHANDLED_LINES/);
    expect((await admin.from("bank_statements").select("status").eq("id", draftStatement).single()).data!.status).toBe("DRAFT");
    // and the explain route no longer exists
    const gone = await accountant.rpc("explain_bank_statement_line", { p_line_id: draftLine, p_reason: REASON });
    expect(gone.error?.code).toBe("PGRST202");
  });

  it("after booking, posting and matching the fee the same statement finalizes", async () => {
    const accountant = await signedInClient(fx.accountant.email);
    const owner = await signedInClient(fx.owner.email);
    const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-03-31").gte("end_date", "2026-03-31").single()).data!.id as string;
    const created = await accountant.rpc("create_journal_entry", {
      p_organization_id: fx.orgId, p_resort_id: null, p_fiscal_period_id: period, p_entry_date: "2026-03-31", p_description: "Bank maintenance fee March 2026", p_source_type: "JOURNAL_VOUCHER",
      p_lines: [{ account_id: fx.accounts["5410"], debit: 15, credit: 0 }, { account_id: fx.accounts["1120"], debit: 0, credit: 15 }], p_idempotency_key: randomUUID(),
    });
    expect(created.error, created.error?.message).toBeNull();
    expect((await accountant.rpc("submit_journal_entry_for_review", { p_journal_entry_id: created.data as string })).error).toBeNull();
    expect((await owner.rpc("post_journal_entry", { p_journal_entry_id: created.data as string })).error).toBeNull();
    const matched = await accountant.rpc("auto_match_bank_statement", { p_statement_id: draftStatement });
    expect(matched.error, matched.error?.message).toBeNull();
    expect((await admin.from("bank_statement_lines").select("matched_journal_entry_line_id").eq("id", draftLine).single()).data!.matched_journal_entry_line_id).not.toBeNull();
    const fin = await accountant.rpc("finalize_bank_reconciliation", { p_statement_id: draftStatement });
    expect(fin.error, fin.error?.message).toBeNull();
    expect((await admin.from("bank_statements").select("status").eq("id", draftStatement).single()).data!.status).toBe("RECONCILED");
  });

  it("the upgrade is idempotent: running it again changes nothing and raises nothing", async () => {
    const auditBefore = (await audits("finance.bank_statement_line.explanation_retired")).length;
    expect(() => sql(UPGRADE)).not.toThrow();
    expect((await audits("finance.bank_statement_line.explanation_retired")).length).toBe(auditBefore); // no columns -> no new rows
    expect(finalizeDef()).not.toContain("resolution");
  });
});
