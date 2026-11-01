import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { addBankAccount, adminClient, createJourneyFixture, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";

/**
 * Migration 20261018100000: the GL-account choices of the "Add Cashbox" (cashier) and "Add Account" (banks) dialogs offer only cash-like accounts
 * (the database refuses any other). Real screens on the isolated stack: the normal list, and the EMPTY list (no cash-like account at all), where the
 * dialog explains why and cannot be saved.
 */
async function signIn(page: Page, locale: string, email: string) {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90_000 });
}

const OTHER_CODES = ["1130", "1140", "1210", "1220", "2250", "2200"];

async function openGlSelect(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const combo = dialog.getByRole("combobox").last();
  await combo.click();
  return dialog;
}
async function optionCodes(page: Page): Promise<string[]> {
  const texts = await page.getByRole("option").allInnerTexts();
  return texts.map((t) => (t.match(/\b(\d{4})\b/) ?? [])[1]).filter(Boolean) as string[];
}

test.describe.serial("treasury dialogs: only cash-like GL accounts", () => {
  let fx: JourneyFixture;

  test("cashier page: the Add Cashbox dialog offers 1110 and 1120 only", async ({ page }) => {
    fx = await createJourneyFixture("trs-ui");
    await addBankAccount(fx);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "en", fx.owner.email);
    await page.goto("/en/finance/cashier");
    await page.getByRole("button", { name: /Add Cashbox/ }).first().click();
    await openGlSelect(page);
    const codes = await optionCodes(page);
    expect(codes.sort(), "offered codes").toEqual(["1110", "1120"]);
    for (const c of OTHER_CODES) expect(codes).not.toContain(c);
    await expect(page.getByTestId("gl-accounts-empty")).toHaveCount(0);
  });

  test("banks page: the Add Account dialog offers 1110 and 1120 only", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "en", fx.owner.email);
    await page.goto("/en/finance/banks");
    await page.getByRole("button", { name: /Add Account/ }).first().click();
    await openGlSelect(page);
    const codes = await optionCodes(page);
    expect(codes.sort(), "offered codes").toEqual(["1110", "1120"]);
    for (const c of OTHER_CODES) expect(codes).not.toContain(c);
  });

  test("EMPTY list: no cash-like account in the organization — both dialogs say why (en) and cannot be saved; Arabic text too", async ({ page }) => {
    const admin = adminClient();
    const upd = await admin.from("chart_of_accounts").update({ is_cash_equivalent: false }).eq("organization_id", fx.orgId);
    expect(upd.error).toBeNull();
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, "en", fx.owner.email);

    await page.goto("/en/finance/cashier");
    await page.getByRole("button", { name: /Add Cashbox/ }).first().click();
    let dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("gl-accounts-empty")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByTestId("gl-accounts-empty")).toContainText("cash-equivalent");
    await dialog.getByRole("textbox").first().fill("Should not save");
    await expect(dialog.getByRole("button", { name: /Save Cashbox/ })).toBeDisabled();
    await dialog.getByRole("combobox").last().click();
    expect(await page.getByRole("option").count(), "options in the empty list").toBe(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await page.goto("/en/finance/banks");
    await page.getByRole("button", { name: /Add Account/ }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("gl-accounts-empty")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: /Save|Create|Add Account/ }).last()).toBeDisabled();

    await page.goto("/ar/finance/cashier");
    await page.getByRole("button", { name: /إضافة صندوق خزينة/ }).first().click();
    await expect(page.getByRole("dialog").getByTestId("gl-accounts-empty")).toContainText("نقدية");
    expect(await adminClient().from("cashboxes").select("id", { count: "exact", head: true }).eq("organization_id", fx.orgId).ilike("name", "Should not save").then((r) => r.count)).toBe(0);
  });
});
