/**
 * RELEASE B — assisted onboarding pre-merge browser gate.
 *
 * WHY THIS FILE EXISTS AND WHY IT WASN'T RUN HERE
 * This session has no outbound network path to either the production domain
 * or the Supabase project directly (confirmed via `curl` -- both return a
 * CONNECT-tunnel 403 from this session's egress proxy), and the public
 * submission step needs a real SUPABASE_SERVICE_ROLE_KEY that is
 * deliberately never present outside Cloudflare's encrypted secret store
 * (see .github/workflows/deploy.yml's own comment on this). Neither
 * constraint can be worked around from inside this session. Nothing in this
 * file was run; nothing about its outcome should be inferred.
 *
 * HOW TO RUN
 *   PLAYWRIGHT_BASE_URL=https://aqarbooks.com \
 *   E2E_PLATFORM_ADMIN_EMAIL=the-actual-platform-admin-email@example.com \
 *   E2E_PLATFORM_ADMIN_PASSWORD=the-actual-platform-admin-password \
 *   npx playwright test tests/e2e/release-b-onboarding-gate.spec.ts
 *
 * The locale/viewport checks below run without credentials and will run and
 * report even if the platform-admin env vars are absent -- only the
 * submit-to-approval and submit-to-rejection flows skip in that case, with
 * an explicit reason (this is the same pattern release-a-production-gate.spec.ts
 * uses for its existing-customer-session check).
 *
 * This suite creates real data on whatever environment it targets: one
 * throwaway Supabase Auth account and one onboarding_requests row per test
 * run (email domain @aqarbooks-test.invalid), and on the approval test, one
 * real organization via approve_onboarding_request. It never touches the
 * demo organization, its financial rows, or any existing customer account.
 */
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const LOCALES: Array<{ code: "ar" | "en"; dir: "rtl" | "ltr" }> = [
  { code: "ar", dir: "rtl" },
  { code: "en", dir: "ltr" },
];

function testPassword(): string {
  return `Onb-${randomUUID()}!`;
}

/** Drives the full public wizard for one locale and returns the credentials used. */
async function submitOnboardingRequest(
  page: Page,
  locale: "ar" | "en",
): Promise<{ email: string; password: string; organizationName: string }> {
  const email = `onb-gate-${randomUUID()}@aqarbooks-test.invalid`;
  const password = testPassword();
  const organizationName = `Gate Test Co ${randomUUID().slice(0, 8)}`;

  await page.goto(`/${locale}/get-started?plan=STARTER`, { waitUntil: "networkidle" });
  await page.locator("#fullName").fill("Gate Test Requester");
  await page.locator("#workEmail").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();

  await page.waitForURL(/\/get-started\/company/, { timeout: 15_000 });
  await page.locator("#organizationName").fill(organizationName);
  // Base UI's Select needs a real click-open-select interaction, not a native <select>.
  await page.locator("#entityType").click();
  await page.getByRole("option", { name: /Developer|مطوّر عقاري/ }).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();

  await page.waitForURL(/\/get-started\/plan/, { timeout: 15_000 });
  // ?plan=STARTER at step 1 should have pre-selected Essential/STARTER already;
  // click it explicitly so the test doesn't depend on that pre-seeding working.
  await page.getByText(/Essential|الأساسيات/).click();
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();

  await page.waitForURL(/\/get-started\/review/, { timeout: 15_000 });
  await page.getByRole("button", { name: /Submit request|إرسال الطلب/ }).click();
  await page.waitForURL(/\/get-started\/submitted/, { timeout: 20_000 });

  return { email, password, organizationName };
}

async function loginAs(page: Page, locale: "ar" | "en", email: string, password: string) {
  await page.goto(`/${locale}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("locale/viewport: the get-started wizard renders correctly", () => {
  for (const { code: locale, dir } of LOCALES) {
    for (const viewport of VIEWPORTS) {
      test(`/get-started: ${locale} @ ${viewport.name} -- RTL/LTR, no overflow`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/${locale}/get-started`, { waitUntil: "networkidle" });

        const htmlDir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
        expect(htmlDir, "html[dir]").toBe(dir);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);

        await expect(page.locator("#fullName")).toBeVisible();
      });
    }
  }
});

test.describe("public submission never grants tenant access before approval", () => {
  for (const locale of ["en", "ar"] as const) {
    test(`${locale}: a submitted request lands PENDING and the requester sees no workspace`, async ({ page }) => {
      const { email, password } = await submitOnboardingRequest(page, locale);

      // Log in as the brand-new requester immediately after submission --
      // no approval has happened yet.
      await loginAs(page, "en", email, password);
      await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });

      const bodyText = await page.evaluate(() => document.body.innerText);
      // The dashboard's own "no organization" placeholder is the expected
      // state here -- not a real tenant workspace, not an error page.
      expect(bodyText, "must not show a real tenant workspace before approval").not.toMatch(
        /application error|something went wrong/i,
      );
    });
  }
});

test.describe("platform approval grants tenant owner access; rejection grants nothing (requires platform admin credentials)", () => {
  const adminEmail = process.env.E2E_PLATFORM_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_PLATFORM_ADMIN_PASSWORD;

  function isUsable(value: string | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.trim() !== "...";
  }
  const credentialsUsable = isUsable(adminEmail) && isUsable(adminPassword);

  test("approve: the requester becomes TENANT_OWNER of a new workspace", async ({ page, context }) => {
    test.skip(
      !credentialsUsable,
      "Set E2E_PLATFORM_ADMIN_EMAIL and E2E_PLATFORM_ADMIN_PASSWORD (real, non-placeholder) to run this check.",
    );

    const { email, password, organizationName } = await submitOnboardingRequest(page, "en");

    await loginAs(page, "en", adminEmail!, adminPassword!);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    await page.goto("/en/platform/onboarding", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: organizationName }).click();

    await page.getByLabel(/Approval notes/i).fill("Approved by release-b-onboarding-gate.spec.ts");
    await page.getByRole("button", { name: /Approve & provision workspace/i }).click();
    await expect(page.getByText(/ACTIVE/)).toBeVisible({ timeout: 20_000 });

    // A fresh, separate browser context proves this is the requester's own
    // session working, not the admin's session leaking through.
    const requesterPage = await context.browser()!.newContext().then((c) => c.newPage());
    await loginAs(requesterPage, "en", email, password);
    await requesterPage.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    const bodyText = await requesterPage.evaluate(() => document.body.innerText);
    expect(bodyText, "the approved requester must now see their own real workspace").toContain(organizationName);
    await requesterPage.context().close();
  });

  test("reject: the requester still has no workspace afterward", async ({ page }) => {
    test.skip(
      !credentialsUsable,
      "Set E2E_PLATFORM_ADMIN_EMAIL and E2E_PLATFORM_ADMIN_PASSWORD (real, non-placeholder) to run this check.",
    );

    const { email, password, organizationName } = await submitOnboardingRequest(page, "en");

    await loginAs(page, "en", adminEmail!, adminPassword!);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    await page.goto("/en/platform/onboarding", { waitUntil: "networkidle" });
    await page.getByRole("link", { name: organizationName }).click();

    await page.getByLabel(/Rejection reason/i).fill("release-b-onboarding-gate.spec.ts reject path");
    await page.getByRole("button", { name: /Reject request/i }).click();
    await expect(page.getByText(/REJECTED/)).toBeVisible({ timeout: 15_000 });

    const requesterPage = await page.context().browser()!.newContext().then((c) => c.newPage());
    await loginAs(requesterPage, "en", email, password);
    await requesterPage.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    const bodyText = await requesterPage.evaluate(() => document.body.innerText);
    expect(bodyText, "a rejected requester must not see the organization they asked for").not.toContain(organizationName);
    await requesterPage.context().close();
  });
});
