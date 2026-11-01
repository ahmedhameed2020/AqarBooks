import { mkdirSync } from "node:fs";
import { test, expect } from "./helpers/local-only";
import type { Page } from "@playwright/test";
import { createJourneyFixture, PASSWORD, type JourneyFixture } from "./helpers/accounting-fixture";

let fx: JourneyFixture;

async function go(page: Page, url: string) {
  try {
    await page.goto(url);
  } catch (error) {
    if (!/ERR_ABORTED|detached/.test(String(error))) throw error;
    await page.goto(url);
  }
}

test.beforeAll(async () => {
  fx = await createJourneyFixture("dashboard-bi1");
});

test("BI-1 dashboard uses precise accrual and collection semantics in English and Arabic", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await go(page, "/en/login");
  await page.locator("#email").fill(fx.accountant.email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

  await expect(page.getByText("Total Revenue — accrual (EGP)", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Expenses — accrual (EGP)", { exact: true })).toBeVisible();
  await expect(page.getByText("Monthly accrual revenue and expense comparison", { exact: true })).toBeVisible();
  await expect(page.getByText("Cumulative collection target: 90%", { exact: false })).toBeVisible();
  await expect(page.getByText("Monthly budget and cashflow comparison", { exact: true })).toHaveCount(0);

  mkdirSync("working files/bi1", { recursive: true });
  await page.screenshot({ path: "working files/bi1/dashboard-en.png", fullPage: true });

  await go(page, "/ar/dashboard");
  await expect(page.getByText("إجمالي الإيرادات الاستحقاقية (EGP)", { exact: true })).toBeVisible();
  await expect(page.getByText("إجمالي المصروفات الاستحقاقية (EGP)", { exact: true })).toBeVisible();
  await expect(page.getByText("مقارنة شهرية للإيرادات والمصروفات الاستحقاقية", { exact: true })).toBeVisible();
  await expect(page.getByText("هدف التحصيل الإجمالي: 90%", { exact: false })).toBeVisible();
  await page.screenshot({ path: "working files/bi1/dashboard-ar.png", fullPage: true });

  expect(browserErrors).toEqual([]);
});
