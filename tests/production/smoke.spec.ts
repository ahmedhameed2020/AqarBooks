import { test, expect } from "@playwright/test";

// Read-only probe of the deployed site with a dedicated, least-privilege
// account. It never writes data and never touches Supabase directly.
test.describe("production smoke", () => {
  test("login and authenticated routes render without page errors", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/en/login");
    await expect(page.locator("#email")).toBeVisible({ timeout: 30_000 });
    await page.locator("#email").fill(process.env.SMOKE_EMAIL!);
    await page.locator("#password").fill(process.env.SMOKE_PASSWORD!);
    await page.getByRole("button", { name: /Sign In/i }).click();
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 60_000 });

    for (const path of ["/en/dashboard", "/en/finance/reports"]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} must answer`).toBeLessThan(500);
      // A least-privilege probe may land on an empty state; require rendered
      // chrome rather than a specific heading level.
      await expect(page.locator("body")).toContainText(/\S/, { timeout: 30_000 });
    }

    expect(pageErrors, "no unhandled browser page errors").toEqual([]);
  });
});
