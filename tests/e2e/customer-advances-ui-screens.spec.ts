import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createJourneyFixture, signedInClient, adminClient, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";
import { portalLogin } from "./helpers/portal-ui";

/**
 * Task 5 review screens: the advance-receipt UI in Arabic and English, on the isolated stack. It drives the real screens (approval
 * card, record dialog in both modes, excess confirmation, credit dialog) and checks that a double click records ONE receipt.
 * Screens are written to docs/audits/phase3-evidence/task5-screens/.
 */
const OUT = "docs/audits/phase3-evidence/task5-screens";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date();
const today = iso(now);
const monthStart = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

async function signIn(page: Page, locale: string, email: string) {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 });
}

async function issueDue(fx: JourneyFixture, amount: number, label: string, issue = monthStart, due = monthStart) {
  const owner = await signedInClient(fx.owner.email);
  const type = await owner.from("due_types").select("id").eq("organization_id", fx.orgId).limit(1).single();
  const r = await owner.rpc("issue_dues", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: type.data!.id,
    p_receivable_account_id: fx.accounts["1130"], p_amount: amount, p_issue_date: issue, p_due_date: due, p_description: label,
  });
  if (r.error) throw new Error(`issue_dues: ${r.error.message}`);
}

for (const locale of ["ar", "en"] as const) {
  test(`advance receipt UI (${locale})`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const shot = (name: string) => page.screenshot({ path: `${OUT}/${locale}-${name}.png`, fullPage: false });
    const fx = await createJourneyFixture(`adv-ui-${locale}`);
    await issueDue(fx, 900, "UI-due-900");
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, locale, fx.owner.email);

    // 1. the advance account is not approved yet: the card, then approve it through the product
    await page.goto(`/${locale}/finance/payments`);
    await expect(page.getByTestId("advance-account-card")).toBeVisible({ timeout: 60_000 });
    await shot("01-account-not-approved");
    await page.getByTestId("advance-account-select").click();
    await page.getByRole("option", { name: /2200/ }).click();
    await page.getByTestId("advance-account-save").click();
    await expect(page.getByTestId("advance-account-card")).toHaveCount(0, { timeout: 30_000 });

    // 2. advance without a due, submitted with a double click: exactly one receipt
    await page.locator("button", { hasText: locale === "ar" ? "تسجيل سند قبض جديد" : "New Receipt" }).click();
    await page.getByTestId("mode-advance").click();
    await page.getByTestId("amount-input").fill("700");
    await expect(page.getByTestId("advance-notice")).toBeVisible();
    await shot("02-record-advance-without-due");
    const submit = page.getByTestId("record-submit");
    await expect(submit).toBeEnabled();
    await submit.dblclick();
    await expect(page.getByTestId("record-payment-dialog")).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("advance-badge")).toHaveCount(1, { timeout: 60_000 });
    await shot("03-register-with-advance-badge");

    // 3. a receipt bigger than the due: the excess is spelled out and must be confirmed
    await page.locator("button", { hasText: locale === "ar" ? "تسجيل سند قبض جديد" : "New Receipt" }).click();
    await page.getByTestId("amount-input").fill("1200");
    await expect(page.getByTestId("advance-notice")).toBeVisible();
    await expect(submit).toBeDisabled();
    await shot("04-excess-needs-confirmation");
    await page.getByTestId("confirm-advance").click();
    await expect(submit).toBeEnabled();
    await submit.dblclick();
    await expect(page.getByTestId("record-payment-dialog")).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("advance-badge")).toHaveCount(2, { timeout: 60_000 });

    // 4. the credit dialog of the first advance, with an open due of the same unit to apply it to
    await issueDue(fx, 600, "UI-due-600");
    await page.reload();
    await page.locator('[data-testid^="credit-open-"]').first().click();
    await expect(page.getByTestId("payment-credit-dialog")).toBeVisible();
    await shot("05-credit-dialog");
  });
}

/** Browser coverage of apply / reverse (staff screen) and of the owner's portal statement, with the portal screenshot. */
for (const locale of ["ar", "en"] as const) {
  test(`apply, reverse and the portal statement (${locale})`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const shot = (name: string) => page.screenshot({ path: `${OUT}/${locale}-${name}.png`, fullPage: false });
    const fx = await createJourneyFixture(`adv-ui2-${locale}`);
    await issueDue(fx, 600, "UI-due-600");
    const owner = await signedInClient(fx.owner.email);
    const approve = await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2200"] });
    if (approve.error) throw new Error(approve.error.message);
    const period = await adminClient().from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", today).gte("end_date", today).single();
    const rec = await owner.rpc("record_advance_payment", {
      p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 1000, p_method: "CASH",
      p_payment_date: today, p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period.data!.id, p_allocations: [], p_idempotency_key: crypto.randomUUID(),
    });
    if (rec.error) throw new Error(rec.error.message);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, locale, fx.owner.email);

    // apply 400 of the 1000 credit to the 600 due, with a double click
    await page.goto(`/${locale}/finance/payments`);
    await page.locator('[data-testid^="credit-open-"]').first().click();
    await page.getByTestId("apply-form").getByRole("checkbox").first().click();
    await page.getByTestId("apply-form").locator('input[type="number"]').first().fill("400");
    await expect(page.getByTestId("apply-submit")).toBeEnabled();
    await shot("06-apply-credit-form");
    await page.getByTestId("apply-submit").dblclick();
    await expect(page.getByTestId("payment-credit-dialog")).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("credit-left")).toContainText(/[6٦][0٠][0٠]/, { timeout: 60_000 });

    // the unit page shows the remaining credit
    await page.goto(`/${locale}/property/${fx.unit.id}?tab=financials`);
    await expect(page.getByTestId("unit-credit-card")).toContainText(/[6٦][0٠][0٠]/, { timeout: 60_000 });

    // reverse the application with a reason
    await page.goto(`/${locale}/finance/payments`);
    await page.locator('[data-testid^="credit-open-"]').first().click();
    await expect(page.getByTestId("applications-list")).toBeVisible();
    await page.getByTestId("applications-list").getByRole("button").first().click();
    await page.locator("#reverse-reason").fill("applied to the wrong due");
    await shot("07-reverse-application-form");
    await page.getByTestId("reverse-submit").dblclick();
    await expect(page.getByTestId("payment-credit-dialog")).toHaveCount(0, { timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId("credit-left")).toContainText(/[1١][,.٬٫]?[0٠][0٠][0٠]/, { timeout: 60_000 });
  });
}

/** The owner's portal statement: three position cards as of the END of the filter, and the application / reversal as separate info lines. */
const numeric = (text: string) => (/[0-9٠-٩]/.test(text) ? Number(text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[٬,‏‎]/g, "").replace("٫", ".").replace(/[^0-9.\-−]/g, "").replace("−", "-")) : NaN);

for (const locale of ["ar", "en"] as const) {
  test(`portal statement position by end date (${locale})`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const fx = await createJourneyFixture(`adv-portal-${locale}`);
    const admin = adminClient();
    const owner = await signedInClient(fx.owner.email);
    const periodAt = async (d: string) => (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", d).gte("end_date", d).single()).data!.id as string;
    await issueDue(fx, 600, "Portal-due-600", "2026-09-01", "2026-09-15");
    const approve = await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2200"] });
    if (approve.error) throw new Error(approve.error.message);
    const rec = await owner.rpc("record_advance_payment", {
      p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 1000, p_method: "CASH",
      p_payment_date: "2026-09-05", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: await periodAt("2026-09-05"), p_allocations: [], p_idempotency_key: crypto.randomUUID(),
    });
    if (rec.error) throw new Error(rec.error.message);
    const paymentId = (rec.data as { payment_id: string }).payment_id;
    const dueId = (await admin.from("dues").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
    const apply = async (amount: number, date: string) => {
      const r = await owner.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: paymentId, p_allocations: [{ due_id: dueId, amount }], p_application_date: date, p_fiscal_period_id: await periodAt(date), p_idempotency_key: crypto.randomUUID() });
      if (r.error) throw new Error(r.error.message);
    };
    await apply(400, "2026-09-08");
    const first = (await admin.from("payment_allocations").select("id").eq("payment_id", paymentId).eq("kind", "CREDIT_APPLICATION").single()).data!.id as string;
    const rv = await owner.rpc("reverse_credit_application", { p_organization_id: fx.orgId, p_allocation_id: first, p_reason: "wrong due", p_reversal_date: "2026-09-10", p_fiscal_period_id: await periodAt("2026-09-10"), p_idempotency_key: crypto.randomUUID() });
    if (rv.error) throw new Error(rv.error.message);
    await apply(300, "2026-09-12");

    const email = `owner-${fx.tag}@demo.local`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    const link = await admin.from("members").update({ user_id: created.data.user!.id, email }).eq("id", fx.member.id);
    if (link.error) throw new Error(link.error.message);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await portalLogin(page, email);
    await page.goto(`/${locale}/portal/statement`);
    await expect(page.getByTestId("portal-position")).toBeVisible({ timeout: 60_000 });

    const read = async () => ({
      arrears: numeric(await page.getByTestId("pos-arrears").innerText()),
      credit: numeric(await page.getByTestId("pos-credit").innerText()),
      net: numeric(await page.getByTestId("pos-net").innerText()),
    });
    const toInput = page.locator('input[type="date"]').nth(1);
    const expectAt = async (to: string, want: { arrears: number; credit: number; net: number }) => {
      await toInput.fill(to);
      await expect.poll(read, { timeout: 30_000, message: `position as of ${to}` }).toEqual(want);
    };
    // net does not move once the receipt exists: application and reversal change arrears and credit by the same amount
    await expectAt("2026-09-03", { arrears: 0, credit: 0, net: 600 });
    await expectAt("2026-09-06", { arrears: 0, credit: 1000, net: -400 });
    await expectAt("2026-09-09", { arrears: 0, credit: 600, net: -400 });
    await expectAt("2026-09-11", { arrears: 0, credit: 1000, net: -400 });
    await expectAt("2026-09-20", { arrears: 300, credit: 700, net: -400 });

    // the ledger's own closing balance agrees with the net, and the info lines carry no amount in the debit/credit columns
    await toInput.fill("2026-09-20");
    const infoRows = page.locator('tr[data-kind="APPLICATION"], tr[data-kind="REVERSAL"]');
    await expect(infoRows).toHaveCount(3);
    await expect(page.locator('tr[data-kind="REVERSAL"]')).toHaveCount(1);
    await expect(page.locator('tr[data-kind="APPLICATION"]')).toHaveCount(2);
    await expect(page.getByTestId("portal-info-line")).toHaveCount(3);
    await page.screenshot({ path: `${OUT}/${locale}-09-portal-position-2026-09-20.png` });
    await toInput.fill("2026-09-09");
    await expect.poll(read, { timeout: 30_000 }).toEqual({ arrears: 0, credit: 600, net: -400 });
    await page.screenshot({ path: `${OUT}/${locale}-10-portal-position-2026-09-09.png` });
    // newest line first: its running balance is the ledger's closing balance, which equals the net
    const rowTexts = await page.locator("tbody tr").evaluateAll((trs) => trs.map((tr) => (tr as HTMLElement).innerText.replace(/\s+/g, " ")));
    expect(numeric(await page.locator("tbody tr").first().locator("td:last-child").innerText()), `rows: ${JSON.stringify(rowTexts)}`).toBe(-400);
  });
}
