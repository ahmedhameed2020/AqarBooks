import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./helpers/local-only";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./helpers/accounting-fixture";
import { portalLogin } from "./helpers/portal-ui";
import { sql } from "../helpers/gate-release";
import { advanceErrorMessage } from "@/lib/finance/customer-advances";

/**
 * Customer advances — browser acceptance on the production build (spec §8, B1–B8). Isolated stack only.
 *
 * Reference data (all dates past; V1 refuses the future): unit U1 of member M; D1 = 2,000 issued 1 Aug, D2 = 800 issued 1 Sep;
 * R1 = 3,000 on 10 Aug with 2,000 allocated to D1 (advance 1,000); R2 = 1,500 on 12 Aug, no allocation.
 * The steps are SERIAL on purpose: B2 applies from B1's receipts, B3 reverses B2's application, B4/B5 read what the three left behind.
 *
 * Screens that matter are driven through the product (dialogs, register, portal). Where the browser cannot reach a fact (journal
 * lines, reversal entry date, audit rows), it is read from the isolated database.
 */
const q = (query: string) => sql(query);
const numeric = (text: string) =>
  !/[0-9٠-٩]/.test(text)
    ? NaN
    : Number(
        text
          .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
          .replace(/[٬,‏‎؜]/g, "")
          .replace("٫", ".")
          .replace("−", "-")
          .replace(/[^0-9.-]/g, ""),
      );

async function signIn(page: Page, locale: string, email: string) {
  await page.context().clearCookies();
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 });
}

async function userWithRole(f: JourneyFixture, roleKey: string, label: string) {
  const admin = adminClient();
  const email = `${label}-${f.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  const roleId = (await admin.from("roles").select("id").eq("organization_id", f.orgId).eq("key", roleKey).single()).data!.id as string;
  await admin.from("organization_memberships").insert({ organization_id: f.orgId, user_id: created.data.user!.id, status: "active" });
  await admin.from("user_role_assignments").insert({ user_id: created.data.user!.id, role_id: roleId, organization_id: f.orgId });
  return email;
}

async function linkPortalUser(memberId: string, tag: string, label: string) {
  const admin = adminClient();
  const email = `${label}-${tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  const r = await admin.from("members").update({ user_id: created.data.user!.id, email }).eq("id", memberId);
  if (r.error) throw new Error(r.error.message);
  return email;
}

const periodAt = (orgId: string, d: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${d}' and end_date>='${d}' limit 1`);
async function issueDue(fx: JourneyFixture, amount: number, issue: string, description: string, unitId = fx.unit.id) {
  const owner = await signedInClient(fx.owner.email);
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  const r = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [unitId], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: amount, p_issue_date: issue, p_due_date: issue, p_description: description });
  if (r.error) throw new Error(`issue_dues: ${r.error.message}`);
}
async function approveAdvanceAccount(fx: JourneyFixture) {
  const owner = await signedInClient(fx.owner.email);
  const r = await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] });
  if (r.error) throw new Error(r.error.message);
}
const lines = (entryId: string) =>
  q(`select string_agg(a.code||':'||l.debit::numeric(19,2)::text||'/'||l.credit::numeric(19,2)::text, ' | ' order by a.code, l.debit desc) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${entryId}'`);

const dlg = (page: Page) => page.getByTestId("record-payment-dialog");
async function newReceipt(page: Page, locale: "en" | "ar" = "en") {
  await page.locator("button", { hasText: locale === "ar" ? "تسجيل سند قبض جديد" : "New Receipt" }).click();
  await expect(dlg(page)).toBeVisible();
}
const registerRow = (page: Page, receiptNo: string) => page.locator("tbody tr").filter({ hasText: new RegExp("#" + receiptNo + "(?!\d)") });

// ======================================================================================================================================
// B1 – B7: one organization, serial
// ======================================================================================================================================
test.describe("B1–B7: advances on the staff screens and the owner's portal", () => {
  test.describe.configure({ mode: "serial" });
  let fx: JourneyFixture;
  let memberEmail = "";
  let cashierEmail = "";
  let R1 = "", R2 = "";
  let app600 = "", app200 = "";

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    fx = await createJourneyFixture("adv-b");
    await issueDue(fx, 2000, "2026-08-01", "D1");
    await issueDue(fx, 800, "2026-09-01", "D2");
    await approveAdvanceAccount(fx);
    memberEmail = await linkPortalUser(fx.member.id, fx.tag, "memberM");
    cashierEmail = await userWithRole(fx, "CASHIER", "cashier");
  });

  test("B1 — an advance receipt with explicit confirmation (R1), and one without a due (R2)", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, "en", fx.owner.email);
    await page.goto("/en/finance/payments");

    // R1: pay D1 with 3,000 on 10 Aug -> 2,000 settles D1 and 1,000 is advance credit. The submit stays disabled until confirmed.
    await newReceipt(page);
    await dlg(page).getByRole("combobox").first().click();
    await page.getByRole("option", { name: /2,000 EGP —/ }).first().click();
    await dlg(page).locator('input[type="date"]').fill("2026-08-10");
    await page.getByTestId("amount-input").fill("3000");
    await expect(page.getByTestId("advance-notice")).toContainText(/1,000\.00/);
    await expect(page.getByTestId("record-submit")).toBeDisabled();
    await page.getByTestId("confirm-advance").click();
    await expect(page.getByTestId("record-submit")).toBeEnabled();
    await page.getByTestId("record-submit").click();
    await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 });

    // R2: an advance with no due, 1,500 on 12 Aug
    await page.reload();
    await newReceipt(page);
    await page.getByTestId("mode-advance").click();
    await dlg(page).locator('input[type="date"]').fill("2026-08-12");
    await page.getByTestId("amount-input").fill("1500");
    await page.getByTestId("record-submit").click();
    await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("advance-badge")).toHaveCount(2, { timeout: 60_000 });

    R1 = q(`select id from public.payments where organization_id='${fx.orgId}' and payment_date='2026-08-10'`);
    R2 = q(`select id from public.payments where organization_id='${fx.orgId}' and payment_date='2026-08-12'`);
    // the books: R1 = Dr cash 3,000 / Cr receivables 2,000 / Cr advances 1,000; R2 = Dr cash 1,500 / Cr advances 1,500
    expect(lines(q(`select journal_entry_id from public.payments where id='${R1}'`))).toBe("1110:3000.00/0.00 | 1130:0.00/2000.00 | 2250:0.00/1000.00");
    expect(lines(q(`select journal_entry_id from public.payments where id='${R2}'`))).toBe("1110:1500.00/0.00 | 2250:0.00/1500.00");
    expect(q(`select advance_amount::numeric(19,2) from public.payments where id='${R1}'`)).toBe("1000.00");
    expect(q(`select a.code from public.payments p join public.chart_of_accounts a on a.id=p.advance_account_id where p.id='${R1}'`)).toBe("2250");
    expect(q(`select status from public.dues where organization_id='${fx.orgId}' and description='D1'`)).toBe("PAID");
    // the register shows what is left on each
    await expect(registerRow(page, "1").getByTestId("credit-left")).toContainText(/1,000/);
    await expect(registerRow(page, "2").getByTestId("credit-left")).toContainText(/1,500/);
  });

  test("B2 — applying credit from the receipts page: 600 on 5 Sep, then 200 on 7 Sep", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, "en", fx.owner.email);
    const apply = async (amount: string, date: string) => {
      await page.goto("/en/finance/payments");
      await page.getByTestId("credit-open-1").click();
      await expect(page.getByTestId("payment-credit-dialog")).toBeVisible();
      await page.getByTestId("apply-form").getByRole("checkbox").first().click();
      await page.getByTestId("apply-form").locator('input[type="number"]').first().fill(amount);
      await page.locator("#apply-date").fill(date);
      await expect(page.getByTestId("apply-submit")).toBeEnabled();
      await page.getByTestId("apply-submit").click();
      await expect(page.getByTestId("payment-credit-dialog")).toHaveCount(0, { timeout: 60_000 });
    };
    await apply("600", "2026-09-05");
    expect(q(`select status||':'||(amount - coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id=d.id),0))::numeric(19,2) from public.dues d where organization_id='${fx.orgId}' and description='D2'`)).toBe("PARTIALLY_PAID:200.00");
    await page.reload();
    await expect(registerRow(page, "1").getByTestId("credit-left")).toContainText(/400/);
    await apply("200", "2026-09-07");
    await page.reload();
    await expect(registerRow(page, "1").getByTestId("credit-left")).toContainText(/200/);
    expect(q(`select status from public.dues where organization_id='${fx.orgId}' and description='D2'`)).toBe("PAID");
    // the books of the first application: Dr advances 600 / Cr receivables 600
    const entries = q(`select string_agg(pa.amount::numeric(19,2)::text||'@'||pa.applied_on::text, ',' order by pa.applied_on) from public.payment_allocations pa where pa.payment_id='${R1}' and pa.kind='CREDIT_APPLICATION'`);
    expect(entries).toBe("600.00@2026-09-05,200.00@2026-09-07");
    app600 = q(`select id from public.payment_allocations where payment_id='${R1}' and kind='CREDIT_APPLICATION' and amount=600`);
    app200 = q(`select id from public.payment_allocations where payment_id='${R1}' and kind='CREDIT_APPLICATION' and amount=200`);
    expect(lines(q(`select journal_entry_id from public.payment_allocations where id='${app600}'`))).toBe("1130:0.00/600.00 | 2250:600.00/0.00");
    // R2 cannot be applied to D2 any more: nothing is open, the form says so instead of offering it
    await page.goto("/en/finance/payments");
    await page.getByTestId("credit-open-2").click();
    await expect(page.getByTestId("apply-form")).toContainText(/no open dues/i);
    await expect(page.getByTestId("apply-submit")).toBeDisabled();
  });

  test("B3 — reversing only the 600 application, with a reason: dated 9 Sep, the 200 stays", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, "en", fx.owner.email);
    await page.goto("/en/finance/payments");
    await page.getByTestId("credit-open-1").click();
    const list = page.getByTestId("applications-list");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    // a reversal needs a reason: the confirm button stays disabled without one
    await list.getByRole("listitem").filter({ hasText: "600.00" }).getByRole("button").click();
    await page.locator("#reverse-date").fill("2026-09-09");
    await expect(page.getByTestId("reverse-submit")).toBeDisabled();
    await page.locator("#reverse-reason").fill("applied to the wrong due");
    await expect(page.getByTestId("reverse-submit")).toBeEnabled();
    await page.getByTestId("reverse-submit").click();
    await expect(page.getByTestId("payment-credit-dialog")).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(registerRow(page, "1").getByTestId("credit-left")).toContainText(/800/);

    // the reversal entry is dated 9 Sep and reversed_on is exactly that date; D2 owes 600 again (the 200 stays applied)
    expect(q(`select reversed_on::text from public.payment_allocations where id='${app600}'`)).toBe("2026-09-09");
    expect(q(`select je.entry_date::text from public.payment_allocations pa join public.journal_entries je on je.id=pa.reversal_journal_entry_id where pa.id='${app600}'`)).toBe("2026-09-09");
    expect(q(`select reversed_on is null from public.payment_allocations where id='${app200}'`)).toBe("t");
    expect(q(`select status from public.dues where organization_id='${fx.orgId}' and description='D2'`)).toBe("PARTIALLY_PAID");
    expect(q(`select (amount - coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id=d.id),0))::numeric(19,2) from public.dues d where organization_id='${fx.orgId}' and description='D2'`)).toBe("600.00");
    // the dialog now lists the 200 only; the reversed one is gone from "in force"
    await page.getByTestId("credit-open-1").click();
    await expect(page.getByTestId("applications-list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("applications-list")).toContainText("200.00");
    // audit: reason and actor are recorded
    expect(q(`select count(*) from public.platform_audit_logs where organization_id='${fx.orgId}' and action='payment.credit_application_reversed' and actor_id='${fx.owner.id}' and safe_change_summary->>'reason'='applied to the wrong due'`)).toBe("1");
  });

  // ---- the five dates of the spec, as the OWNER sees them in the portal -------------------------------------------------------
  const DATES: Array<[string, { arrears: number; credit: number; net: number; l2250: number }]> = [
    ["2026-08-31", { arrears: 0, credit: 2500, net: -2500, l2250: 2500 }],
    ["2026-09-04", { arrears: 800, credit: 2500, net: -1700, l2250: 2500 }],
    ["2026-09-06", { arrears: 200, credit: 1900, net: -1700, l2250: 1900 }],
    ["2026-09-08", { arrears: 0, credit: 1700, net: -1700, l2250: 1700 }],
    ["2026-09-30", { arrears: 600, credit: 2300, net: -1700, l2250: 2300 }],
  ];

  test("B4 — the portal statement with a window ending 31 Aug, 4 Sep, 6 Sep, 8 Sep and 30 Sep", async ({ page }) => {
    test.setTimeout(300_000);
    await portalLogin(page, memberEmail);
    await page.goto("/en/portal/statement");
    await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
    // M still owns U1: the "on hold" notice must NOT appear
    await expect(page.getByTestId("portal-stranded")).toHaveCount(0);
    const read = async () => ({
      arrears: numeric(await page.getByTestId("pos-arrears").innerText()),
      credit: numeric(await page.getByTestId("pos-credit").innerText()),
      net: numeric(await page.getByTestId("pos-net").innerText()),
      closing: numeric(await page.getByTestId("ledger-closing").innerText()),
    });
    const to = page.locator('input[type="date"]').nth(1);
    for (const [date, want] of DATES) {
      await to.fill(date);
      await expect.poll(read, { timeout: 30_000, message: `portal position as of ${date}` }).toEqual({ arrears: want.arrears, credit: want.credit, net: want.net, closing: want.net });
    }
    // the 8 Sep figures still show BOTH applications although the 600 was reversed later (history is rebuilt, not rewritten)
    await to.fill("2026-09-08");
    await expect(page.locator('tr[data-kind="APPLICATION"]')).toHaveCount(2);
    await expect(page.locator('tr[data-kind="REVERSAL"]')).toHaveCount(0);
    await to.fill("2026-09-30");
    await expect(page.locator('tr[data-kind="REVERSAL"]')).toHaveCount(1);
    await expect(page.locator('tr[data-kind="REVERSAL"]')).toContainText("2026-09-09");
    await page.screenshot({ path: "docs/audits/phase3-evidence/task6-screens/en-B4-portal-2026-09-30.png" });
  });

  test("B5 — the same numbers in the ledger, the trial balance, the balance sheet, the unit page, the owner statement and the receipt PDF", async ({ page }) => {
    test.setTimeout(400_000);
    await signIn(page, "en", fx.owner.email);
    for (const [date, want] of DATES) {
      // the books: 2250 (credit balance) as of the date, straight from the journal
      const ledger = q(`select coalesce(sum(l.credit - l.debit),0)::numeric(19,2) from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id join public.chart_of_accounts a on a.id=l.account_id where j.organization_id='${fx.orgId}' and a.code='2250' and j.entry_date<='${date}' and j.status in ('POSTED','REVERSED')`);
      expect(Number(ledger), `ledger 2250 as of ${date}`).toBe(want.l2250);

      // trial balance: balanced, and the 2250 row's closing credit is the same figure
      await page.goto(`/en/finance/reports/trial-balance?asOf=${date}`);
      await expect(page.getByTestId("tb-balance-status")).toHaveAttribute("data-balanced", "true", { timeout: 60_000 });
      const closing = await page.getByTestId("tb-row-2250").locator('[data-col="closing-credit"]').getAttribute("data-value");
      expect(Number(closing), `trial balance 2250 as of ${date}`).toBe(want.l2250);

      // balance sheet: the equation holds, and the liability line shows the same amount
      await page.goto(`/en/finance/reports/balance-sheet?asOf=${date}`);
      await expect(page.getByText(/100% Balanced/)).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("body")).toContainText(want.l2250.toLocaleString("en-US", { minimumFractionDigits: 2 }));
    }

    // the unit page (today): credit left on U1 = 800 (R1) + 1,500 (R2) = 2,300
    await page.goto(`/en/property/${fx.unit.id}?tab=financials`);
    await expect(page.getByTestId("unit-credit-card")).toContainText(/2,300/, { timeout: 60_000 });

    // the owner (distribution) statement carries the rule, and the receipts page's own receipt document shows the advance part
    await page.goto("/en/finance/reports/owner-statement");
    await expect(page.getByTestId("owner-advance-note")).toBeVisible({ timeout: 60_000 });
    await page.goto("/en/finance/payments");
    // The receipt document is an HTML blob opened in a new window. That window loads web fonts from a public CDN, which the egress guard
    // (loopback only) rightly refuses, so the document is captured instead of displayed: window.open is replaced by a function that
    // reads the blob URL it is given.
    await page.evaluate(() => {
      (window as unknown as { __pdf: string | null }).__pdf = null;
      window.open = ((url: string) => {
        fetch(url).then((r) => r.text()).then((t) => { (window as unknown as { __pdf: string | null }).__pdf = t; });
        return {} as Window;
      }) as typeof window.open;
    });
    await registerRow(page, "1").getByRole("button", { name: /Print/ }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __pdf: string | null }).__pdf), { timeout: 30_000 }).not.toBeNull();
    const html = (await page.evaluate(() => (window as unknown as { __pdf: string }).__pdf)) as string;
    const doc = html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(doc).toMatch(/Advance credit/i);
    expect(doc).toContain("1,000.00");
    expect(doc).toContain("3,000.00");
  });

  test("B6 — the cashier records an advance but sees no apply / reverse controls", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, "en", cashierEmail);
    await page.goto("/en/finance/payments");
    await expect(page.getByTestId("advance-badge").first()).toBeVisible({ timeout: 60_000 });
    // no reverse (void) button: the cashier has no void permission either
    await expect(page.getByRole("button", { name: /^Reverse$/ })).toHaveCount(0);
    // the credit dialog is view-only: summary and applications, no apply form, no reverse buttons
    await page.getByTestId("credit-open-1").click();
    await expect(page.getByTestId("credit-summary")).toBeVisible();
    await expect(page.getByTestId("apply-form")).toHaveCount(0);
    await expect(page.getByTestId("applications-list").getByRole("button")).toHaveCount(0);
    await expect(page.getByTestId("payment-credit-dialog")).toContainText(/View only/i);
    await page.keyboard.press("Escape");
    // ...but may record an advance (receivables.payments.create): 50 on 14 Aug
    await newReceipt(page);
    await page.getByTestId("mode-advance").click();
    await dlg(page).locator('input[type="date"]').fill("2026-08-14");
    await page.getByTestId("amount-input").fill("50");
    await page.getByTestId("record-submit").click();
    await expect(dlg(page)).toHaveCount(0, { timeout: 60_000 });
    expect(q(`select count(*) from public.payments where organization_id='${fx.orgId}' and payment_date='2026-08-14' and advance_amount=50`)).toBe("1");
    // the database refuses the same people when they bypass the screen
    const cashier = await signedInClient(cashierEmail);
    const forced = await cashier.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: R1, p_allocations: [{ due_id: q(`select id from public.dues where organization_id='${fx.orgId}' and description='D2'`), amount: 1 }], p_application_date: "2026-09-10", p_fiscal_period_id: periodAt(fx.orgId, "2026-09-10"), p_idempotency_key: randomUUID() });
    expect(forced.error?.message ?? "").toMatch(/FORBIDDEN|42501|permission/i);
  });

  for (const locale of ["en", "ar"] as const) {
    test(`B7 — a refused application states its reason (${locale})`, async ({ page }) => {
      test.setTimeout(300_000);
      await signIn(page, locale, fx.owner.email);
      // D3 is issued on 20 Sep: applying R1's credit to it on 15 Sep must be refused as "before the due" and nothing may change
      if (locale === "en") await issueDue(fx, 300, "2026-09-20", "D3");
      await page.goto(`/${locale}/finance/payments`);
      await page.getByTestId("credit-open-1").click();
      const form = page.getByTestId("apply-form");
      const row = form.getByRole("listitem").filter({ hasText: /300/ });
      await row.getByRole("checkbox").click();
      await page.locator("#apply-date").fill("2026-09-15");
      const before = q(`select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}'`);
      await page.getByTestId("apply-submit").click();
      const alert = form.getByRole("alert");
      await expect(alert).toBeVisible({ timeout: 30_000 });
      await expect(alert).toContainText(advanceErrorMessage("APPLICATION_BEFORE_DUE", locale));
      expect(q(`select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}'`)).toBe(before);
      await page.screenshot({ path: `docs/audits/phase3-evidence/task6-screens/${locale}-B7-refusal.png` });
    });
  }
});

// ======================================================================================================================================
// B7 (second part): no approved advance account
// ======================================================================================================================================
test("B7 — no approved advance account: the screen says why and the database agrees", async ({ page }) => {
  test.setTimeout(300_000);
  const fx = await createJourneyFixture("adv-noacct");
  await issueDue(fx, 500, "2026-08-01", "N1");
  await signIn(page, "en", fx.owner.email);
  await page.goto("/en/finance/payments");
  await expect(page.getByTestId("advance-account-card")).toBeVisible({ timeout: 60_000 });
  await newReceipt(page);
  await page.getByTestId("mode-advance").click();
  await page.getByTestId("amount-input").fill("100");
  await expect(page.getByTestId("advance-not-configured")).toContainText(advanceErrorMessage("ADVANCE_ACCOUNT_NOT_CONFIGURED", "en"));
  await expect(page.getByTestId("record-submit")).toBeDisabled();
  const owner = await signedInClient(fx.owner.email);
  const forced = await owner.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 100, p_method: "CASH", p_payment_date: "2026-08-12", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodAt(fx.orgId, "2026-08-12"), p_allocations: [], p_idempotency_key: randomUUID() });
  expect(forced.error?.message ?? "").toContain("ADVANCE_ACCOUNT_NOT_CONFIGURED");
});

// ======================================================================================================================================
// B8: ownership moves after an advance (D13) — the new owner sees nothing of it, the original member sees it "on hold"
// ======================================================================================================================================
test("B8 — after the unit changes hands the new owner sees nothing of the old owner's credit; the original member sees it on hold", async ({ page }) => {
  test.setTimeout(600_000);
  const fx = await createJourneyFixture("adv-d13");
  const admin = adminClient();
  await issueDue(fx, 2000, "2026-08-01", "D1");
  await approveAdvanceAccount(fx);
  const owner = await signedInClient(fx.owner.email);
  const rec = await owner.rpc("record_advance_payment", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 3000, p_method: "CASH", p_payment_date: "2026-08-10",
    p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodAt(fx.orgId, "2026-08-10"),
    p_allocations: [{ due_id: q(`select id from public.dues where organization_id='${fx.orgId}' and description='D1'`), amount: 2000 }], p_idempotency_key: randomUUID(),
  });
  if (rec.error) throw new Error(rec.error.message);
  const R1 = (rec.data as { payment_id: string }).payment_id;

  const memberM = fx.member.id;
  const emailM = await linkPortalUser(memberM, fx.tag, "memberM");

  // what the statement of M says, in three independent places: the net card, the ledger's closing balance, and the running balance of the
  // newest line. They must be the same number, and the same number before and after the unit changes hands.
  const readStatement = async (locale = "en") => {
    await page.goto(`/${locale}/portal/statement`);
    await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("ledger-closing")).toBeVisible();
    return {
      net: numeric(await page.getByTestId("pos-net").innerText()),
      closing: numeric(await page.getByTestId("ledger-closing").innerText()),
      running: numeric(await page.locator("tbody tr").first().locator("td:last-child").innerText()),
      credit: numeric(await page.getByTestId("pos-credit").innerText()),
    };
  };

  // BEFORE the transfer: M owns U1; D1 2,000 charged, R1 3,000 paid -> net = ledger = running = -1,000 (credit 1,000, nothing owed)
  await portalLogin(page, emailM);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const mBefore = await readStatement();
  expect(mBefore).toEqual({ net: -1000, closing: -1000, running: -1000, credit: 1000 });
  await expect(page.locator('tr[data-kind="CHARGE"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="PAYMENT"]')).toHaveCount(1);
  await expect(page.getByTestId("portal-stranded")).toHaveCount(0);

  // 20 Aug: M's ownership ends, the new owner N takes over U1 (with a portal account); D2 is issued afterwards
  const N = { id: randomUUID() };
  await admin.from("unit_ownerships").update({ end_date: "2026-08-20" }).eq("unit_id", fx.unit.id).eq("member_id", memberM);
  const ins = await admin.from("members").insert({ id: N.id, organization_id: fx.orgId, full_name: "Nora Newowner", phone: "+201000000999" });
  if (ins.error) throw new Error(ins.error.message);
  const own = await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: fx.unit.id, member_id: N.id, share_percentage: 100, is_primary_contact: true, start_date: "2026-08-21" });
  if (own.error) throw new Error(own.error.message);
  await issueDue(fx, 800, "2026-09-01", "D2");
  const emailN = await linkPortalUser(N.id, fx.tag, "memberN");

  // the database: R1 is stranded, still counted in 2250
  expect(q(`select is_stranded from public.payment_credit_balances where payment_id='${R1}'`)).toBe("t");
  expect(Number(q(`select coalesce(sum(l.credit - l.debit),0) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and a.code='2250'`))).toBe(1000);

  // AFTER the transfer: M's figures are exactly what they were, the history source keeps D1 (charged while M owned the unit) and not D2
  await portalLogin(page, emailM);
  const mAfter = await readStatement();
  expect(mAfter).toEqual(mBefore);
  await expect(page.locator('tr[data-kind="CHARGE"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="CHARGE"]')).toContainText("D1");
  await expect(page.locator('tr[data-kind="PAYMENT"]')).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("D2");
  await expect(page.getByTestId("portal-stranded")).toBeVisible();
  await page.screenshot({ path: "docs/audits/phase3-evidence/task6-screens/en-B8-original-member-on-hold.png" });
  // ...in Arabic too
  expect(await readStatement("ar")).toEqual(mBefore);

  // N's session, through the API: nothing of R1 at any layer
  const nSession = await signedInClient(emailN);
  expect((await nSession.from("payments").select("id").eq("id", R1)).data ?? []).toHaveLength(0);
  expect((await nSession.from("payment_allocations").select("id").eq("payment_id", R1)).data ?? []).toHaveLength(0);
  expect((await nSession.from("payment_credit_balances").select("payment_id").eq("payment_id", R1)).data ?? []).toHaveLength(0);
  expect((await nSession.rpc("own_statement_receipts", { p_org: fx.orgId })).data ?? []).toHaveLength(0);
  expect((await nSession.rpc("own_credit_application_lines", { p_org: fx.orgId })).data ?? []).toHaveLength(0);
  const nCredit = ((await nSession.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-12-31" })).data ?? []).filter((r) => r.member_id === memberM);
  // (the as-of function is also staff-capable; a portal caller only gets their own member's rows, and N has none)
  expect(nCredit).toHaveLength(0);

  // N in the portal. The unit's dues are D1 2,000 (paid by the PREVIOUS owner's receipt, which N cannot see) and D2 800. The correct
  // remaining is proved from the settlement data, independently of anything the screen computes: 2,000 - 2,000 + 800 - 0 = 800.
  const independentRemaining = Number(q(`select coalesce(sum(d.amount - coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id = d.id), 0)), 0) from public.dues d where d.organization_id='${fx.orgId}' and d.unit_id='${fx.unit.id}'`));
  expect(independentRemaining).toBe(800);
  expect(Number(q(`select coalesce(sum(d.amount),0) from public.dues d where d.organization_id='${fx.orgId}' and d.unit_id='${fx.unit.id}'`))).toBe(2800); // what the blind reading used to call "arrears"
  await portalLogin(page, emailN);
  await page.goto("/en/portal/statement");
  await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });
  expect(numeric(await page.getByTestId("pos-credit").innerText())).toBe(0);
  expect(numeric(await page.getByTestId("pos-arrears").innerText()), "arrears = real remaining, not the 2,800 of dues").toBe(independentRemaining);
  expect(numeric(await page.getByTestId("pos-net").innerText())).toBe(independentRemaining);
  expect(numeric(await page.getByTestId("ledger-closing").innerText())).toBe(independentRemaining);
  // the already-settled D1 is a charge answered by a dated settlement line (an amount; no receipt, no payer); nothing of M's receipt or credit
  await expect(page.locator('tr[data-kind="CHARGE"]')).toHaveCount(2);
  await expect(page.locator('tr[data-kind="SETTLEMENT"]')).toHaveCount(1);
  await expect(page.locator('tr[data-kind="SETTLEMENT"]')).toContainText("2026-08-10");
  await expect(page.locator('tr[data-kind="PAYMENT"], tr[data-kind="APPLICATION"], tr[data-kind="REVERSAL"], tr[data-kind="PAYMENT_REVERSAL"]')).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/REC-\d|3,000\.00/);
  await expect(page.getByTestId("portal-stranded")).toHaveCount(0);
  await page.screenshot({ path: "docs/audits/phase3-evidence/task6-screens/en-B8-new-owner-statement.png" });
  for (const path of ["/en/portal/payments", "/en/portal/dues", "/en/portal/units"]) {
    await page.goto(path);
    const body = await page.locator("body").innerText();
    expect(body, `${path}: no receipt of the previous owner`).not.toMatch(/REC-\d|Advance credit|1,000\.00 EGP/);
  }

  // staff: the register shows it as stranded, opening it lets nobody apply it, and the database refuses it too
  await signIn(page, "en", fx.owner.email);
  await page.goto("/en/finance/payments");
  await expect(page.getByTestId("stranded-badge")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("credit-open-1").click();
  await expect(page.getByTestId("stranded-notice")).toBeVisible();
  await expect(page.getByTestId("apply-form")).toHaveCount(0);
  const d2 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='D2'`);
  const refused = await owner.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: R1, p_allocations: [{ due_id: d2, amount: 100 }], p_application_date: "2026-09-10", p_fiscal_period_id: periodAt(fx.orgId, "2026-09-10"), p_idempotency_key: randomUUID() });
  expect(refused.error?.message ?? "").toContain("MEMBER_NOT_LINKED_TO_UNIT");
  await page.keyboard.press("Escape");

  // voiding the receipt still works and zeroes the liability
  const accountant = await signedInClient(fx.accountant.email);
  const voided = await accountant.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: R1, p_reason: "unit sold", p_ip_address: null, p_user_agent: null });
  expect(voided.error, voided.error?.message).toBeNull();
  expect(Number(q(`select coalesce(sum(l.credit - l.debit),0) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and a.code='2250'`))).toBe(0);
});
