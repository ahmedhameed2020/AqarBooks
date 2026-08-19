import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test.describe("Enterprise Suite 3-Pillar Comprehensive Flow", () => {
  test("Verify Fiscal Periods, Real Estate Entities & Platform Dashboard", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Create unique test organization
    const orgSlug = `pillar-org-${Date.now()}`;
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: "منشأة الاختبار الشاملة للأركان الثلاثة",
        slug: orgSlug,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    expect(orgError).toBeNull();
    const orgId = org!.id;

    // 2. Clone tenant roles
    await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

    // 3. Create Tenant Owner user
    const ownerEmail = `pillar-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: ownerCreateErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: STAFF_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "المدير التنفيذي العام" },
    });
    expect(ownerCreateErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    // Profile & Membership for Owner
    await admin.from("profiles").upsert({
      id: ownerId,
      full_name: "المدير التنفيذي العام",
      locale: "ar",
    });

    await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: ownerId,
      status: "active",
    });

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();

    await admin.from("user_role_assignments").insert({
      organization_id: orgId,
      user_id: ownerId,
      role_id: ownerRole!.id,
    });

    // 5. Create a Fiscal Year and periods
    await admin.from("fiscal_years").insert({
      organization_id: orgId,
      name: "2026",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "OPEN",
    });

    const { data: insertedYear } = await admin
      .from("fiscal_years")
      .select("id")
      .eq("organization_id", orgId)
      .single();

    if (insertedYear) {
      await admin.from("fiscal_periods").insert([
        {
          organization_id: orgId,
          fiscal_year_id: insertedYear.id,
          period_number: 1,
          name: "2026-01",
          start_date: "2026-01-01",
          end_date: "2026-01-31",
          status: "OPEN",
        },
        {
          organization_id: orgId,
          fiscal_year_id: insertedYear.id,
          period_number: 2,
          name: "2026-02",
          start_date: "2026-02-01",
          end_date: "2026-02-28",
          status: "PLANNED",
        },
      ]);
    }

    // 6. Sign in through UI
    await page.goto(`${baseURL}/ar/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 30000 });

    // 7. Verify Executive Dashboard (/dashboard)
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("text=الفترات والإقفال")).toBeVisible();

    // 8. Verify Fiscal Periods & Closing Wizard (/admin/finance/periods)
    await page.goto(`${baseURL}/ar/admin/finance/periods`);
    await expect(page.locator("h1")).toContainText("السنوات والفترات والإقفال المحاسبي");
    await expect(page.locator("text=مساعد الإقفال السنوي وترحيل الأرصدة").first()).toBeVisible();

    // Open Closing Wizard modal
    await page.click("text=مساعد الإقفال السنوي وترحيل الأرصدة");
    await expect(page.locator("text=مساعد الإقفال المحاسبي للسنة")).toBeVisible();
    await expect(page.locator("text=المتابعة للخطوة التالية")).toBeVisible();
    await page.click("text=إلغاء");

    // 9. Verify Real Estate Entities & Projects (/admin/resorts)
    await page.goto(`${baseURL}/ar/admin/resorts`);
    await expect(page.locator("h1")).toContainText("الكيانات والمشاريع العقارية");
    await expect(page.locator("text=نسبة الإشغال الإجمالية")).toBeVisible();
    await expect(page.locator("text=متوسط الإيراد لكل وحدة")).toBeVisible();

    // Clean up
    await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(ownerId);
  });
});
