/**
 * Portal account statement.
 *
 * A statement is the document an owner takes to a bank or an association takes to court, so the things worth asserting are not "does
 * it paint" but: does it show this owner's movements and nobody else's, does the balance follow from them, does it behave when there
 * is nothing to show, is it reachable only by someone entitled to it, and does a receipt that was VOIDED later keep its history
 * (visible before the void date, reversed by a movement dated at the actual reversal entry) with the running balance, the closing
 * balance and the net all agreeing.
 *
 * Fixtures: isolated stack only (playwright.config.ts refuses anything else). Organizations are built through the product's own
 * functions (chart of accounts, fiscal periods, issue_dues, record_advance_payment, void_payment), so every receipt has its journal
 * entry exactly like production data. The portal login is the current passwordless flow (email code), through portalLogin().
 * Nothing is deleted afterwards: the stack is disposable, and deleting through the audit chain is not something a test should do.
 */
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/local-only";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";
import { portalLogin } from "./helpers/portal-ui";
import { sql } from "../helpers/gate-release";

const numeric = (text: string) =>
  !/[0-9٠-٩]/.test(text) ? NaN : Number(
    text
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[٬,‏‎]/g, "")
      .replace("٫", ".")
      .replace("−", "-")
      .replace(/[^0-9.-]/g, ""),
  );

type Owner = { fx: JourneyFixture; email: string; unitCode: string; paymentId: string | null };

/** A real organization with one portal owner. `dues` are issued through issue_dues; the receipt (if any, through record_payment) pays the first due. */
async function setUpOwner(
  label: string,
  opts: { unitCode?: string; dues?: Array<{ amount: number; issue: string; due: string; description: string }>; receipt?: { amount: number; date: string } } = {},
): Promise<Owner> {
  const fx = await createJourneyFixture(`stmt-${label}`);
  const admin = adminClient();
  const unitCode = opts.unitCode ?? fx.unit.code;
  if (unitCode !== fx.unit.code) {
    const r = await admin.from("units").update({ code: unitCode }).eq("id", fx.unit.id);
    if (r.error) throw new Error(`unit code: ${r.error.message}`);
  }
  const owner = await signedInClient(fx.owner.email);
  const typeId = sql(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  for (const d of opts.dues ?? []) {
    const r = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: d.amount, p_issue_date: d.issue, p_due_date: d.due, p_description: d.description });
    if (r.error) throw new Error(`issue_dues: ${r.error.message}`);
  }
  let paymentId: string | null = null;
  if (opts.receipt) {
    const first = sql(`select id from public.dues where organization_id='${fx.orgId}' order by issue_date limit 1`);
    const periodId = sql(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date<='${opts.receipt.date}' and end_date>='${opts.receipt.date}' limit 1`);
    const rec = await owner.rpc("record_payment", {
      p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: opts.receipt.amount, p_method: "CASH",
      p_payment_date: opts.receipt.date, p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodId, p_allocations: [{ due_id: first, amount: opts.receipt.amount }], p_idempotency_key: randomUUID(),
    });
    if (rec.error) throw new Error(`receipt: ${rec.error.message}`);
    paymentId = sql(`select id from public.payments where organization_id='${fx.orgId}' order by created_at desc limit 1`);
  }
  const email = `owner-${fx.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const link = await admin.from("members").update({ user_id: created.data.user!.id, email }).eq("id", fx.member.id);
  if (link.error) throw new Error(link.error.message);
  return { fx, email, unitCode, paymentId };
}

const CHARGES = [
  { amount: 3000, issue: "2026-02-01", due: "2026-02-15", description: "Statement charge one" },
  { amount: 1500, issue: "2026-03-01", due: "2026-03-15", description: "Statement charge two" },
];
const RECEIPT = { amount: 1000, date: "2026-03-10" };

async function openStatement(page: Page, owner: Owner, locale: "ar" | "en" = "en") {
  await portalLogin(page, owner.email);
  await page.goto(`/${locale}/portal/statement`);
}

test("an owner's statement shows their own movements, and never another owner's", async ({ page }) => {
  test.setTimeout(240_000);
  const a = await setUpOwner("a", { unitCode: "STMT-A", dues: CHARGES, receipt: RECEIPT });
  const b = await setUpOwner("b", { unitCode: "STMT-B", dues: CHARGES, receipt: RECEIPT });
  await openStatement(page, a);
  await expect(page.getByTestId("ledger-closing")).toBeVisible({ timeout: 60_000 });
  const body = await page.locator("body").innerText();

  expect(body).toContain("Statement charge one");
  expect(body).toContain("Statement charge two");
  expect(body).toContain(a.unitCode);
  expect(body, "another owner's unit must never appear").not.toContain(b.unitCode);
  // The balance is the arithmetic consequence, not a repeated figure: 4,500 charged less 1,000 paid = 3,500.
  expect(body).toMatch(/4,?500/);
  expect(body).toMatch(/1,?000/);
  expect(numeric(await page.getByTestId("ledger-closing").innerText())).toBe(3500);
  // ...and the position cards say the same thing
  expect(numeric(await page.getByTestId("pos-net").innerText())).toBe(3500);
});

test("an owner with no activity gets an empty statement, not a crash or a wrong zero", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await setUpOwner("empty");
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await openStatement(page, owner);
  await expect(page.getByText(/لا توجد حركات|No movements|No financial activity/).first()).toBeVisible({ timeout: 60_000 });
  expect(pageErrors, `empty statement raised errors:\n${pageErrors.join("\n")}`).toEqual([]);
  // Printing nothing is not a feature: the control must be disabled rather than producing a blank official-looking document.
  await expect(page.getByRole("button", { name: /طباعة كشف الحساب|Print statement/ })).toBeDisabled();
});

test("the statement renders right-to-left in Arabic and left-to-right in English", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await setUpOwner("dir", { dues: CHARGES, receipt: RECEIPT });
  await portalLogin(page, owner.email);
  await page.goto("/ar/portal/statement");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /كشف الحساب/ })).toBeVisible();
  await page.goto("/en/portal/statement");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { name: /Account Statement/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Print statement/i })).toBeEnabled();
});

test("the statement is unreachable without a portal session", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/ar/portal/statement");
  await expect(page).toHaveURL(/\/portal\/login/, { timeout: 15_000 });
  const body = await page.locator("body").innerText();
  expect(body, "no statement content may leak to an anonymous visitor").not.toMatch(/Statement charge|كشف الحساب الخاص/);
});

for (const locale of ["ar", "en"] as const) {
test(`a receipt voided later: visible before the void date, reversed at the actual reversal entry, and every figure agrees (${locale})`, async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await setUpOwner("void", { dues: [CHARGES[0]], receipt: RECEIPT });
  const accountant = await signedInClient(owner.fx.accountant.email);
  const voided = await accountant.rpc("void_payment", { p_organization_id: owner.fx.orgId, p_payment_id: owner.paymentId, p_reason: "customer cancelled", p_ip_address: null, p_user_agent: null });
  expect(voided.error, voided.error?.message).toBeNull();
  const voidDate = sql(`select je.entry_date from public.payments p join public.journal_entries je on je.id = p.reversal_journal_entry_id where p.id='${owner.paymentId}'`);

  await openStatement(page, owner, locale);
  await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
  const read = async () => ({
    closing: numeric(await page.getByTestId("ledger-closing").innerText()),
    arrears: numeric(await page.getByTestId("pos-arrears").innerText()),
    credit: numeric(await page.getByTestId("pos-credit").innerText()),
    net: numeric(await page.getByTestId("pos-net").innerText()),
  });

  await page.setViewportSize({ width: 1280, height: 1100 });
  const shot = (name: string) => page.screenshot({ path: `docs/audits/phase3-evidence/task5-screens/${locale}-${name}.png` });
  // today: the receipt and its reversal are both in the ledger; balance = 3,000 (nothing was ever paid), and the net says the same
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 3000, arrears: 3000, credit: 0, net: 3000 });
  await expect(page.locator('tr[data-kind="PAYMENT"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="PAYMENT_REVERSAL"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="PAYMENT_REVERSAL"]')).toContainText(voidDate);
  await shot("11-portal-voided-receipt-today");
  // the voided receipt row is a credit of 1,000 and the reversal a DEBIT of 1,000; the last running balance is the closing balance
  const rows = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, " ")));
  expect(rows.some((r) => r.includes(voidDate))).toBe(true);

  // as of a date BEFORE the void: the receipt still counts, the reversal is not there yet, and the net agrees with the ledger
  await page.locator('input[type="date"]').nth(1).fill("2026-03-31");
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 2000, arrears: 2000, credit: 0, net: 2000 });
  await expect(page.locator('tr[data-kind="PAYMENT"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="PAYMENT_REVERSAL"]')).toHaveCount(0);
  await shot("12-portal-voided-receipt-before-void-date");

  // one day before the reversal entry the receipt still counts; ON the reversal date it does not
  const dayBefore = new Date(Date.parse(`${voidDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  await page.locator('input[type="date"]').nth(1).fill(dayBefore);
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 2000, arrears: 2000, credit: 0, net: 2000 });
  await page.locator('input[type="date"]').nth(1).fill(voidDate);
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 3000, arrears: 3000, credit: 0, net: 3000 });
});
}

test("the dated position cards show an error with a retry when the request fails, instead of an endless placeholder", async ({ page }) => {
  test.setTimeout(240_000);
  const owner = await setUpOwner("retry", { dues: CHARGES, receipt: RECEIPT });
  await openStatement(page, owner);
  await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });

  // every server-action POST fails (network drop) until we let it through again
  let failing = true;
  await page.route("**/portal/statement**", (route) => {
    const req = route.request();
    if (failing && req.method() === "POST" && req.headers()["next-action"]) return route.abort("failed");
    return route.continue();
  });
  await page.locator('input[type="date"]').nth(1).fill("2026-03-31");
  await expect(page.getByTestId("portal-position-error")).toBeVisible({ timeout: 30_000 });
  // no stale or placeholder figures next to the error: the cards are replaced by it
  await expect(page.getByTestId("pos-net")).toHaveCount(0);

  failing = false;
  await page.getByTestId("portal-position-retry").click();
  await expect(page.getByTestId("portal-position-error")).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => numeric(await page.getByTestId("pos-net").innerText()), { timeout: 30_000 }).toBe(3500);
});

test("a legacy receipt with an unallocated remainder keeps its meaning: statement = net before and after it is voided, and it is not credit", async ({ page }) => {
  test.setTimeout(300_000);
  const fx = await createJourneyFixture("stmt-legacy");
  const admin = adminClient();
  const owner = await signedInClient(fx.owner.email);
  const typeId = sql(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  const issued = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 2000, p_issue_date: "2026-02-01", p_due_date: "2026-02-15", p_description: "Legacy charge" });
  if (issued.error) throw new Error(issued.error.message);
  const d1 = sql(`select id from public.dues where organization_id='${fx.orgId}' limit 1`);
  // an import-style receipt: advance_amount 0, 400 left unallocated, its own posted entry (Dr cash 1,000 / Cr receivables 600 / Cr unearned revenue 400)
  const leg = randomUUID();
  const period = sql(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date<='2026-03-10' and end_date>='2026-03-10' limit 1`);
  const pay = await admin.from("payments").insert({ id: leg, organization_id: fx.orgId, property_id: fx.propertyId, member_id: fx.member.id, unit_id: fx.unit.id, amount: 1000, unallocated_amount: 400, advance_amount: 0, method: "CASH", payment_date: "2026-03-10", status: "POSTED", receipt_no: "LEG-1", deposit_account_id: fx.accounts["1110"] });
  if (pay.error) throw new Error(pay.error.message);
  const entry = await admin.from("journal_entries").insert({ organization_id: fx.orgId, property_id: fx.propertyId, fiscal_period_id: period, entry_date: "2026-03-10", description: "legacy receipt LEG-1", source_type: "RECEIPT_VOUCHER", status: "POSTED" }).select("id").single();
  if (entry.error) throw new Error(entry.error.message);
  await admin.from("journal_entry_lines").insert([
    { journal_entry_id: entry.data.id, line_number: 1, account_id: fx.accounts["1110"], debit: 1000, credit: 0 },
    { journal_entry_id: entry.data.id, line_number: 2, account_id: fx.accounts["1130"], debit: 0, credit: 600 },
    { journal_entry_id: entry.data.id, line_number: 3, account_id: fx.accounts["2200"], debit: 0, credit: 400 },
  ]);
  await admin.from("payments").update({ journal_entry_id: entry.data.id }).eq("id", leg);
  await admin.from("payment_allocations").insert({ payment_id: leg, due_id: d1, amount: 600 });
  const email = `owner-${fx.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  await admin.from("members").update({ user_id: created.data.user!.id, email }).eq("id", fx.member.id);

  await portalLogin(page, email);
  await page.goto("/en/portal/statement");
  await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
  const read = async () => ({
    closing: numeric(await page.getByTestId("ledger-closing").innerText()),
    running: numeric(await page.locator("tbody tr").first().locator("td:last-child").innerText()),
    net: numeric(await page.getByTestId("pos-net").innerText()),
    credit: numeric(await page.getByTestId("pos-credit").innerText()),
    arrears: numeric(await page.getByTestId("pos-arrears").innerText()),
  });
  const to = page.locator('input[type="date"]').nth(1);

  // before the void (today it is voided, so look at 31 March): 2,000 charged - 1,000 paid = 1,000 = outstanding 1,400 - legacy 400
  await to.fill("2026-03-31");
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 1000, running: 1000, net: 1000, credit: 0, arrears: 1400 });
  await expect(page.getByTestId("pos-legacy")).toContainText(/400/);
  await expect(page.getByTestId("portal-stranded")).toHaveCount(0);

  // the staff void (reversal entry dated by the database)
  const accountant = await signedInClient(fx.accountant.email);
  const v = await accountant.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: leg, p_reason: "legacy receipt cancelled", p_ip_address: null, p_user_agent: null });
  expect(v.error, v.error?.message).toBeNull();
  const voidDate = sql(`select je.entry_date::text from public.payments p join public.journal_entries je on je.id = p.reversal_journal_entry_id where p.id='${leg}'`);
  await page.goto("/en/portal/statement");
  await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
  const dayBefore = new Date(Date.parse(`${voidDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  await to.fill(dayBefore);
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 1000, running: 1000, net: 1000, credit: 0, arrears: 1400 });
  await to.fill(voidDate);
  await expect.poll(read, { timeout: 30_000 }).toEqual({ closing: 2000, running: 2000, net: 2000, credit: 0, arrears: 2000 });
  await expect(page.getByTestId("pos-legacy")).toHaveCount(0);
  await expect(page.locator('tr[data-kind="PAYMENT"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="PAYMENT_REVERSAL"]')).toHaveCount(1);
  await page.screenshot({ path: "docs/audits/phase3-evidence/task6-screens/en-legacy-receipt-after-void.png" });
});
