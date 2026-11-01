/**
 * Phase 2 — independent scenario: collection by BANK TRANSFER into the bank, a bank fee that must be BOOKED, and the
 * reconciliation, all through the UI.
 *
 * FIXED BEFORE EXECUTION (fresh organization; accountant session; bank account "Operating account" whose GL account
 * is 1120; the organization has an approved receivable account 1130; a leaf expense account 5410 "Bank charges" is
 * added as master data because the shipped chart has no bank-charges account)
 *
 *   B1  2026-03-01  due 2,000 on A-101 (due 2026-03-15)              Dr 1130 2,000 / Cr 4100 2,000
 *   B2  2026-03-10  receipt 2,000, method BANK TRANSFER, deposit 1120  Dr 1120 2,000 / Cr 1130 2,000
 *                   created in the receipt dialog; payments.method = BANK_TRANSFER; shown as "Transfer", found by the
 *                   Bank-transfer filter and counted in the bank-collections KPI
 *   B3  statement   period 2026-03-01 .. 2026-03-31, opening 0, closing 1,985.00 (what the bank printed)
 *                   bank lines:  2026-03-11  +2,000.00 "Deposit - Mona Hassan"   (the receipt)
 *                                2026-03-31     -15.00 "Account maintenance fee" (NOT yet in the books)
 *   Reconciliation formula (get_bank_reconciliation_summary):
 *       difference = (closing + unmatched book lines - unmatched bank lines) - book balance
 *   B4  only the deposit imported + auto-matched: difference = (1,985 + 0 - 0) - 2,000 = -15, UNEXPLAINED ->
 *       finalize disabled in the UI AND refused by the database (RECONCILIATION_NOT_BALANCED); statement stays DRAFT
 *   B5  second auto-match changes nothing; one journal line cannot back two statement lines (DB 23505). The fee line
 *       is imported: the arithmetic difference becomes 0 only because the bank-only item is a reconciling item - the
 *       books still say 1120 = 2,000 while the bank says 1,985: importing a line does NOT record the expense, and
 *       finalize is REFUSED by the database (RECONCILIATION_UNHANDLED_LINES) because the line is unmatched and unexplained.
 *   B6  the accountant books the fee through the journal UI: 2026-03-31 Dr 5410 Bank charges 15 / Cr 1120 15, submits it
 *       for review; the owner (the only holder of finance.entries.post) posts it.  Then 1120 = 1,985.
 *   B7  auto-match links the -15 line to that entry's 1120 credit line; summary: book 1,985 = closing 1,985, unmatched
 *       book 0, unmatched bank 0, difference 0; finalize -> RECONCILED; NO statement line is left unmatched.
 *   B8  books: 1120 = 1,985 · 5410 = 15 · 1130 = 0 · 4100 = -2,000; ledger of 1120 closes at 1,985; debits = credits.
 */
import { test, expect } from "./helpers/local-only";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { addBankAccount, adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
let bank: { bankAccountId: string; name: string };
let statementId = "";
const SHOTS = "docs/audits/phase2-evidence/screens";
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const dialogScope = (page: Page) => page.locator('[data-slot="dialog-content"][data-open]');

async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
async function signIn(page: Page, email: string) {
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
async function choose(page: Page, scope: ReturnType<Page["locator"]>, index: number, option: RegExp | string) {
  await scope.getByRole("combobox").nth(index).click();
  await page.getByRole("option", { name: option }).first().click();
}
const text = async (page: Page) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
};
const statementRow = async () => {
  const { data } = await adminClient().from("bank_statements").select("id,status,reconciled_by,closing_balance,opening_balance").eq("id", statementId).single();
  return data!;
};
const lines = async () => {
  const { data } = await adminClient().from("bank_statement_lines").select("id,amount,description,matched_journal_entry_line_id,match_type").eq("statement_id", statementId).order("amount", { ascending: false });
  return data ?? [];
};

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("bank");
  bank = await addBankAccount(fx);
  // The shipped RESORT_STANDARD chart has no bank-charges account (logged as a gap); add a leaf under 5000.
  const parent = (await adminClient().from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("code", "5000").single()).data!.id as string;
  const created = await adminClient().from("chart_of_accounts").insert({ organization_id: fx.orgId, parent_id: parent, code: "5410", name_ar: "رسوم بنكية", name_en: "Bank charges", category: "EXPENSE", normal_balance: "DEBIT", is_group: false, is_active: true }).select("id").single();
  if (created.error) throw new Error(created.error.message);
  fx.accounts["5410"] = created.data.id as string;
});

test("B1 due 2,000 issued on 2026-03-01", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/dues");
  await page.getByRole("button", { name: /Issue Due/i }).first().click();
  const dialog = dialogScope(page);
  await choose(page, dialog, 0, new RegExp(fx.unit.code));
  await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
  await expect(dialog.getByRole("combobox").nth(2)).toContainText(/^1130/); // preselected from the approved setting, not chosen here
  await choose(page, dialog, 3, /2026-03/);
  await dialog.locator('input[type="number"]').fill("2000");
  await dialog.locator('input[type="date"]').nth(0).fill("2026-03-01");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-03-15");
  await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("March service charge");
  await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
  await expect(page.getByText(/Due Issued Successfully/i)).toBeVisible({ timeout: 60_000 });
});

test("B2 bank transfer 2,000 on 2026-03-10, created in the receipt dialog, into the bank GL account", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  await page.getByRole("button", { name: /New Receipt/i }).first().click();
  const dialog = dialogScope(page);
  await choose(page, dialog, 0, /Rem: 2,?000/);
  await choose(page, dialog, 1, new RegExp(fx.member.name));
  await choose(page, dialog, 2, /^Bank transfer/i); // a real Bank Transfer, not a Cheque
  await choose(page, dialog, 3, /^1120\b/);
  await dialog.locator('input[type="number"]').fill("2000");
  await dialog.locator('input[type="date"]').fill("2026-03-10");
  // the fiscal period now follows the payment date (shown as a label), so it is asserted instead of chosen
  await expect(dialog.getByTestId("auto-period")).toContainText(/2026-03/);
  await shot(page, "03-receipt-bank-transfer-dialog");
  await dialog.getByRole("button", { name: /Record Receipt/i }).click();
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });

  const admin = adminClient();
  const { data: je } = await admin.from("journal_entries").select("id,status,entry_date").eq("organization_id", fx.orgId).eq("entry_date", "2026-03-10").single();
  expect(je).toMatchObject({ status: "POSTED" });
  const { data: l } = await admin.from("journal_entry_lines").select("account_id,debit,credit").eq("journal_entry_id", je!.id);
  const bankLine = l!.find((x) => x.account_id === fx.accounts["1120"])!;
  expect([Number(bankLine.debit), Number(bankLine.credit)]).toEqual([2000, 0]);
  // classified as a bank transfer in the database ...
  const { data: pay } = await admin.from("payments").select("method,status,amount").eq("organization_id", fx.orgId).single();
  expect(pay).toMatchObject({ method: "BANK_TRANSFER", status: "POSTED" });

  // ... and in the reports: the badge, the method filter, and the "bank collections" KPI
  await go(page, "/en/finance/payments");
  const row = page.getByRole("row", { name: /#1\b/ });
  await expect(row).toContainText("Transfer", { timeout: 60_000 });
  await expect(row).not.toContainText(/Cheque/i);
  await page.getByRole("combobox").filter({ hasText: /All Methods/i }).click();
  await page.getByRole("option", { name: /Bank Transfer/i }).click();
  await expect(page.getByRole("row", { name: /#1\b/ })).toBeVisible();
  await shot(page, "03-receipt-bank-transfer");
  const kpi = (await adminClient().from("payments").select("amount,method,status").eq("organization_id", fx.orgId)).data!.filter((p) => ["BANK_TRANSFER", "CHEQUE", "ONLINE"].includes(p.method as string) && p.status === "POSTED").reduce((a, p) => a + Number(p.amount), 0);
  expect(kpi).toBe(2000);
});

test("B3 create the statement (closing 1,985.00) and import only the deposit line", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/banks/reconciliation");
  await page.getByRole("button", { name: /New Statement/i }).first().click();
  const dialog = dialogScope(page);
  await expect(dialog.getByText(/New Bank Statement for Reconciliation/i)).toBeVisible();
  await choose(page, dialog, 0, /Operating account|National Bank/i);
  await dialog.locator('input[type="date"]').nth(0).fill("2026-03-01");
  await dialog.locator('input[type="date"]').nth(1).fill("2026-03-31");
  await dialog.locator('input[type="number"]').nth(0).fill("0");
  await dialog.locator('input[type="number"]').nth(1).fill("1985");
  await shot(page, "20-bank-statement-dialog");
  await dialog.getByRole("button", { name: /Create Statement/i }).click();
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });

  const { data: st } = await adminClient().from("bank_statements").select("id,status").eq("organization_id", fx.orgId).eq("bank_account_id", bank.bankAccountId).single();
  expect(st).toMatchObject({ status: "DRAFT" });
  statementId = st!.id;
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await page.locator("#raw").fill("2026-03-11, Deposit - Mona Hassan, 2000.00, DEP-001");
  await page.getByRole("button", { name: /^Import$/i }).click();
  await expect(page.getByText(/Deposit - Mona Hassan/)).toBeVisible({ timeout: 60_000 });
  expect(await lines()).toHaveLength(1);
});

test("B4 auto-match links the deposit to the receipt's journal line; an unexplained difference of -15 blocks finalizing", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await page.getByRole("button", { name: /Auto-match/i }).click();
  await expect(page.getByText(/Auto Matched/i).first()).toBeVisible({ timeout: 60_000 });

  const [only] = await lines();
  expect(only.match_type).toBe("AUTO");
  const { data: gl } = await adminClient().from("journal_entry_lines").select("id,debit,account_id").eq("id", only.matched_journal_entry_line_id!).single();
  expect(gl!.account_id).toBe(fx.accounts["1120"]);
  expect(Number(gl!.debit)).toBe(2000);

  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  const t = await text(page);
  expect(t).toMatch(/Unexplained Difference/i);
  expect(t).toMatch(/-?15\.00/);
  const finalize = page.getByRole("button", { name: /Finalize reconciliation/i });
  await expect(finalize).toBeDisabled();
  expect((await statementRow()).status).toBe("DRAFT");
  await shot(page, "21-reconciliation-unexplained-difference");
  // the database refuses too, independent of the button
  const session = await signedInClient(fx.accountant.email);
  const refused = await session.rpc("finalize_bank_reconciliation", { p_statement_id: statementId });
  expect(refused.error?.message).toMatch(/RECONCILIATION_NOT_BALANCED/);
  expect((await statementRow()).status).toBe("DRAFT");
});

test("B5 a second auto-match changes nothing; one journal line cannot back two statement lines", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  const before = await lines();
  await page.getByRole("button", { name: /Auto-match/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  expect(await lines()).toEqual(before);

  // import the missing bank fee (-15) now, so there is a second statement line to try to attach wrongly
  await page.locator("#raw").fill("2026-03-31, Account maintenance fee, -15.00, FEE-001");
  await page.getByRole("button", { name: /^Import$/i }).click();
  await expect(page.getByText(/Account maintenance fee/)).toBeVisible({ timeout: 60_000 });
  const all = await lines();
  expect(all).toHaveLength(2);
  const fee = all.find((l) => Number(l.amount) === -15)!;
  const deposit = all.find((l) => Number(l.amount) === 2000)!;

  // attempt (as the signed-in accountant, through the API the UI uses) to attach the receipt's journal line to the fee line
  const session = await signedInClient(fx.accountant.email);
  const clash = await session.from("bank_statement_lines").update({ matched_journal_entry_line_id: deposit.matched_journal_entry_line_id, match_type: "MANUAL", matched_at: new Date().toISOString() }).eq("id", fee.id);
  expect(clash.error?.code, clash.error?.message).toBe("23505");
  const after = await lines();
  expect(after.find((l) => l.id === fee.id)!.matched_journal_entry_line_id).toBeNull();
  expect(after.find((l) => l.id === deposit.id)!.matched_journal_entry_line_id).toBe(deposit.matched_journal_entry_line_id);
});

test("B5b importing the fee line makes the arithmetic zero but does not book the expense: books 2,000 vs bank 1,985", async () => {
  const session = await signedInClient(fx.accountant.email);
  const sum = await session.rpc("get_bank_reconciliation_summary", { p_statement_id: statementId });
  expect(sum.error, sum.error?.message).toBeNull();
  const row = (Array.isArray(sum.data) ? sum.data[0] : sum.data) as Record<string, string>;
  expect(Number(row.difference)).toBe(0);
  expect(Number(row.book_balance)).toBe(2000); // the expense has NOT been recorded
  expect(Number(row.closing_balance)).toBe(1985);
  const fee = await adminClient().from("journal_entries").select("id").eq("organization_id", fx.orgId).ilike("description", "%fee%");
  expect(fee.data).toHaveLength(0);

  // ... and finalize is refused by the DATABASE although the arithmetic difference is zero: the fee line is neither
  // matched to a book entry nor explained
  expect(Number(row.unmatched_statement_count)).toBe(1);
  const refused = await session.rpc("finalize_bank_reconciliation", { p_statement_id: statementId });
  expect(refused.error?.message).toMatch(/RECONCILIATION_UNHANDLED_LINES/);
  expect((await statementRow()).status).toBe("DRAFT");
});

test("B6 the fee is booked through the journal UI: accountant creates + submits, the owner posts; 1120 becomes 1,985", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/journals/new");
  await expect(page.getByRole("heading", { name: /New Journal Entry/i })).toBeVisible({ timeout: 60_000 });
  // the period defaults to the first one listed (2025-01), not the one containing the entry date: choose it
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /2026-03/ }).first().click();
  await page.locator('input[name="entryDate"]').fill("2026-03-31");
  await page.locator('textarea[name="description"], input[name="description"]').first().fill("Bank maintenance fee March 2026");
  const accountSelects = page.getByLabel("GL Account");
  await accountSelects.nth(0).selectOption({ value: fx.accounts["5410"] });
  await accountSelects.nth(1).selectOption({ value: fx.accounts["1120"] });
  await page.getByLabel("Debit").nth(0).fill("15");
  await page.getByLabel("Credit").nth(1).fill("15");
  await shot(page, "24-fee-journal-entry");
  await page.getByRole("button", { name: /Save Journal Entry/i }).click();
  const admin = adminClient();
  await expect.poll(async () => (await admin.from("journal_entries").select("id").eq("organization_id", fx.orgId).ilike("description", "%Bank maintenance fee%")).data?.length ?? 0, { timeout: 60_000, message: await page.getByRole("alert").allInnerTexts().then((t) => t.join(" ")).catch(() => "") }).toBe(1);
  const { data: je } = await admin.from("journal_entries").select("id,status,entry_date").eq("organization_id", fx.orgId).ilike("description", "%Bank maintenance fee%").single();
  expect(je).toMatchObject({ status: "DRAFT", entry_date: "2026-03-31" });
  await go(page, `/en/finance/journals/${je!.id}`);
  // maker-checker: the accountant can submit but cannot post
  await expect(page.getByRole("button", { name: /^Post$/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Submit for review/i }).click();
  await expect.poll(async () => (await admin.from("journal_entries").select("status").eq("id", je!.id).single()).data?.status, { timeout: 60_000 }).toBe("UNDER_REVIEW");

  await page.context().clearCookies();
  await signIn(page, fx.owner.email);
  await go(page, `/en/finance/journals/${je!.id}`);
  await page.getByRole("button", { name: /^Post$/ }).click();
  await expect.poll(async () => (await admin.from("journal_entries").select("status").eq("id", je!.id).single()).data?.status, { timeout: 60_000 }).toBe("POSTED");

  const { data: l } = await admin.from("journal_entry_lines").select("account_id,debit,credit").eq("journal_entry_id", je!.id);
  const name = (id: string) => (id === fx.accounts["5410"] ? "5410" : id === fx.accounts["1120"] ? "1120" : "?");
  expect((l ?? []).map((x) => `${name(x.account_id as string)}:${Number(x.debit)}:${Number(x.credit)}`).sort()).toEqual(["1120:0:15", "5410:15:0"]);
  await shot(page, "25-fee-journal-posted");
});

test("B7 auto-match links the fee line to the fee entry; book = bank = 1,985; nothing unmatched; finalize reconciles", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await page.getByRole("button", { name: /Auto-match/i }).click();
  await expect.poll(async () => (await lines()).filter((l) => !l.matched_journal_entry_line_id).length, { timeout: 60_000 }).toBe(0);

  const ls = await lines();
  const fee = ls.find((l) => Number(l.amount) === -15)!;
  const glFee = await adminClient().from("journal_entry_lines").select("account_id,credit").eq("id", fee.matched_journal_entry_line_id!).single();
  expect(glFee.data!.account_id).toBe(fx.accounts["1120"]);
  expect(Number(glFee.data!.credit)).toBe(15);

  const session = await signedInClient(fx.accountant.email);
  const sum = await session.rpc("get_bank_reconciliation_summary", { p_statement_id: statementId });
  const row = (Array.isArray(sum.data) ? sum.data[0] : sum.data) as Record<string, string>;
  expect([Number(row.book_balance), Number(row.closing_balance), Number(row.difference)]).toEqual([1985, 1985, 0]);

  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  expect(await text(page)).toMatch(/Perfectly Balanced/i);
  await shot(page, "22-reconciliation-balanced");
  const finalize = page.getByRole("button", { name: /Finalize reconciliation/i });
  await expect(finalize).toBeEnabled();
  await finalize.click();
  await expect(page.getByRole("button", { name: /Reopen/i })).toBeVisible({ timeout: 60_000 });
  const st = await statementRow();
  expect(st.status).toBe("RECONCILED");
  expect(st.reconciled_by).toBe(fx.accountant.id);
  expect((await lines()).every((l) => l.matched_journal_entry_line_id)).toBe(true);
  await shot(page, "23-reconciliation-finalized");

  // reconciled: controls are gone and a second finalize is refused
  await expect(page.getByRole("button", { name: /Auto-match/i })).toHaveCount(0);
  const again = await session.rpc("finalize_bank_reconciliation", { p_statement_id: statementId });
  expect(again.error?.message).toMatch(/BANK_STATEMENT_NOT_DRAFT/);
});

test("B8 the books agree: 1120 = 1,985, bank charges 15, receivables 0, revenue 2,000, balanced; trial balance closes 1120 at 1,985", async () => {
  const admin = adminClient();
  const { data: je } = await admin.from("journal_entries").select("id,status").eq("organization_id", fx.orgId);
  expect((je ?? []).every((e) => e.status === "POSTED")).toBe(true);
  const { data: l } = await admin.from("journal_entry_lines").select("account_id,debit,credit,journal_entry_id").in("journal_entry_id", (je ?? []).map((e) => e.id));
  const bal = (code: string) => (l ?? []).filter((x) => x.account_id === fx.accounts[code]).reduce((s, x) => s + Number(x.debit) - Number(x.credit), 0);
  expect([bal("1120"), bal("5410"), bal("1130"), bal("4100")]).toEqual([1985, 15, 0, -2000]);
  const dr = (l ?? []).reduce((s, x) => s + Number(x.debit), 0);
  const cr = (l ?? []).reduce((s, x) => s + Number(x.credit), 0);
  expect(dr).toBe(cr);
  const session = await signedInClient(fx.accountant.email);
  const tb = await session.rpc("get_trial_balance_with_opening", { p_organization_id: fx.orgId, p_start_date: "2026-03-01", p_end_date: "2026-03-31" });
  expect(tb.error, tb.error?.message).toBeNull();
  const rows = tb.data as Array<{ code: string; closing_balance: string; closing_debit: string; closing_credit: string }>;
  expect(Number(rows.find((r) => r.code === "1120")!.closing_balance)).toBe(1985);
  expect(rows.reduce((s, r) => s + Number(r.closing_debit), 0)).toBeCloseTo(rows.reduce((s, r) => s + Number(r.closing_credit), 0), 2);
});
