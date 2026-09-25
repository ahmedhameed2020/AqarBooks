import { expect, test } from "@playwright/test";

test.describe("Fawry production foundation fail-closed gates", () => {
  test("payment settings require authentication", async ({ page }) => {
    await page.goto("/en/finance/payment-providers");

    await expect(page).toHaveURL(/\/en\/login/);
    await expect(page.getByRole("button", { name: /sign in|تسجيل الدخول/i })).toBeVisible();
  });

  test("durable-event retry endpoint rejects unauthenticated callers", async ({ request }) => {
    const response = await request.post("/api/cron/payment-events");

    expect([401, 503]).toContain(response.status());
    expect(await response.json()).toEqual(
      response.status() === 401 ? { error: "unauthorized" } : { error: "not_configured" }
    );
  });
});
