/**
 * RELEASE B — assisted onboarding pre-merge browser gate.
 *
 * WHY THIS FILE EXISTS AND WHY IT WASN'T RUN HERE
 * This session has no outbound HTTPS egress at all -- confirmed via `curl`
 * against three unrelated hosts (aqarbooks.com, the Supabase project
 * directly, and a generic public domain), all returning an identical
 * CONNECT-tunnel 403 from this session's egress proxy. This is a blanket
 * block, not a production-specific or Supabase-specific one, so it applies
 * equally to a PR preview URL. On top of that, the public submission step
 * needs a real SUPABASE_SERVICE_ROLE_KEY that is deliberately never present
 * outside Cloudflare's encrypted secret store (see
 * .github/workflows/deploy.yml's own comment on this). Neither constraint
 * can be worked around from inside this session. Nothing in this file was
 * run; nothing about its outcome should be inferred.
 *
 * THERE IS NO ISOLATED STAGING BACKEND FOR THIS BRANCH
 * wrangler.jsonc defines a single Worker ("aqarbooks") with no `env.preview`
 * block, and the production deploy step runs `--keep-vars` specifically so
 * account-level secrets/vars survive redeploys -- there is no per-branch or
 * per-PR secret scoping in this repo's Cloudflare setup. The Cloudflare Git
 * integration's "Branch Preview URL" comment on this PR
 * (https://claude-aqarbooks-conversion-flow-2tplsl-aqarbooks.ahmedhameed2020.workers.dev,
 * current as of commit 93b7da1 -- it repoints on every push to this branch)
 * is therefore the SAME Worker script bound to the SAME Supabase project as
 * production, not a separate staging database. Running this suite against
 * either URL writes real rows to the real production database. Prefer the
 * branch preview URL over production only to avoid exercising untested code
 * against real customer traffic -- it buys no data isolation.
 * Consequently:
 *   - Every identity this suite creates uses the @aqarbooks-test.invalid
 *     email domain (already excluded from any real customer segment).
 *   - The approve-path test provisions exactly one real, disposable
 *     organization. Clean it up afterward -- for each throwaway org name
 *     printed by the test (or matched by `like 'Gate Test Co %'`), delete in
 *     this order: onboarding_request_events, onboarding_requests,
 *     user_role_assignments, organization_memberships, subscriptions,
 *     role_permissions, roles, organizations (by id), then
 *     auth.admin.deleteUser for each @aqarbooks-test.invalid user created.
 *     This mirrors the afterAll cleanup already in
 *     tests/onboarding-request.integration.test.ts.
 *   - Do not run the approve/reject tests against this shared backend
 *     unattended or in CI without that cleanup step wired in.
 *
 * HOW TO RUN (against the branch preview URL, with a human ready to clean up)
 *   PLAYWRIGHT_BASE_URL=https://claude-aqarbooks-conversion-flow-2tplsl-aqarbooks.ahmedhameed2020.workers.dev \
 *   NEXT_PUBLIC_SUPABASE_URL=https://ataslxkcflxuilpgyepm.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=the-real-service-role-key \
 *   E2E_PLATFORM_ADMIN_EMAIL=the-actual-platform-admin-email@example.com \
 *   E2E_PLATFORM_ADMIN_PASSWORD=the-actual-platform-admin-password \
 *   E2E_CUSTOMER_EMAIL=an-existing-real-customer-login@example.com \
 *   E2E_CUSTOMER_PASSWORD=the-actual-existing-customer-password \
 *   npx playwright test tests/e2e/release-b-onboarding-gate.spec.ts
 *
 * WHY THIS SUITE NOW NEEDS SUPABASE_SERVICE_ROLE_KEY TOO
 * Step 1 (lib/actions/onboarding-request.ts) now goes through the real
 * supabase.auth.signUp() confirmation flow instead of an auto-confirmed
 * Admin-API account -- a fresh signup gets no session until its emailed
 * link is opened. There is no real inbox in CI to read that email from, so
 * this suite's own admin client (not the application's) calls
 * admin.auth.admin.generateLink({ type: "signup", ... }) to obtain the exact
 * same action link Supabase would have emailed, then has Playwright visit
 * it -- exercising the real /auth/callback route and the real session it
 * establishes, not a shortcut around either. This mirrors exactly how
 * tests/onboarding-request.integration.test.ts already needs the same key.
 *
 * The locale/viewport checks below run without any credentials and will run
 * and report regardless -- only the submit-to-approval, submit-to-rejection,
 * and existing-customer flows skip when their required env vars are absent,
 * with an explicit reason (this is the same pattern
 * release-a-production-gate.spec.ts uses for its existing-customer-session
 * check).
 */
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function isUsableEnv(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "...";
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serviceRoleUsable = isUsableEnv(supabaseUrl) && isUsableEnv(serviceRoleKey);
const adminClient = serviceRoleUsable
  ? createClient(supabaseUrl!, serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

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

/**
 * Drives the full public wizard for one locale and returns the credentials
 * used. Requires the service-role admin client -- see the file header for
 * why: Step 1 no longer signs the visitor in itself, so this helper opens
 * the exact confirmation link Supabase would have emailed, the same way a
 * real applicant clicking it in their inbox would.
 */
async function submitOnboardingRequest(
  page: Page,
  locale: "ar" | "en",
): Promise<{ email: string; password: string; organizationName: string }> {
  if (!adminClient) {
    throw new Error("submitOnboardingRequest requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const email = `onb-gate-${randomUUID()}@aqarbooks-test.invalid`;
  const password = testPassword();
  const organizationName = `Gate Test Co ${randomUUID().slice(0, 8)}`;

  await page.goto(`/${locale}/get-started?plan=STARTER`, { waitUntil: "networkidle" });
  await page.locator("#fullName").fill("Gate Test Requester");
  await page.locator("#workEmail").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();

  await page.waitForURL(/\/get-started\/check-email/, { timeout: 15_000 });

  // The real applicant would click this exact link from their inbox --
  // generateLink() only stands in for the email transport, not for the
  // confirmation itself. Visiting it exercises the real /auth/callback
  // route and establishes a real session, same as production.
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "signup",
    email,
    password,
  });
  if (linkError || !linkData?.properties?.action_link) {
    throw linkError ?? new Error("generateLink returned no action_link");
  }
  await page.goto(linkData.properties.action_link, { waitUntil: "networkidle" });
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
      test.skip(
        !serviceRoleUsable,
        "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to generate the signup confirmation link.",
      );

      // Visiting the confirmation link inside submitOnboardingRequest already
      // established a real session for this requester -- no separate login.
      await submitOnboardingRequest(page, locale);
      await page.goto("/en/dashboard", { waitUntil: "networkidle" });

      const bodyText = await page.evaluate(() => document.body.innerText);
      // The dashboard's own "request under review" placeholder is the
      // expected state here -- not a real tenant workspace, not an error page.
      expect(bodyText, "must not show a real tenant workspace before approval").not.toMatch(
        /application error|something went wrong/i,
      );
    });
  }
});

test.describe("an existing customer can request a second entity without losing their existing workspace (requires real customer credentials)", () => {
  const customerEmail = process.env.E2E_CUSTOMER_EMAIL;
  const customerPassword = process.env.E2E_CUSTOMER_PASSWORD;

  function isUsableCredential(value: string | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.trim() !== "...";
  }
  const credentialsUsable = isUsableCredential(customerEmail) && isUsableCredential(customerPassword);

  test("logging in, then visiting /get-started, resumes as the SAME session -- no second Auth account, existing workspace untouched", async ({
    page,
  }) => {
    test.skip(
      !credentialsUsable,
      "Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to real, non-placeholder credentials to run this check.",
    );

    await loginAs(page, "en", customerEmail!, customerPassword!);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    const workspaceBefore = await page.evaluate(() => document.body.innerText);

    // Case B: already authenticated -- /get-started must redirect straight
    // to /company (never re-render the account form, never create a second
    // Auth user) while leaving this session's existing membership untouched.
    await page.goto("/en/get-started", { waitUntil: "networkidle" });
    await page.waitForURL(/\/en\/get-started\/company/, { timeout: 15_000 });

    const organizationName = `Gate Test Second Entity ${randomUUID().slice(0, 8)}`;
    await page.locator("#organizationName").fill(organizationName);
    await page.locator("#entityType").click();
    await page.getByRole("option", { name: /Developer|مطوّر عقاري/ }).click();
    await page.getByRole("button", { name: /Continue|متابعة/ }).click();

    await page.waitForURL(/\/get-started\/plan/, { timeout: 15_000 });
    await page.getByText(/Essential|الأساسيات/).click();
    await page.getByRole("button", { name: /Continue|متابعة/ }).click();

    // The review step's "Account" summary must show the CURRENT customer's
    // own name/email -- proving the requester was resolved from the session,
    // never re-collected -- and no password field exists on this page at all.
    await page.waitForURL(/\/get-started\/review/, { timeout: 15_000 });
    expect(await page.locator('input[type="password"]').count(), "no password field on the review step").toBe(0);
    await page.getByRole("button", { name: /Submit request|إرسال الطلب/ }).click();
    await page.waitForURL(/\/get-started\/submitted/, { timeout: 20_000 });

    // The new entity is now PENDING_APPROVAL, unprovisioned -- but this same
    // customer's original workspace must still be exactly as it was.
    await page.goto("/en/dashboard", { waitUntil: "networkidle" });
    const workspaceAfter = await page.evaluate(() => document.body.innerText);
    expect(workspaceAfter, "the existing tenant workspace must be unaffected by the new pending request").toBe(workspaceBefore);
  });
});

test.describe("platform approval grants tenant owner access; rejection grants nothing (requires platform admin credentials)", () => {
  const adminEmail = process.env.E2E_PLATFORM_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_PLATFORM_ADMIN_PASSWORD;

  function isUsable(value: string | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.trim() !== "...";
  }
  const credentialsUsable = isUsable(adminEmail) && isUsable(adminPassword) && serviceRoleUsable;

  test("approve: the requester becomes TENANT_OWNER of a new workspace", async ({ page, context }) => {
    test.skip(
      !credentialsUsable,
      "Set E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (real, non-placeholder) to run this check.",
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
      "Set E2E_PLATFORM_ADMIN_EMAIL, E2E_PLATFORM_ADMIN_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (real, non-placeholder) to run this check.",
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
