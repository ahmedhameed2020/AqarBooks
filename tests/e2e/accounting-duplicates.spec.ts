/**
 * Phase 2 — duplicate prevention through the UI (fresh organization, accountant session).
 *
 * FIXED BEFORE EXECUTION
 *   D1  record opening balance 5,000 (as of 2025-12-31)            -> 1 due, 1 journal entry
 *       record it AGAIN from the same dialog                        -> refused (OPENING_BALANCE_ALREADY_RECORDED), still 1 due / 1 entry
 *   D2  issue due 800 (2026-02-01, unit A-101, type X, note N)      -> 1 new due
 *       issue the IDENTICAL due again                               -> no second due is created (the duplicate guard skips it)
 *   D3  record receipt 300 on that due with a rapid double click    -> exactly ONE payment, ONE journal entry, receipt #1
 *   D4  reverse receipt #1, then attempt to reverse it again        -> the UI offers no second reversal; the database refuses
 *                                                                      (ALREADY_REVERSED); still exactly one reversal entry
 *   D5  replay the same record_payment call with the SAME idempotency key (as the accountant)
 *                                                                    -> same payment id returned, no second payment/entry
 */
import { test, expect } from "./helpers/local-only";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";

test.describe.configure({ mode: "serial" });

let fx: JourneyFixture;
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
const count = async (table: string, extra?: (q: ReturnType<ReturnType<typeof adminClient>["from"]>) => unknown) => {
  const admin = adminClient();
  const { count: n } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId);
  void extra;
  return n ?? 0;
};

async function openingDialog(page: Page) {
  await go(page, `/en/members/${fx.member.id}`);
  await page.getByRole("button", { name: /Opening balance/i }).click();
  const dialog = dialogScope(page);
  // Either the form or, when the page read no units for the member, a "link the client to a unit first" notice. The notice is a failure of the
  // environment (a statement timeout on units_with_financials / members_with_financials), so say so instead of timing out two minutes later.
  await expect(dialog.locator("#ob-amount").or(dialog.getByText(/Link the client to a unit first/i))).toBeVisible({ timeout: 60_000 });
  if (await dialog.getByText(/Link the client to a unit first/i).isVisible()) throw new Error("the opening-balance dialog said 'link the client to a unit first': the member page read NO units for this member (the units/members views answered 500 = statement timeout, which the page shows as empty data); see docs/audits/phase3-evidence/task7-flake-analysis.md");
  await dialog.locator("#ob-amount").fill("5000");
  await dialog.locator("#ob-date").fill("2025-12-31");
  return dialog;
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  fx = await createJourneyFixture("dups");
});

test("D1 a second opening balance for the same client and unit is refused and changes nothing", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  let dialog = await openingDialog(page);
  await dialog.getByRole("button", { name: /Record balance/i }).click();
  await expect(page.getByText(/Opening balance recorded/i)).toBeVisible({ timeout: 60_000 });
  expect(await count("dues")).toBe(1);
  expect(await count("journal_entries")).toBe(1);

  dialog = await openingDialog(page);
  await dialog.getByRole("button", { name: /Record balance/i }).click();
  await expect(dialog.getByRole("alert")).toContainText(/OPENING_BALANCE_ALREADY_RECORDED|already|سُجِّل رصيد افتتاحي/i, { timeout: 60_000 });
  expect(await count("dues")).toBe(1);
  expect(await count("journal_entries")).toBe(1);
});

test("D2 issuing the identical due twice creates only one", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  const issue = async () => {
    await go(page, "/en/finance/dues");
    await page.getByRole("button", { name: /Issue Due/i }).first().click();
    const dialog = dialogScope(page);
    await choose(page, dialog, 0, new RegExp(fx.unit.code));
    await choose(page, dialog, 1, new RegExp(fx.dueTypeName, "i"));
    await expect(dialog.getByRole("combobox").nth(2)).toContainText(/^1130/); // preselected from the approved setting
    await choose(page, dialog, 3, /2026-02/);
    await dialog.locator('input[type="number"]').fill("800");
    await dialog.locator('input[type="date"]').nth(0).fill("2026-02-01");
    await dialog.locator('input[type="date"]').nth(1).fill("2026-02-15");
    await dialog.getByPlaceholder(/Q2 maintenance fee/i).fill("Duplicate test charge");
    await dialog.getByRole("button", { name: /Issue Due & Post/i }).click();
    await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });
  };
  await issue();
  expect(await count("dues")).toBe(2);
  await issue();
  // the second submit must say it already exists, not that it was issued
  await expect(page.getByText(/Due already exists/i)).toBeVisible({ timeout: 60_000 });
  expect(await count("dues"), "the second identical due must be skipped").toBe(2);
  const { count: entries } = await adminClient().from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId);
  expect(entries).toBe(2);
});

test("D3 a rapid double click on 'Record Receipt' creates exactly one receipt", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  await page.getByRole("button", { name: /New Receipt/i }).first().click();
  const dialog = dialogScope(page);
  await choose(page, dialog, 0, /Rem: 800/);
  await choose(page, dialog, 1, new RegExp(fx.member.name));
  await choose(page, dialog, 2, /^Cash/i);
  await choose(page, dialog, 3, /^1110\b/);
  await dialog.locator('input[type="number"]').fill("300");
  await dialog.locator('input[type="date"]').fill("2026-02-10");
  // the fiscal period now follows the payment date (shown as a label), so it is asserted instead of chosen
  await expect(dialog.getByTestId("auto-period")).toContainText(/2026-02/);
  await dialog.getByRole("button", { name: /Record Receipt/i }).dblclick();
  await expect(dialogScope(page)).toHaveCount(0, { timeout: 60_000 });
  const admin = adminClient();
  const { data: pays } = await admin.from("payments").select("id,receipt_number,amount,status").eq("organization_id", fx.orgId);
  expect(pays).toHaveLength(1);
  expect(pays![0]).toMatchObject({ receipt_number: 1, status: "POSTED" });
  const { count: receiptEntries } = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).eq("source_type", "RECEIPT_VOUCHER");
  expect(receiptEntries).toBe(1);
});

test("D4 a reversed receipt cannot be reversed twice", async ({ page }) => {
  await signIn(page, fx.accountant.email);
  await go(page, "/en/finance/payments");
  await page.getByRole("row", { name: /#1\b/ }).getByRole("button", { name: /Reverse/i }).click();
  // the product opens an in-app confirmation dialog with a required reason (no native dialog)
  const voidDialog = page.getByTestId("void-receipt-dialog");
  await voidDialog.getByTestId("void-reason-input").fill("Duplicate receipt test");
  await voidDialog.getByRole("button", { name: /Confirm reversal/i }).click();
  await expect(page.getByRole("row", { name: /#1\b/ })).toContainText(/Reversed/i, { timeout: 60_000 });
  await expect(page.getByRole("row", { name: /#1\b/ }).getByRole("button", { name: /Reverse/i })).toHaveCount(0);

  const admin = adminClient();
  const { data: pay } = await admin.from("payments").select("id").eq("organization_id", fx.orgId).single();
  const session = await signedInClient(fx.accountant.email);
  const again = await session.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: pay!.id, p_reason: "second attempt" });
  expect(again.error?.message).toMatch(/ALREADY_REVERSED/);
  const { count: reversals } = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).eq("source_type", "PAYMENT_VOUCHER");
  expect(reversals).toBe(1);
  const { count: audits } = await admin.from("financial_audit_logs").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).eq("action", "PAYMENT_REVERSED");
  expect(audits).toBe(1);
});

test("D5 replaying a payment call with the same idempotency key returns the same payment and posts nothing new", async () => {
  const admin = adminClient();
  const session = await signedInClient(fx.accountant.email);
  const { data: due } = await admin.from("dues").select("id,amount").eq("organization_id", fx.orgId).eq("amount", 800).single();
  const { data: period } = await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).eq("name", "2026-02").single();
  const key = randomUUID();
  const call = () =>
    session.rpc("record_payment", {
      p_organization_id: fx.orgId,
      p_resort_id: fx.propertyId,
      p_fiscal_period_id: period!.id,
      p_deposit_account_id: fx.accounts["1110"],
      p_member_id: fx.member.id,
      p_unit_id: fx.unit.id,
      p_amount: 100,
      p_method: "CASH",
      p_payment_date: "2026-02-20",
      p_allocations: [{ due_id: due!.id, amount: 100 }],
      p_idempotency_key: key,
    });
  const first = await call();
  expect(first.error, first.error?.message).toBeNull();
  const second = await call();
  expect(second.error, second.error?.message).toBeNull();
  expect(second.data).toEqual(first.data);
  const { count: pays } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).eq("idempotency_key", key);
  expect(pays).toBe(1);
  const { count: all } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId);
  expect(all).toBe(2); // the reversed #1 and the single replayed payment
});
