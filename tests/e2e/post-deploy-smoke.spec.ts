import { test, expect } from "@playwright/test";

/**
 * Post-deploy smoke: runs against ANY environment via PLAYWRIGHT_BASE_URL.
 * It never creates fixtures or writes data — a probe account is supplied by the
 * operator through SMOKE_EMAIL / SMOKE_PASSWORD. Where no probe account exists,
 * the test skips by design instead of inventing one.
 */
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;

test.describe("post-deploy smoke", () => {
  test.skip(
    !email || !password,
    "SMOKE_EMAIL/SMOKE_PASSWORD not provided: smoke is skip-by-design without a probe account",
  );

  test("public login and authenticated finance surfaces answer without page errors", async ({ page }) => {
    test.setTimeout(150_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/en/login");
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });

    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: /Sign In/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

    await page.goto("/en/admin/finance/periods");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    await page.goto("/en/finance/reports");
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });

    expect(pageErrors, "no unhandled browser page errors").toEqual([]);
  });
});
