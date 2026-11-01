/**
 * Phase 2c/2d — a bank reconciliation cannot be finalized while a bank line is not matched to a BOOKED entry, and there
 * is no way to "justify" deferring a bank fee to a later period.
 *
 * FIXED BEFORE EXECUTION (fresh organization, bank account on GL 1120, no book entries on 1120; accountant session)
 *   Statement 2026-03: opening 0, closing -15.00; one imported line 2026-03-31 "Account maintenance fee" -15.00.
 *   difference = (closing -15 + unmatched book 0 - unmatched bank (-15)) - book 0 = 0   (zero, yet the fee is unbooked)
 *   X1 finalize is refused by the DATABASE (RECONCILIATION_UNHANDLED_LINES) and the screen disables the button with an
 *      explanation; the statement stays DRAFT.
 *   X2 there is no exception path: the screen has no "explain / defer" control and nothing named explain_* exists in the
 *      database; the table has no resolution columns to write.
 *   X3 the "it will be booked in April" route is rejected in every form available to the accountant: the fee line can't be
 *      waved through (finalize still refused), deleting the line breaks the arithmetic (-15, RECONCILIATION_NOT_BALANCED),
 *      and falsifying the statement's closing balance to 0 breaks it the other way (+15). The statement stays DRAFT and the
 *      books still lack the fee.
 *   X4 the only way through: book the fee (accountant creates + submits, owner posts), match the line, finalize ->
 *      RECONCILED with book = bank = -15, nothing unmatched.
 */
import { test, expect } from "./helpers/local-only";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { addBankAccount, adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
let statementId = "";
let lineId = "";

async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}
async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/en/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}
const statement = async () => (await adminClient().from("bank_statements").select("status,closing_balance").eq("id", statementId).single()).data!;
const line = async () => (await adminClient().from("bank_statement_lines").select("*").eq("id", lineId).single()).data!;
const feeEntries = async () => (await adminClient().from("journal_entries").select("id").eq("organization_id", fx.orgId).ilike("description", "%fee%")).data ?? [];
const summary = async (c: Awaited<ReturnType<typeof signedInClient>>) => {
  const sum = await c.rpc("get_bank_reconciliation_summary", { p_statement_id: statementId });
  return (Array.isArray(sum.data) ? sum.data[0] : sum.data) as Record<string, string>;
};

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("bankx", { approveReceivable: false });
  const bank = await addBankAccount(fx);
  const admin = adminClient();
  const parent = (await admin.from("chart_of_accounts").select("id").eq("organization_id", fx.orgId).eq("code", "5000").single()).data!.id as string;
  const created = await admin.from("chart_of_accounts").insert({ organization_id: fx.orgId, parent_id: parent, code: "5410", name_ar: "رسوم بنكية", name_en: "Bank charges", category: "EXPENSE", normal_balance: "DEBIT", is_group: false, is_active: true }).select("id").single();
  if (created.error) throw new Error(created.error.message);
  fx.accounts["5410"] = created.data.id as string;
  statementId = (await admin.from("bank_statements").insert({ organization_id: fx.orgId, bank_account_id: bank.bankAccountId, period_start: "2026-03-01", period_end: "2026-03-31", opening_balance: 0, closing_balance: -15, created_by: fx.accountant.id }).select("id").single()).data!.id as string;
  lineId = (await admin.from("bank_statement_lines").insert({ organization_id: fx.orgId, statement_id: statementId, line_date: "2026-03-31", description: "Account maintenance fee", reference: "FEE-001", amount: -15, sort_order: 0 }).select("id").single()).data!.id as string;
});

test("X1 a zero difference with an unbooked bank line is refused by the database and the screen", async ({ page }) => {
  const session = await signedInClient(fx.accountant.email);
  const row = await summary(session);
  expect([Number(row.difference), Number(row.unmatched_statement_count)]).toEqual([0, 1]); // zero, yet an unbooked line

  const refused = await session.rpc("finalize_bank_reconciliation", { p_statement_id: statementId });
  expect(refused.error?.message).toMatch(/RECONCILIATION_UNHANDLED_LINES/);
  expect((await statement()).status).toBe("DRAFT");

  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await expect(page.getByRole("button", { name: /Finalize reconciliation/i })).toBeDisabled({ timeout: 60_000 });
  await expect(page.getByTestId("unhandled-lines-note")).toBeVisible();
  await page.screenshot({ path: "docs/audits/phase2-evidence/screens/61-finalize-blocked-unhandled-line.png", fullPage: true });
});

test("X2 there is no explain / defer exception anywhere: not on the screen, not in the database", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await expect(page.getByRole("button", { name: /Finalize reconciliation/i })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Explain/i })).toHaveCount(0);
  await expect(page.getByLabel(/Explanation/i)).toHaveCount(0);

  const accountant = await signedInClient(fx.accountant.email);
  const rpc = await accountant.rpc("explain_bank_statement_line", { p_line_id: lineId, p_reason: "Bank fee for March will be booked with the April batch" });
  expect(rpc.error?.code, rpc.error?.message).toBe("PGRST202"); // the function does not exist
  const col = await accountant.from("bank_statement_lines").select("resolution").eq("id", lineId);
  expect(col.error, "no resolution column").not.toBeNull();
  const write = await accountant.from("bank_statement_lines").update({ resolution: "EXPLAINED" }).eq("id", lineId);
  expect(write.error, "nothing to write to").not.toBeNull();
  expect(Object.keys(await line())).not.toContain("resolution");
});

test("X3 deferring the fee to April is rejected in every form: waving it through, deleting it, falsifying the statement", async () => {
  const accountant = await signedInClient(fx.accountant.email);
  const finalize = () => accountant.rpc("finalize_bank_reconciliation", { p_statement_id: statementId });

  // (a) leave the unbooked line as it is: refused
  expect((await finalize()).error?.message).toMatch(/RECONCILIATION_UNHANDLED_LINES/);

  // (b) remove the line from the statement: the arithmetic difference becomes -15
  const admin = adminClient();
  const saved = await line();
  const del = await accountant.from("bank_statement_lines").delete().eq("id", lineId);
  expect(del.error).toBeNull();
  expect(Number((await summary(accountant)).difference)).toBe(-15);
  expect((await finalize()).error?.message).toMatch(/RECONCILIATION_NOT_BALANCED/);
  // put the line back exactly as imported
  const back = await admin.from("bank_statement_lines").insert({ organization_id: fx.orgId, statement_id: statementId, line_date: saved.line_date, description: saved.description, reference: saved.reference, amount: saved.amount, sort_order: saved.sort_order }).select("id").single();
  lineId = back.data!.id as string;

  // (c) falsify the statement's closing balance so the maths "works" without the fee: +15, refused
  const forge = await accountant.from("bank_statements").update({ closing_balance: 0 }).eq("id", statementId);
  if (!forge.error) {
    expect(Number((await summary(accountant)).difference)).toBe(15);
    expect((await finalize()).error?.message).toMatch(/RECONCILIATION_NOT_BALANCED|RECONCILIATION_UNHANDLED_LINES/);
    await admin.from("bank_statements").update({ closing_balance: -15 }).eq("id", statementId);
  }

  expect((await statement()).status).toBe("DRAFT");
  expect(await feeEntries()).toHaveLength(0); // and the books still lack the fee
  expect(Number((await summary(accountant)).difference)).toBe(0);
});

test("X4 the only way through: book the fee, post it, match the line, then finalize", async ({ page }) => {
  const accountant = await signedInClient(fx.accountant.email);
  const owner = await signedInClient(fx.owner.email);
  const admin = adminClient();
  const period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-03-31").gte("end_date", "2026-03-31").single()).data!.id as string;
  const created = await accountant.rpc("create_journal_entry", {
    p_organization_id: fx.orgId, p_resort_id: null, p_fiscal_period_id: period, p_entry_date: "2026-03-31", p_description: "Bank maintenance fee March 2026", p_source_type: "JOURNAL_VOUCHER",
    p_lines: [{ account_id: fx.accounts["5410"], debit: 15, credit: 0 }, { account_id: fx.accounts["1120"], debit: 0, credit: 15 }], p_idempotency_key: randomUUID(),
  });
  expect(created.error, created.error?.message).toBeNull();
  expect((await accountant.rpc("submit_journal_entry_for_review", { p_journal_entry_id: created.data as string })).error).toBeNull();
  // a submitted-but-unposted entry is not a booked entry: nothing to match yet, finalize still refused
  expect((await accountant.rpc("finalize_bank_reconciliation", { p_statement_id: statementId })).error?.message).toMatch(/RECONCILIATION_UNHANDLED_LINES/);
  expect((await owner.rpc("post_journal_entry", { p_journal_entry_id: created.data as string })).error).toBeNull();

  await signIn(page, fx.accountant.email);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await page.getByRole("button", { name: /Auto-match/i }).click();
  await expect.poll(async () => (await line()).matched_journal_entry_line_id, { timeout: 60_000 }).not.toBeNull();

  const row = await summary(accountant);
  expect([Number(row.book_balance), Number(row.closing_balance), Number(row.difference), Number(row.unmatched_statement_count), Number(row.unmatched_gl_count)]).toEqual([-15, -15, 0, 0, 0]);
  await go(page, `/en/finance/banks/reconciliation/${statementId}`);
  await expect(page.getByRole("button", { name: /Finalize reconciliation/i })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole("button", { name: /Finalize reconciliation/i }).click();
  await expect(page.getByRole("button", { name: /Reopen/i })).toBeVisible({ timeout: 60_000 });
  expect((await statement()).status).toBe("RECONCILED");
  expect(await feeEntries()).toHaveLength(1);
});
