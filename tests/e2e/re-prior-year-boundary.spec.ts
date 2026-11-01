/**
 * Phase 2b — RE-PRIOR across the 2025 -> 2026 fiscal-year boundary.
 *
 * WHAT RE-PRIOR IS (stated before proving it): a COMPUTED DISPLAY LINE returned by get_trial_balance_with_opening
 * (is_synthetic = true). It is the net result of fiscal years that were never closed, so that the opening column
 * of a trial balance / balance sheet balances without inventing an entry. It is not an account, not a journal entry,
 * and nothing is ever written for it. No year-end close exists and none is run.
 *
 * FIXED BEFORE EXECUTION (fiscal years 2025 and 2026, both OPEN, none closed; all entries posted)
 *   E1 2025-03-01  Dr cash 1,000 / Cr revenue 1,000
 *   E2 2025-06-01  Dr expense 200 / Cr cash 200            -> 2025 result = +800
 *   E3 2026-01-05  Dr cash 400 / Cr retained earnings 3100 400
 *   E4 2026-02-10  Dr cash 300 / Cr revenue 300
 *   E5 2026-02-11  Dr expense 50 / Cr cash 50              -> 2026 result to 2026-02-28 = +250
 *   P1 not a ledger fact: counts of entries/lines/audit rows and the chart of accounts are identical before and after
 *      calling the report RPC and loading the trial balance and balance sheet screens; no account or line is "RE-PRIOR".
 *   P2 no double counting, continuity: 2025 trial balance closes revenue 1,000 / expense 200 / RE-PRIOR 0;
 *      2026-01-01..2026-02-28 opens revenue 0 / expense 0 / RE-PRIOR credit 800 = the 2025 result;
 *      cash opens at 800 = its 2025 closing; Σ(P&L closing) + RE-PRIOR = cumulative result 1,050 = 800 + 250.
 *   P3 balance sheet: 2025-12-31 assets 800 = equity 800 (prior 0, current-year result 800);
 *      2026-02-28 assets 1,450 = retained earnings 400 + prior years 800 + current-year result 250 = 1,450;
 *      the screen shows the prior-years line (800) only for 2026 and says Balanced.
 *   P4 nothing was closed automatically: no fiscal year/period is CLOSED or LOCKED, still exactly 5 entries.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

type Row = { account_id: string; code: string; category: string; normal_balance: string; opening_balance: string; closing_balance: string; opening_credit: string; opening_debit: string; closing_debit: string; closing_credit: string; period_debit: string; period_credit: string; is_synthetic: boolean };
const n = (v: string | number) => Number(v);
let fx: JourneyFixture;
let expenseId = "";

async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
const snapshot = async () => {
  const admin = adminClient();
  const c = async (t: string) => (await admin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId)).count ?? 0;
  const lines = (await admin.from("journal_entries").select("id").eq("organization_id", fx.orgId)).data ?? [];
  const l = (await admin.from("journal_entry_lines").select("id", { count: "exact", head: true }).in("journal_entry_id", lines.map((x) => x.id))).count ?? 0;
  return { entries: await c("journal_entries"), lines: l, accounts: await c("chart_of_accounts"), financialAudit: await c("financial_audit_logs"), years: await c("fiscal_years") };
};
const tb = async (from: string, to: string) => {
  const session = await signedInClient(fx.accountant.email);
  const res = await session.rpc("get_trial_balance_with_opening", { p_organization_id: fx.orgId, p_start_date: from, p_end_date: to });
  expect(res.error, res.error?.message).toBeNull();
  return res.data as Row[];
};
const by = (rows: Row[], id: string) => rows.find((r) => r.account_id === id)!;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("reprior", { approveReceivable: false });
  const admin = adminClient();
  const owner = await signedInClient(fx.owner.email);
  expenseId = (await admin.from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("category", "EXPENSE").eq("is_group", false).order("code").limit(1).single()).data!.id as string;
  const period = async (date: string) => (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", date).gte("end_date", date).single()).data!.id as string;
  const post = async (date: string, dr: string, cr: string, amount: number, tag: string) => {
    const created = await owner.rpc("create_journal_entry", {
      p_organization_id: fx.orgId, p_resort_id: null, p_fiscal_period_id: await period(date), p_entry_date: date, p_description: tag, p_source_type: "JOURNAL_VOUCHER",
      p_lines: [{ account_id: dr, debit: amount, credit: 0 }, { account_id: cr, debit: 0, credit: amount }], p_idempotency_key: randomUUID(),
    });
    expect(created.error, `${tag}: ${created.error?.message}`).toBeNull();
    expect((await owner.rpc("submit_journal_entry_for_review", { p_journal_entry_id: created.data as string })).error).toBeNull();
    expect((await owner.rpc("post_journal_entry", { p_journal_entry_id: created.data as string })).error).toBeNull();
  };
  const cash = fx.accounts["1110"], rev = fx.accounts["4100"], re = fx.accounts["3100"];
  await post("2025-03-01", cash, rev, 1000, "E1");
  await post("2025-06-01", expenseId, cash, 200, "E2");
  await post("2026-01-05", cash, re, 400, "E3");
  await post("2026-02-10", cash, rev, 300, "E4");
  await post("2026-02-11", expenseId, cash, 50, "E5");
});

test("P1 RE-PRIOR is a computed line: reading it (RPC and both screens) writes nothing and no account/line named RE-PRIOR exists", async ({ page }) => {
  const before = await snapshot();
  expect(before.entries).toBe(5);
  const rows = await tb("2026-01-01", "2026-02-28");
  expect(rows.filter((r) => r.is_synthetic).map((r) => r.code)).toEqual(["RE-PRIOR"]);
  await tb("2026-01-01", "2026-02-28");
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/reports/trial-balance?from=2026-01-01&asOf=2026-02-28");
  await expect(page.getByText("RE-PRIOR").first()).toBeVisible({ timeout: 60_000 });
  await go(page, "/en/finance/reports/balance-sheet?asOf=2026-02-28");
  await expect(page.getByTestId("bs-prior-results")).toBeVisible({ timeout: 60_000 });
  expect(await snapshot()).toEqual(before);

  const admin = adminClient();
  expect((await admin.from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).ilike("code", "%RE-PRIOR%")).data).toHaveLength(0);
  // the synthetic line carries no account id at all: it cannot be referenced by any journal line
  expect(rows.find((r) => r.is_synthetic)!.account_id).toBeNull();
  const orphanLines = await admin.from("journal_entry_lines").select("id", { count: "exact", head: true }).is("account_id", null);
  expect(orphanLines.count ?? 0).toBe(0);
});

// PRE-CLOSING state: no year-end close exists. RE-PRIOR (800) is still a computed line in the 2026 opening column.
// The POST-CLOSING expectation for the same boundary is the skipped placeholder at the end of this file.
test("P2 PRE-CLOSING state: no double counting and continuity across 2025 -> 2026 (no year closed yet)", async () => {
  const y2025 = await tb("2025-01-01", "2025-12-31");
  expect(y2025.some((r) => r.is_synthetic && (n(r.opening_credit) !== 0 || n(r.closing_credit) !== 0 || n(r.closing_debit) !== 0))).toBe(false); // no earlier year
  expect(n(by(y2025, fx.accounts["4100"]).closing_balance)).toBe(1000);
  expect(n(by(y2025, expenseId).closing_balance)).toBe(200);
  const cash2025 = n(by(y2025, fx.accounts["1110"]).closing_balance);
  expect(cash2025).toBe(800);

  const y2026 = await tb("2026-01-01", "2026-02-28");
  const prior = y2026.find((r) => r.is_synthetic)!;
  expect(n(prior.opening_credit)).toBe(800); // = the 2025 result, once
  expect(n(by(y2026, fx.accounts["4100"]).opening_balance)).toBe(0);
  expect(n(by(y2026, expenseId).opening_balance)).toBe(0);
  expect(n(by(y2026, fx.accounts["1110"]).opening_balance)).toBe(cash2025); // balance-sheet account carries over
  expect(n(by(y2026, fx.accounts["4100"]).closing_balance)).toBe(300);
  expect(n(by(y2026, expenseId).closing_balance)).toBe(50);

  // sum of every P&L account's closing (+) RE-PRIOR = the cumulative result since inception
  const pnl = y2026.filter((r) => !r.is_synthetic && (r.category === "REVENUE" || r.category === "EXPENSE")).reduce((s, r) => s + (r.category === "REVENUE" ? n(r.closing_balance) : -n(r.closing_balance)), 0);
  expect(pnl + n(prior.closing_credit) - n(prior.closing_debit)).toBe(1050);
  // and each column of the 2026 trial balance balances
  const sum = (k: keyof Row) => y2026.reduce((s, r) => s + n(r[k] as string), 0);
  expect(sum("opening_debit")).toBeCloseTo(sum("opening_credit"), 2);
  expect(sum("closing_debit")).toBeCloseTo(sum("closing_credit"), 2);

  // a year that starts later in the same year: the same prior result, still counted once
  const march = await tb("2026-03-01", "2026-03-31");
  const priorMarch = march.find((r) => r.is_synthetic)!;
  expect(n(priorMarch.opening_credit)).toBe(800);
  expect(n(by(march, fx.accounts["4100"]).opening_balance)).toBe(300); // income opens year-to-date
});

test("P3 the balance sheet agrees with the trial balance on both sides of the boundary", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const text = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");

  await go(page, "/en/finance/reports/balance-sheet?asOf=2025-12-31");
  await expect(page.getByTestId("bs-current-result")).toContainText("800", { timeout: 60_000 });
  await expect(page.getByTestId("bs-prior-results")).toHaveCount(0);
  expect(await text()).toMatch(/Balanced/i);

  await go(page, "/en/finance/reports/balance-sheet?asOf=2026-02-28");
  await expect(page.getByTestId("bs-prior-results")).toContainText("800", { timeout: 60_000 });
  await expect(page.getByTestId("bs-current-result")).toContainText("250");
  const t = await text();
  expect(t).toMatch(/Balanced/i);
  expect(t).toMatch(/1,450\.00/); // total assets = total liabilities & equity
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/40-balance-sheet-prior-years.png", fullPage: true });
  await go(page, "/en/finance/reports/trial-balance?from=2026-01-01&asOf=2026-02-28");
  await expect(page.getByText("RE-PRIOR").first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/41-trial-balance-re-prior.png", fullPage: true });

  // same numbers from the data: assets = liabilities + equity (retained earnings + RE-PRIOR + current-year result)
  const rows = await tb("2026-01-01", "2026-02-28");
  const bal = (cat: string) => rows.filter((r) => !r.is_synthetic && r.category === cat).reduce((s, r) => s + n(r.closing_balance), 0);
  const prior = rows.find((r) => r.is_synthetic)!;
  const equity = bal("EQUITY") + n(prior.closing_credit) - n(prior.closing_debit) + (bal("REVENUE") - bal("EXPENSE"));
  expect(bal("ASSET")).toBe(1450);
  expect(bal("ASSET")).toBeCloseTo(bal("LIABILITY") + equity, 2);
});

test("P4 nothing was closed automatically", async () => {
  const admin = adminClient();
  const years = (await admin.from("fiscal_years").select("name,status").eq("organization_id", fx.orgId)).data ?? [];
  expect(years.every((y) => !["CLOSED", "LOCKED"].includes(String(y.status)))).toBe(true);
  const periods = (await admin.from("fiscal_periods").select("status").eq("organization_id", fx.orgId)).data ?? [];
  expect(periods.every((p) => !["CLOSED", "LOCKED"].includes(String(p.status)))).toBe(true);
  expect((await snapshot()).entries).toBe(5);
});

// POST-CLOSING expectation, deliberately NOT run yet. It needs the Batch 1B database rehearsal (year-end close
// engine on a rehearsed database). Expected after closing 2025: RE-PRIOR = 0 in the 2026 opening column and the
// 800 result is carried by retained earnings instead. Enable only after that rehearsal has passed.
test.describe("POST-CLOSING expectations (placeholder, skipped until Batch 1B rehearsal)", () => {
  test.skip("P2 POST-CLOSING: after 2025 is closed, RE-PRIOR = 0 and retained earnings carries 800", async () => {
    // Intentionally empty: no year-end close is run by this suite.
    // Planned assertions: 2026 opening RE-PRIOR credit = 0; retained earnings opening credit = 800;
    // cumulative result still 1,050 = 800 + 250, counted once.
  });
});
