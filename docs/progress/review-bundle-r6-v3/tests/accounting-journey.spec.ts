/**
 * Phase 2 — one connected accounting journey, performed through the UI by an accountant session.
 *
 * FIXED BEFORE EXECUTION (organization: Palm Village Owners Association, currency EGP, one unit A-101 owned
 * by one member; chart of accounts = the shipped RESORT_STANDARD template):
 *
 *   step  date        operation (UI)                         journal entry produced
 *   ----  ----------  -------------------------------------  ----------------------------------------------
 *   S1    2025-12-31  opening balance 10,000 (member page)    Dr 1130 Receivables 10,000 / Cr 3900 Opening balances 10,000
 *   S2    2026-02-01  new due 2,000, due 2026-02-15           Dr 1130 Receivables  2,000 / Cr 4100 Revenue 2,000
 *   S3    2026-02-10  receipt #1  1,500 (cash, on the new due) Dr 1110 Cash 1,500 / Cr 1130 1,500
 *   S4    2026-02-12  receipt #2    500 (cash, on the new due) Dr 1110 Cash   500 / Cr 1130   500
 *   S5    today       reverse receipt #2 in full             Dr 1130 500 / Cr 1110 500 (original -> REVERSED)
 *
 * EXPECTED RESULT: net collected 1,500; outstanding 10,500 (opening due 10,000 + new due 500).
 * Report period for the trial balance: 2026-01-01 .. 2026-12-31 (the reversal is dated today; run in 2026).
 *   closing balances  1130 Dr 10,500 · 1110 Dr 1,500 · 3900 Cr 10,000 · 4100 Cr 2,000 · totals Dr = Cr = 12,000
 *   opening balances  1130 Dr 10,000 · 3900 Cr 10,000 (carried in from 2025)
 *
 * The service key creates the organization/users and master data only (helpers/accounting-fixture.ts).
 */
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, loadLatestJourneyFixture, FIXED, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
const SHOTS = "docs/audits/phase2-evidence/screens";
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });


/** navigation with one retry: the dev server compiles each route on first visit and can abort an in-flight request */
async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}

async function signIn(page: Page, email: string) {
  await go(page, "/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** open a Base UI Select (role=combobox) inside the dialog and choose an option by its visible text */
async function choose(page: Page, scope: ReturnType<Page["getByRole"]>, comboboxIndex: number, optionName: RegExp | string) {
  await scope.getByRole("combobox").nth(comboboxIndex).click();
  await page.getByRole("option", { name: optionName }).first().click();
}

const ledger = async () => {
  // independent oracle: balances straight from the journal, service key read only
  const admin = adminClient();
  const { data: entries } = await admin.from("journal_entries").select("id,status,entry_date,description,source_type").eq("organization_id", fx.orgId).order("entry_number");
  const { data: lines } = await admin.from("journal_entry_lines").select("journal_entry_id,account_id,debit,credit").in("journal_entry_id", (entries ?? []).map((e) => e.id));
  // accounts are re-read each time: 3900 (opening-balance equity) is created by the product during S1
  const { data: accts } = await admin.from("chart_of_accounts").select("id,code").eq("organization_id", fx.orgId);
  const code = Object.fromEntries((accts ?? []).map((a) => [a.id as string, a.code as string]));
  return { entries: entries ?? [], lines: (lines ?? []).map((l) => ({ ...l, code: code[l.account_id as string] })) };
};

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = process.env.JOURNEY_REUSE ? await loadLatestJourneyFixture() : await createJourneyFixture("journey");
});

test("S1 opening balance 10,000 dated before the report period", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/members/${fx.member.id}`);
  await page.getByRole("button", { name: /Opening balance/i }).click();
  const dialog = page.locator('[data-slot="dialog-content"][data-open]');
  await expect(dialog.getByText(/Record client opening balance/i)).toBeVisible();
  // the form, or -- when the page read no units (statement timeout on the units/members views) -- a notice: name the environment failure
  await expect(dialog.locator("#ob-amount").or(dialog.getByText(/Link the client to a unit first/i))).toBeVisible({ timeout: 60_000 });
  if (await dialog.getByText(/Link the client to a unit first/i).isVisible()) throw new Error("the opening-balance dialog said 'link the client to a unit first': the member page read NO units for this member (the units/members views answered 500 = statement timeout, which the page shows as empty data); see docs/audits/phase3-evidence/task7-flake-analysis.md");
  await dialog.locator("#ob-amount").fill("10000");
  await dialog.locator("#ob-date").fill(FIXED.openingDate);
  await dialog.locator("#ob-description").fill("Arrears carried forward from 2025");
  await shot(page, "01-opening-balance-dialog");
  await dialog.getByRole("button", { name: /Record balance/i }).click();
  await expect(page.getByText(/Opening balance recorded/i)).toBeVisible({ timeout: 60_000 });

  const { entries, lines } = await ledger();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ status: "POSTED", entry_date: FIXED.openingDate });
  const byCode = (c: string) => lines.filter((l) => l.code === c);
  expect(byCode("1130").map((l) => [Number(l.debit), Number(l.credit)])).toEqual([[10000, 0]]);
  expect(byCode("3900").map((l) => [Number(l.debit), Number(l.credit)])).toEqual([[0, 10000]]);
});

test("S2 new due 2,000 inside the period", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = page.locator('[data-slot="dialog-content"][data-open]');
  await expect(dialog.getByText(/Issue Financial Due/i)).toBeVisible();
  // comboboxes in order: unit, due type, receivable account, fiscal period; every one chosen explicitly (defaults are traps)
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  // The receivable account is NOT touched: it must arrive preselected from the organization's approved setting.
  await expect(dialog.getByRole("combobox").nth(2)).toContainText(/^1130/);
  await expect(dialog.getByTestId("receivable-not-configured")).toHaveCount(0);
  await choose(page, dialog, 3, /2026-02/);
  await dialog.locator('input[type="number"]').fill("2000");
  const dates = dialog.locator('input[type="date"]');
  await dates.nth(0).fill(FIXED.dueIssueDate);
  await dates.nth(1).fill(FIXED.dueDueDate);
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("Annual maintenance fee 2026");
  await shot(page, "02-issue-due-dialog");
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  await expect(page.getByText(/Due Issued Successfully/i)).toBeVisible({ timeout: 60_000 });

  const { entries, lines } = await ledger();
  const due = entries.find((e) => e.entry_date === FIXED.dueIssueDate)!;
  expect(due).toMatchObject({ status: "POSTED" });
  const mine = lines.filter((l) => l.journal_entry_id === due.id).map((l) => `${l.code}:${Number(l.debit)}:${Number(l.credit)}`).sort();
  expect(mine).toEqual(["1130:2000:0", "4100:0:2000"]);
});

async function recordReceipt(page: Page, opts: { dueRegex: RegExp; amount: string; date: string; period: RegExp }) {
  await go(page, "/en/finance/payments");
  await page.getByRole("button", { name: /New Receipt/i }).first().click();
  const dialog = page.locator('[data-slot="dialog-content"][data-open]');
  await expect(dialog.getByText(/Record Payment Receipt/i)).toBeVisible();
  // comboboxes in order: target due, client, method, deposit account (the fiscal period is derived from the date)
  await choose(page, dialog, 0, opts.dueRegex);
  await choose(page, dialog, 1, new RegExp(fx.member.name));
  await choose(page, dialog, 2, /^Cash/i);
  await choose(page, dialog, 3, /^1110\b/);
  await dialog.locator('input[type="number"]').fill(opts.amount);
  await dialog.locator('input[type="date"]').fill(opts.date);
  // the fiscal period now follows the payment date (shown as a label), so it is asserted instead of chosen
  await expect(dialog.getByTestId("auto-period")).toContainText(opts.period);
  return dialog;
}

test("S3 receipt #1: 1,500 on 2026-02-10", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const dialog = await recordReceipt(page, { dueRegex: /Rem: 2,?000/, amount: "1500", date: FIXED.payment1Date, period: /2026-02/ });
  await shot(page, "03-receipt-1-dialog");
  await dialog.getByRole("button", { name: /Record Receipt/i }).click();
  await expect(page.locator('[data-slot="dialog-content"][data-open]')).toHaveCount(0, { timeout: 60_000 });
  await go(page, "/en/finance/payments");
  await expect(page.getByRole("row", { name: /#1\b/ })).toContainText(/1,?500/);
});

test("S4 receipt #2: 500 on 2026-02-12", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const dialog = await recordReceipt(page, { dueRegex: /Rem: 500/, amount: "500", date: FIXED.payment2Date, period: /2026-02/ });
  await dialog.getByRole("button", { name: /Record Receipt/i }).click();
  await expect(page.locator('[data-slot="dialog-content"][data-open]')).toHaveCount(0, { timeout: 60_000 });
  await go(page, "/en/finance/payments");
  await expect(page.getByRole("row", { name: /#2\b/ })).toContainText(/500/);
  await shot(page, "04-receipts-before-reversal");
});

test("S5 reverse receipt #2 in full", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  page.on("dialog", (d) => (d.type() === "confirm" ? d.accept() : d.accept("Receipt entered in error - duplicate of cash handover")));
  await page.getByRole("row", { name: /#2\b/ }).getByRole("button", { name: /Reverse/i }).click();
  // The reversal opens a dialog that requires a reason, then an explicit confirmation.
  await page.getByTestId("void-reason-input").fill("Receipt entered in error - duplicate of cash handover");
  await page.getByTestId("void-receipt-confirm").click();
  await expect(page.getByRole("row", { name: /#2\b/ })).toContainText(/Reversed/i, { timeout: 30_000 });
  await shot(page, "05-receipts-after-reversal");
});

// ---------------------------------------------------------------------------------------------------------
// VERIFICATION: every screen must tell the same story as the ledger.
// ---------------------------------------------------------------------------------------------------------
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_END = `${Math.max(2026, Number(TODAY.slice(0, 4)))}-12-31`;
const num = (s: string | null | undefined) => Number((s ?? "").replace(/[^0-9.\-]/g, "") || "NaN");

async function bodyText(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

test("V1 dues list: remaining 10,500 = opening due 10,000 + new due 500", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  const text = await bodyText(page);
  expect(text).toMatch(/Total Issued Dues 12,000\.00 EGP/);
  expect(text).toMatch(/Total Collected 1,500\.00 EGP/);
  expect(text).toMatch(/Outstanding Balance 10,500\.00 EGP/);
  const newDue = page.getByRole("row", { name: /Annual maintenance fee 2026/ });
  await expect(newDue).toContainText("2,000.00");
  await expect(newDue).toContainText("1,500.00");
  await expect(newDue).toContainText("500.00");
  await expect(newDue).toContainText(/Partial/);
  const opening = page.getByRole("row", { name: /Arrears carried forward from 2025/ });
  await expect(opening).toContainText("10,000.00");
  await expect(opening).toContainText(/Issued/);
  await shot(page, "06-dues-after-journey");
});

test("V2 receipts: #1 posted 1,500, #2 reversed 500 and still visible; collections KPI 1,500", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  const text = await bodyText(page);
  expect(text).toMatch(/Total Collections 1,500\.00 EGP 1 posted receipts/);
  await expect(page.getByRole("row", { name: /#1\b/ })).toContainText(/1,500\.00.*Posted/);
  const r2 = page.getByRole("row", { name: /#2\b/ });
  await expect(r2).toContainText("500.00");
  await expect(r2).toContainText(/Reversed/);
  await expect(r2.getByRole("button", { name: /Reverse/i })).toHaveCount(0); // a reversal cannot be repeated from the UI
  await shot(page, "07-receipts-final");
});

test("V3 owner statement: collected 1,500, outstanding 10,500", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/reports/owner-statement?member=${fx.member.id}`);
  const text = await bodyText(page);
  expect(text).toMatch(/Gross Collected 1,500\s?EGP/);
  expect(text).toMatch(/Net Owner Payout 1,500\s?EGP/);
  const row = page.getByRole("row", { name: new RegExp(fx.unit.code) });
  await expect(row).toContainText("1,500 EGP");
  await expect(row).toContainText("10,500 EGP");
  await shot(page, "08-owner-statement");
});

test("V4 general ledger shows the reversed original AND its mirror: 1130 closes at 10,500, 1110 at 1,500", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const { entries } = await ledger();
  expect(entries.map((e) => e.status)).toEqual(["POSTED", "POSTED", "POSTED", "REVERSED", "POSTED"]);
  const ar = await adminClient().from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("code", "1130").single();
  const cash = await adminClient().from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("code", "1110").single();

  await go(page, `/en/finance/reports/general-ledger?accountId=${ar.data!.id}`);
  const t1 = await bodyText(page);
  for (const entryNo of ["#1", "#2", "#3", "#4", "#5"]) expect(t1).toContain(entryNo);
  expect(t1).toMatch(/Total Debits 12,500\.00 EGP Total Credits 2,000\.00 EGP Closing Running Balance 10,500\.00 EGP/);
  await shot(page, "09-ledger-receivables-1130");

  await go(page, `/en/finance/reports/general-ledger?accountId=${cash.data!.id}`);
  const t2 = await bodyText(page);
  expect(t2).toMatch(/Total Debits 2,000\.00 EGP Total Credits 500\.00 EGP Closing Running Balance 1,500\.00 EGP/);
});

test("V5 trial balance 2026: opening + movement = closing, balanced in all three, prior balance carried in", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/reports/trial-balance?from=${FIXED.reportStart}&asOf=${REPORT_END}`);
  await expect(page.getByTestId("tb-balance-status")).toHaveAttribute("data-balanced", "true");
  const v = async (code: string, col: string) => num(await page.locator(`[data-testid="tb-row-${code}"] [data-col="${col}"]`).getAttribute("data-value"));
  // 1130 receivables: carried in 10,000 from 2025; period Dr 2,500 (2,000 due + 500 reversal) / Cr 2,000 (1,500 + 500)
  expect([await v("1130", "opening-debit"), await v("1130", "period-debit"), await v("1130", "period-credit"), await v("1130", "closing-debit")]).toEqual([10000, 2500, 2000, 10500]);
  // 1110 cash: nothing before 2026; Dr 2,000 / Cr 500; closes at 1,500
  expect([await v("1110", "opening-debit"), await v("1110", "period-debit"), await v("1110", "period-credit"), await v("1110", "closing-debit")]).toEqual([0, 2000, 500, 1500]);
  // 3900 opening-balance equity: Cr 10,000 carried in, no movement
  expect([await v("3900", "opening-credit"), await v("3900", "period-credit"), await v("3900", "closing-credit")]).toEqual([10000, 0, 10000]);
  // 4100 revenue: opens at zero (new fiscal year), Cr 2,000 in the period
  expect([await v("4100", "opening-credit"), await v("4100", "period-credit"), await v("4100", "closing-credit")]).toEqual([0, 2000, 2000]);
  const tot = async (col: string) => num(await page.locator(`[data-testid="tb-total"] [data-col="${col}"]`).getAttribute("data-value"));
  expect([await tot("opening-debit"), await tot("opening-credit")]).toEqual([10000, 10000]);
  expect([await tot("period-debit"), await tot("period-credit")]).toEqual([4500, 4500]);
  expect([await tot("closing-debit"), await tot("closing-credit")]).toEqual([12000, 12000]);
  await expect(page.getByTestId("tb-unclosed-warning")).toHaveCount(0);
  await shot(page, "10-trial-balance-2026");
});

test("V5b trial balance for a period that starts mid-year: balance-sheet accounts carry, income accounts open year-to-date", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/reports/trial-balance?from=2026-03-01&asOf=${REPORT_END}`);
  await expect(page.getByTestId("tb-balance-status")).toHaveAttribute("data-balanced", "true");
  const v = async (code: string, col: string) => num(await page.locator(`[data-testid="tb-row-${code}"] [data-col="${col}"]`).getAttribute("data-value"));
  // before 2026-03-01: receipts 1,500 + 500 are in cash (2,000); AR = 10,000 + 2,000 - 2,000 = 10,000
  expect([await v("1110", "opening-debit"), await v("1110", "period-credit"), await v("1110", "closing-debit")]).toEqual([2000, 500, 1500]);
  expect([await v("1130", "opening-debit"), await v("1130", "period-debit"), await v("1130", "closing-debit")]).toEqual([10000, 500, 10500]);
  // revenue earned in February is year-to-date income, so it OPENS at 2,000 in a March start (same fiscal year)
  expect([await v("4100", "opening-credit"), await v("4100", "period-credit"), await v("4100", "closing-credit")]).toEqual([2000, 0, 2000]);
});

test("V5c trial balance starting in a fiscal year the organization has not defined: earlier result on an explicit unclosed line", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const startYear = Math.max(...fx.fiscalYears) + 1;
  await go(page, `/en/finance/reports/trial-balance?from=${startYear}-01-01&asOf=${startYear}-12-31`);
  await expect(page.getByTestId("tb-balance-status")).toHaveAttribute("data-balanced", "true");
  // no year-end close exists: 2026's result (revenue 2,000) is NOT moved into 3100, it is carried on its own line
  const re = page.locator('[data-testid="tb-row-RE-PRIOR"]');
  await expect(re).toHaveAttribute("data-synthetic", "true");
  expect(num(await re.locator('[data-col="opening-credit"]').getAttribute("data-value"))).toBe(2000);
  await expect(page.locator('[data-testid="tb-row-4100"]')).toHaveCount(0); // an income account has no opening in a new year
  await expect(page.getByTestId("tb-unclosed-warning")).toBeVisible();
  await expect(page.getByTestId("tb-fy-unknown")).toBeVisible();
  // the product must not claim a close it never performed
  await expect(page.getByTestId("tb-note")).toContainText(/year-end closing is not available/i);
  await shot(page, "11-trial-balance-unclosed-prior-year");
});

test("V6 income statement, balance sheet, cash flow and aging agree with the ledger", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/reports/income-statement?start=${FIXED.reportStart}&end=${REPORT_END}`);
  let t = await bodyText(page);
  expect(t).toMatch(/Total Revenue 2,000\.00 EGP Total Expenses 0\.00 EGP Net Surplus \/ Deficit 2,000\.00 EGP/);
  await shot(page, "12-income-statement");

  await go(page, `/en/finance/reports/balance-sheet?asOf=${REPORT_END}`);
  t = await bodyText(page);
  expect(t).toMatch(/Total Assets 12,000\.00 EGP/);
  expect(t).toMatch(/1110 Cash on Hand 1,500\.00/);
  expect(t).toMatch(/1130 Accounts Receivable - Members 10,500\.00/);
  expect(t).toMatch(/3900 Opening Balances - Receivables 10,000\.00/);
  // all activity is in the 2026 fiscal year: the whole result is the current-year result and there is no prior-years line
  expect(t).toMatch(/Current fiscal year result 2,000\.00/);
  expect(t).not.toMatch(/RE-PRIOR|Results of prior years/);
  expect(t).toMatch(/100% Balanced/);
  await shot(page, "13-balance-sheet");

  await go(page, `/en/finance/reports/cash-flow?start=${FIXED.reportStart}&end=${REPORT_END}`);
  t = await bodyText(page);
  expect(t).toMatch(/Opening Cash 0\.00 EGP Net Cash Movement 1,500\.00 EGP Closing Cash 1,500\.00 EGP/);
  expect(t).toMatch(/100% Reconciled/);
  await shot(page, "14-cash-flow");

  await go(page, "/en/finance/reports/aging");
  t = await bodyText(page);
  expect(t).toMatch(/Total Outstanding Receivables: 10,500\.00 EGP/);
  expect(t).toMatch(/Displayed Total 10,500\.00 EGP/);
});

test("V7 ledger integrity: balanced entries, reversal mirrors the original, sub-ledger = ledger, audit chain intact", async () => {
  const admin = adminClient();
  const { entries, lines } = await ledger();
  // every entry balances
  for (const e of entries) {
    const mine = lines.filter((l) => l.journal_entry_id === e.id);
    const dr = mine.reduce((s, l) => s + Number(l.debit), 0);
    const cr = mine.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr, `entry ${e.description} balances`).toBe(cr);
    expect(dr).toBeGreaterThan(0);
  }
  // the reversal (#5) is the mirror of the reversed original (#4): same accounts and amounts, debit/credit swapped
  const original = entries[3];
  const reversal = entries[4];
  expect(original.status).toBe("REVERSED");
  const sig = (id: string, swap: boolean) =>
    lines
      .filter((l) => l.journal_entry_id === id)
      .map((l) => `${l.code}:${swap ? Number(l.credit) : Number(l.debit)}:${swap ? Number(l.debit) : Number(l.credit)}`)
      .sort();
  expect(sig(reversal.id, false)).toEqual(sig(original.id, true));
  expect(reversal.entry_date).toBe(TODAY);

  // ledger balance per account (posted + reversed entries) equals what the sub-ledgers show
  const bal = (code: string) => lines.filter((l) => l.code === code).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  expect([bal("1130"), bal("1110"), bal("3900"), bal("4100")]).toEqual([10500, 1500, -10000, -2000]);
  const { data: dues } = await admin.from("dues").select("amount,status").eq("organization_id", fx.orgId);
  const { data: pays } = await admin
    .from("payments")
    .select("id,amount,status,receipt_number,reversal_journal_entry_id,reversal_reason")
    .eq("organization_id", fx.orgId)
    .order("receipt_number");
  const { data: allocs } = await admin.from("payment_allocations").select("payment_id,amount,reversed_at").in("payment_id", (pays ?? []).map((p) => p.id));
  const totalDue = (dues ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const livePaid = (allocs ?? []).filter((a) => !a.reversed_at).reduce((s, a) => s + Number(a.amount), 0);
  expect([totalDue, livePaid, totalDue - livePaid]).toEqual([12000, 1500, 10500]);
  expect(totalDue - livePaid).toBe(bal("1130")); // sub-ledger outstanding == control account
  expect((pays ?? []).map((p) => [p.receipt_number, Number(p.amount), p.status])).toEqual([[1, 1500, "POSTED"], [2, 500, "REVERSED"]]);
  expect(pays![1].reversal_journal_entry_id).toBe(reversal.id);
  expect(pays![1].reversal_reason).toMatch(/entered in error/);
  // the reversed trail is kept, not deleted: both allocations exist, the second is marked reversed
  expect((allocs ?? []).map((a) => [Number(a.amount), Boolean(a.reversed_at)]).sort()).toEqual([[1500, false], [500, true]]);

  // audit: the financial chain holds OPENING_BALANCE_RECORDED, DUE_ISSUED, PAYMENT_REVERSED and is linked
  const { data: fin } = await admin
    .from("financial_audit_logs")
    .select("action,entity_type,previous_hash,event_hash,metadata")
    .eq("organization_id", fx.orgId)
    .order("occurred_at");
  expect((fin ?? []).map((r) => r.action)).toEqual(["OPENING_BALANCE_RECORDED", "DUE_ISSUED", "PAYMENT_REVERSED"]);
  expect((fin ?? [])[2].previous_hash).toBe((fin ?? [])[1].event_hash);
  expect(String(((fin ?? [])[2].metadata as { reason?: string }).reason)).toMatch(/entered in error/);
  const verified = await admin.rpc("verify_financial_audit_chain", { p_organization_id: fx.orgId });
  expect(verified.error, verified.error?.message).toBeNull();
  expect((verified.data as { is_valid: boolean }[]).every((r) => r.is_valid)).toBe(true);
  const { data: plat } = await admin.from("platform_audit_logs").select("action").eq("organization_id", fx.orgId);
  const kinds = (plat ?? []).map((r) => r.action);
  expect(kinds.filter((a) => a === "payment.recorded")).toHaveLength(2);
  expect(kinds.filter((a) => a === "journal_entry.posted").length).toBeGreaterThanOrEqual(5);
});

test("V8 audit trail screen: the auditor sees the journey's events; the accountant sees the financial chain only", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, fx.auditor.email);
  await go(page, "/en/finance/reports/audit-trail");
  let t = await bodyText(page);
  expect(t).not.toMatch(/No audit trail records found/);
  expect(t).toContain("payment.reversed");
  expect(t).toContain("due.issued");
  expect(t).toContain("opening.balance.recorded");
  expect(t).toContain("payment.recorded");
  expect(t).toMatch(/Receipt entered in error/);
  expect(t).toContain("accountant"); // actor name resolved, not "Another user"
  await shot(page, "15-audit-trail-auditor");

  await page.context().clearCookies();
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/reports/audit-trail");
  t = await bodyText(page);
  expect(t).toContain("payment.reversed");
  expect(t).not.toContain("payment.recorded"); // administrative/platform events need finance.audit.read
});
