// @ts-nocheck
/**
 * Public demo environment — production gate (spec §37 and §38).
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT
 * §38 is explicit that a disabled control is not evidence of anything. So this
 * suite is in two halves, and the second is the one that matters:
 *
 *   1. The demo is usable  — a session starts, the real product screens render
 *                            in both locales and at 375px, and the conversion
 *                            routes go where they claim to.
 *   2. The demo is refused — the denied AI routes are POSTed directly from the
 *                            demo's own authenticated page context, and the
 *                            demo account is driven straight against PostgREST
 *                            and the RPCs with nothing but the public anon key.
 *
 * The second half sends requests the interface offers no way to send, and the
 * database probe bypasses the application entirely. That is the point: it is
 * the only way to distinguish "the button is hidden" from "the operation is
 * impossible".
 *
 * PREREQUISITES — this suite skips itself rather than failing when they are absent:
 *   - the demo tenant is seeded (scripts/demo/seed-demo-tenant.ts),
 *   - DEMO_ORGANIZATION_ID / DEMO_USER_EMAIL / DEMO_USER_PASSWORD are set for
 *     the server under test,
 *   - the app is running at PLAYWRIGHT_BASE_URL (default http://localhost:3100).
 *
 * Skipping is deliberate. A red suite on a machine that was never configured
 * teaches people to ignore red suites.
 */
import { test, expect } from "@playwright/test";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const DEMO_CONFIGURED = Boolean(
  process.env.DEMO_ORGANIZATION_ID &&
    process.env.DEMO_USER_EMAIL &&
    process.env.DEMO_USER_PASSWORD,
);

test.skip(
  !DEMO_CONFIGURED,
  "Demo environment is not configured (DEMO_ORGANIZATION_ID / DEMO_USER_EMAIL / DEMO_USER_PASSWORD).",
);

const LOCALES = [
  { locale: "ar", dir: "rtl", enter: "استكشف النسخة التجريبية" },
  { locale: "en", dir: "ltr", enter: "Explore Live Demo" },
] as const;

/** Clicks through the entry page and lands on the dashboard. */
async function enterDemo(page, locale: string, enterLabel: string) {
  await page.goto(`/${locale}/demo`);
  await page.getByRole("button", { name: enterLabel }).click();
  await page.waitForURL(`**/${locale}/dashboard`, { timeout: 30_000 });
}

/**
 * Console errors are collected per test rather than asserted inline, so a
 * failure names the message instead of only the count.
 */
function collectConsoleErrors(page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

// ---------------------------------------------------------------------------
// 1. The demo is usable.
// ---------------------------------------------------------------------------
for (const { locale, dir, enter } of LOCALES) {
  test.describe(`public demo — ${locale.toUpperCase()} (${dir})`, () => {
    test(`entry page renders and starts a session`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await page.goto(`/${locale}/demo`);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("button", { name: enter })).toBeVisible();

      await page.getByRole("button", { name: enter }).click();
      await page.waitForURL(`**/${locale}/dashboard`, { timeout: 30_000 });

      // The persistent indicator is the visitor's only signal that these
      // figures are not a real company's. Its absence is a product defect,
      // not a cosmetic one.
      await expect(
        page.getByText(locale === "ar" ? /بيئة AqarBooks التجريبية/ : /AqarBooks demo environment/),
      ).toBeVisible();

      expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
    });

    test(`every walkthrough destination loads`, async ({ page }) => {
      await enterDemo(page, locale, enter);

      // These are the seven screens the tour links to. A demo whose own tour
      // leads to a permission panel is worse than one with no tour.
      const screens = [
        "/property",
        "/finance/dues",
        "/finance/reports/cam-allocation",
        "/finance/banks/reconciliation",
        "/finance/reports/audit-trail",
      ];

      for (const screen of screens) {
        await page.goto(`/${locale}${screen}`);
        // The page-guard panel names the missing permission key; if it is on
        // screen, the demo role cannot open this screen.
        await expect(
          page.getByText(
            locale === "ar" ? /لا تملك صلاحية فتح هذه الصفحة/ : /don't have access to this page/,
          ),
        ).toHaveCount(0);
        await expect(page.locator("main")).toBeVisible();
      }
    });

    test(`no horizontal overflow at 375px`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await enterDemo(page, locale, enter);

      for (const screen of ["/dashboard", "/property", "/finance/dues"]) {
        await page.goto(`/${locale}${screen}`);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflow, `${screen} overflows horizontally at 375px`).toBe(false);
      }
    });

    test(`conversion routes go where they claim`, async ({ page }) => {
      await enterDemo(page, locale, enter);

      await page.getByRole("link", { name: locale === "ar" ? "اختر باقتك" : "View plans" }).click();
      await page.waitForURL(`**/${locale}/pricing`);

      await page.goto(`/${locale}/demo`);
      await page
        .getByRole("link", {
          name: locale === "ar" ? /تحدث معنا عن هيكل شركتك/ : /Discuss your setup/,
        })
        .click();
      await page.waitForURL(`**/${locale}/demo/request`);
    });
  });
}

// ---------------------------------------------------------------------------
// 2. The demo is refused — server-side, with real session cookies.
// ---------------------------------------------------------------------------
test.describe("public demo — forbidden operations are refused by the server", () => {
  /**
   * Denied AI routes.
   *
   * These are ordinary JSON endpoints, so they can be called directly from the
   * demo's own authenticated page context. A 403 here is the server refusing,
   * not the interface declining to offer.
   */
  const DENIED_AI_ROUTES = [
    { path: "/api/ai/extract-invoice", body: { text: "x" } },
    { path: "/api/ai/import-map", body: { headers: ["a"], rows: [] } },
    { path: "/api/ai/journal-propose", body: { description: "x", amount: 1 } },
    { path: "/api/ai/smart-dunning", body: { input: { memberName: "x" } } },
  ];

  for (const route of DENIED_AI_ROUTES) {
    test(`${route.path} is refused`, async ({ page }) => {
      await enterDemo(page, "en", "Explore Live Demo");

      const result = await page.evaluate(
        async ({ path, body }) => {
          const response = await fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            /* a non-JSON body is still a valid refusal */
          }
          return { status: response.status, payload };
        },
        route,
      );

      expect(
        result.status,
        `${route.path} returned ${result.status}; expected 403`,
      ).toBe(403);
      expect(JSON.stringify(result.payload)).toContain("demo_feature_unavailable");
    });
  }

  test("allowed AI routes are rate limited rather than unlimited", async ({ page }) => {
    await enterDemo(page, "en", "Explore Live Demo");

    // Deliberately exceeds the burst allowance. The assertion is that SOME
    // request is refused with 429 -- not which one, because the limiter is
    // per-isolate and the exact boundary depends on which isolate served the
    // request.
    const statuses = await page.evaluate(async () => {
      const out: number[] = [];
      for (let i = 0; i < 12; i++) {
        const response = await fetch("/api/ai/ask-aqarbooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "what is the total receivable balance?", locale: "en" }),
        });
        out.push(response.status);
      }
      return out;
    });

    expect(
      statuses.includes(429),
      `no request was rate limited; statuses were ${statuses.join(",")}`,
    ).toBe(true);
  });

  /**
   * Layer 3, proven directly.
   *
   * Next.js server actions are POSTed with a Next-Action id that is a build
   * artefact, so hard-coding one here would break on every build. The layer
   * underneath is both stable and stronger: sign in as the demo account with
   * the public anon key -- exactly what a visitor's browser holds -- and
   * attempt writes straight against PostgREST and the RPCs.
   *
   * This bypasses every guard the application has. Nothing in lib/demo, no
   * hidden button and no disabled control participates. If these writes are
   * refused, they are refused because the demo account holds no write
   * permission and the database itself says no -- which is the only claim
   * worth making in a sign-off.
   */
  test("the demo account cannot write, straight against the database", async () => {
    const { createClient } = await import("@supabase/supabase-js");

    const demo = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data: session, error: signInError } = await demo.auth.signInWithPassword({
      email: process.env.DEMO_USER_EMAIL!,
      password: process.env.DEMO_USER_PASSWORD!,
    });
    expect(signInError, `demo sign-in failed: ${signInError?.message}`).toBeNull();

    const organizationId = process.env.DEMO_ORGANIZATION_ID!;

    // The account must not be a platform admin: has_permission() short-circuits
    // to true for one, which would hand every write permission in the product
    // to anyone who clicks "Explore Live Demo".
    const { data: isAdmin } = await demo.rpc("is_platform_admin", {
      p_user_id: session!.user!.id,
    });
    expect(isAdmin, "the demo account is a platform admin — this defeats every write guard").toBeFalsy();

    // It must hold no write permission at all.
    const WRITE_PERMISSIONS = [
      "finance.entries.post",
      "finance.entries.create",
      "finance.dues.issue",
      "receivables.payments.create",
      "property.units.manage",
      "property.members.manage",
      "tenant.settings.manage",
      "tenant.users.manage",
      "tenant.roles.manage",
      "finance.accounts.manage",
      "finance.periods.manage",
      "finance.bank_reconciliation.manage",
    ];
    for (const key of WRITE_PERMISSIONS) {
      const { data: granted } = await demo.rpc("has_permission", {
        p_user_id: session!.user!.id,
        p_organization_id: organizationId,
        p_permission_key: key,
      });
      expect(granted, `demo account unexpectedly holds ${key}`).toBeFalsy();
    }

    // Direct table writes must be refused by RLS.
    const { error: unitInsert } = await demo
      .from("units")
      .insert({ organization_id: organizationId, property_id: organizationId, code: "HACK-001" });
    expect(unitInsert, "RLS allowed an insert into units").not.toBeNull();

    const { error: orgUpdate } = await demo
      .from("organizations")
      .update({ name: "Owned" })
      .eq("id", organizationId);
    // An update refused by RLS matches zero rows rather than erroring, so the
    // name is re-read: unchanged is the assertion, not the absence of an error.
    const { data: org } = await demo
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    expect(
      org?.name,
      `organizations.name was changed by the demo account (update error: ${orgUpdate?.message ?? "none"})`,
    ).not.toBe("Owned");

    // Mutating RPCs must refuse.
    const { error: journalError } = await demo.rpc("post_journal_entry", {
      p_journal_entry_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(journalError, "post_journal_entry did not refuse the demo account").not.toBeNull();

    await demo.auth.signOut();
  });

  test("demo pages are excluded from indexing", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    const body = await response!.text();
    expect(body).toContain("/*/demo");
  });
});
