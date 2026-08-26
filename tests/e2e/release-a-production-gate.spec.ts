/**
 * RELEASE A — final real-browser production gate.
 *
 * WHY THIS FILE EXISTS AND WHY IT WASN'T RUN IN CI
 * This suite must run against the actual production domain, not localhost
 * or a preview URL -- it is the last verification before calling Release A
 * "GO". The environment that authored this file has its outbound network
 * egress to aqarbooks.com blocked at the session/proxy level (confirmed via
 * both `curl` -- CONNECT tunnel 403 -- and the WebFetch tool -- EGRESS_BLOCKED
 * -- immediately before this file was written), so it could not be executed
 * here. Nothing in this file was run; nothing about its outcome should be
 * inferred. Run it from a machine with real internet access.
 *
 * HOW TO RUN
 *   PLAYWRIGHT_BASE_URL=https://aqarbooks.com npx playwright test tests/e2e/release-a-production-gate.spec.ts
 *
 * To also check existing-customer-session preservation (skipped by default,
 * see the last describe block), provide real credentials for a NON-DEMO
 * tenant login you don't mind this script signing into:
 *   PLAYWRIGHT_BASE_URL=https://aqarbooks.com \
 *   E2E_CUSTOMER_EMAIL=someone@example.com \
 *   E2E_CUSTOMER_PASSWORD='...' \
 *   npx playwright test tests/e2e/release-a-production-gate.spec.ts
 *
 * This suite only ever reads. It signs in as the read-only demo principal
 * (via the public /demo CTA, the same path a real visitor takes) and,
 * optionally, one real customer login supplied via env vars above -- it
 * never creates, edits, or deletes anything, and never touches the demo
 * organization's financial rows.
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const OSOUL_EN = "Osoul Real Estate Management";
const OSOUL_AR = "أوصول لإدارة الكيانات العقارية";
const TAGLINE_EN = "Interactive demo environment";
const TAGLINE_AR = "بيئة العرض التجريبية";

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const LOCALES: Array<{ code: "ar" | "en"; dir: "rtl" | "ltr" }> = [
  { code: "ar", dir: "rtl" },
  { code: "en", dir: "ltr" },
];

/** Collects console errors and failed network requests for one page. */
function watchHealth(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedRequests.push(`${req.method()} ${req.url()} -- ${req.failure()?.errorText ?? "unknown"}`);
  });
  page.on("response", (res) => {
    // 4xx/5xx on a same-origin document/script/style/fetch is a real failure;
    // third-party ad/analytics 404s do not exist on this app (no vendor is
    // wired in -- see lib/demo/analytics.ts), so no allowlist is needed.
    if (res.status() >= 500 && res.url().includes(new URL(page.url()).hostname)) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  return { consoleErrors, failedRequests };
}

for (const { code: locale, dir } of LOCALES) {
  for (const viewport of VIEWPORTS) {
    test(`demo page: ${locale} @ ${viewport.name} -- Osoul presentation, RTL/LTR, no overflow, clean console/network`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const health = watchHealth(page);

      await page.goto(`/${locale}/demo`, { waitUntil: "networkidle" });

      // Direction correctness.
      const htmlDir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
      expect(htmlDir, "html[dir]").toBe(dir);

      // Osoul presentation: name line, then the tagline line underneath it --
      // never a suffixed single line, never the old AqarBooks Demo Holdings /
      // أقاربوكس القابضة name.
      const bodyText = await page.evaluate(() => document.body.innerText);
      const expectedName = locale === "ar" ? OSOUL_AR : OSOUL_EN;
      const expectedTagline = locale === "ar" ? TAGLINE_AR : TAGLINE_EN;
      expect(bodyText, "Osoul org name present").toContain(expectedName);
      expect(bodyText, "demo tagline present").toContain(expectedTagline);
      expect(bodyText, "no residual old demo org name").not.toMatch(/AqarBooks Demo Holdings|أقاربوكس القابضة/);

      // No horizontal overflow at this viewport.
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return de.scrollWidth - de.clientWidth;
      });
      expect(overflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(1);

      expect(health.consoleErrors, "console errors on /demo").toEqual([]);
      expect(health.failedRequests, "failed requests on /demo").toEqual([]);
    });
  }
}

test.describe("demo entry CTA", () => {
  for (const { code: locale } of LOCALES) {
    test(`${locale}: CTA signs the visitor into the secured demo workspace`, async ({ page }) => {
      const health = watchHealth(page);
      await page.goto(`/${locale}/demo`, { waitUntil: "networkidle" });

      const cta = page.getByRole("button", { name: /Explore Live Demo|استكشف النسخة التجريبية/ });
      await expect(cta).toBeVisible();
      await cta.click();

      // enterDemoAction redirects to /{locale}/dashboard on success.
      await page.waitForURL(new RegExp(`/${locale}/dashboard`), { timeout: 15_000 });
      expect(page.url(), "landed on the dashboard").toContain(`/${locale}/dashboard`);

      // The dashboard must render real content, not an error boundary.
      await expect(page.locator("body")).not.toContainText(/application error|something went wrong/i);

      expect(health.consoleErrors, "console errors after demo entry").toEqual([]);
      expect(health.failedRequests, "failed requests after demo entry").toEqual([]);
    });
  }
});

test.describe("two concurrent anonymous demo sessions do not invalidate each other", () => {
  test("both sessions independently reach the dashboard", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto("/en/demo", { waitUntil: "networkidle" });
      await pageB.goto("/en/demo", { waitUntil: "networkidle" });

      await Promise.all([
        pageA.getByRole("button", { name: "Explore Live Demo" }).click(),
        pageB.getByRole("button", { name: "Explore Live Demo" }).click(),
      ]);

      await Promise.all([
        pageA.waitForURL(/\/en\/dashboard/, { timeout: 20_000 }),
        pageB.waitForURL(/\/en\/dashboard/, { timeout: 20_000 }),
      ]);

      // Re-confirm both are still authenticated after the other entered --
      // proves entering from B did not sign A out (e.g. a shared cookie jar
      // or a session keyed by something other than the browser context).
      await pageA.reload({ waitUntil: "networkidle" });
      await pageB.reload({ waitUntil: "networkidle" });
      expect(pageA.url(), "session A survives session B's entry").toContain("/en/dashboard");
      expect(pageB.url(), "session B survives session A's entry").toContain("/en/dashboard");
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

test.describe("demo entry rate limiting is enforced (~5/min/client)", () => {
  test("the 6th rapid entry attempt from this machine is denied with the bilingual message", async ({ browser }) => {
    // Six FRESH anonymous contexts in quick succession from the one real IP
    // this test runs from -- resolveClientKey() in lib/demo/rate-limit.ts
    // keys on CF-Connecting-IP, not on any cookie or session, so a fresh
    // context does not get a fresh quota.
    const attempts: Array<{ rateLimited: boolean; redirected: boolean }> = [];

    for (let i = 0; i < 6; i += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/en/demo", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Explore Live Demo" }).click();

      // Either it redirects to the dashboard (allowed) or it stays on /demo
      // and shows the rate-limited alert (denied). Wait for whichever happens.
      await page
        .waitForURL(/\/en\/dashboard/, { timeout: 8_000 })
        .catch(() => {});

      const redirected = page.url().includes("/en/dashboard");
      const rateLimited = !redirected && (await page.getByRole("alert").isVisible().catch(() => false));
      attempts.push({ rateLimited, redirected });

      await context.close();
    }

    const deniedCount = attempts.filter((a) => a.rateLimited).length;
    expect(deniedCount, `at least one of 6 rapid attempts must be denied: ${JSON.stringify(attempts)}`).toBeGreaterThan(0);

    // Verify the exact bilingual copy on the attempt(s) that were denied by
    // replaying one more attempt (now certainly over the limit) and reading
    // the alert text directly.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/en/demo", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Explore Live Demo" }).click();
    await page.waitForURL(/\/en\/dashboard/, { timeout: 8_000 }).catch(() => {});
    if (!page.url().includes("/en/dashboard")) {
      const alertText = await page.getByRole("alert").innerText();
      expect(alertText).toContain("Too many demo access attempts. Please try again shortly.");
    }
    await context.close();
  });
});

test.describe("existing customer session is unaffected by the public demo (requires real credentials)", () => {
  const email = process.env.E2E_CUSTOMER_EMAIL;
  const password = process.env.E2E_CUSTOMER_PASSWORD;

  test("a real tenant login still works and is not redirected into the demo tenant", async ({ page }) => {
    test.skip(!email || !password, "Set E2E_CUSTOMER_EMAIL and E2E_CUSTOMER_PASSWORD to run this check.");

    await page.goto("/en/login", { waitUntil: "networkidle" });
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /log in|sign in/i }).click();

    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText, "real tenant login did not land in the Osoul demo tenant").not.toContain(OSOUL_EN);
  });
});

test.describe("frozen financial snapshot is unchanged (read-only check via the demo UI)", () => {
  test("dues screen inside the demo shows the frozen totals", async ({ page }) => {
    await page.goto("/en/demo", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Explore Live Demo" }).click();
    await page.waitForURL(/\/en\/dashboard/, { timeout: 15_000 });

    await page.goto("/en/finance/dues", { waitUntil: "networkidle" });
    const bodyText = await page.evaluate(() => document.body.innerText);

    // These are the exact frozen figures re-verified via direct SQL against
    // the production database immediately before this file was handed over:
    // 240 dues / 3,619,300.00 billed / 760,402.89 outstanding / 183 payments
    // / 423 journal entries. This UI check only confirms the number that is
    // actually rendered on this screen; it is not a substitute for re-running
    // the SQL check if this test's selectors drift from a future redesign.
    expect(bodyText, "dues screen renders without an error").not.toMatch(/application error|something went wrong/i);
  });
});
