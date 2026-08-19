import { test, expect } from "@playwright/test";

test.describe("Enterprise Suite 3-Pillar Comprehensive Flow", () => {
  test("Verify Fiscal Periods, Real Estate Entities & Platform Dashboard", async ({ page }) => {
    // 1. Sign in
    await page.goto("http://localhost:3100/ar/login");
    await page.fill('input[type="email"], input[name="email"]', "owner@resortos.local");
    await page.fill('input[type="password"], input[name="password"]', "ResortOS@2026");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 15000 });

    // 2. Test Executive Platform Dashboard (/dashboard)
    await page.goto("http://localhost:3100/ar/dashboard");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("text=الفترات والإقفال")).toBeVisible();

    // 3. Test Fiscal Periods & Closing Governance (/admin/finance/periods)
    await page.goto("http://localhost:3100/ar/admin/finance/periods");
    await expect(page.locator("h1")).toContainText("السنوات والفترات والإقفال المحاسبي");
    await expect(page.locator("text=مساعد الإقفال السنوي وترحيل الأرصدة").first()).toBeVisible();

    // 4. Test Real Estate Entities & Projects (/admin/resorts & /property)
    await page.goto("http://localhost:3100/ar/admin/resorts");
    await expect(page.locator("h1")).toContainText("الكيانات والمشاريع العقارية");
    await expect(page.locator("text=نسبة الإشغال الإجمالية")).toBeVisible();

    await page.goto("http://localhost:3100/ar/property");
    await expect(page.locator("h1")).toContainText("دليل الوحدات العقارية والملكيات");
  });
});
