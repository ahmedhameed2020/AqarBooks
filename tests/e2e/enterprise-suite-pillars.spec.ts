import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
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

    // 5. Create a Fiscal Year and periods through the product RPCs as the owner (the guard refuses direct writes).
    //    January is opened and February stays PLANNED, as before.
    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: STAFF_PASSWORD });
    expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
    const { data: yearId, error: yearErr } = await ownerClient.rpc("create_fiscal_year", {
      p_organization_id: orgId, p_name: "2026", p_start_date: "2026-01-01", p_end_date: "2026-12-31",
    });
    expect(yearErr, `fiscal year failed: ${yearErr?.message}`).toBeNull();
    const { data: january, error: janErr } = await admin
      .from("fiscal_periods").select("id").eq("fiscal_year_id", yearId as string).eq("period_number", 1).single();
    expect(janErr, janErr?.message).toBeNull();
    const { error: openErr } = await ownerClient.rpc("set_fiscal_period_status", {
      p_fiscal_period_id: january!.id as string, p_status: "OPEN", p_reason: "test setup",
    });
    expect(openErr, `open January failed: ${openErr?.message}`).toBeNull();

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

    // 8. Verify Fiscal Periods & Year-End Closing (/admin/finance/periods)
    await page.goto(`${baseURL}/ar/admin/finance/periods`);
    await expect(page.locator("h1")).toContainText("السنوات والفترات والإقفال المحاسبي");

    // Batch 3 replaced the display-only wizard with the connected YearEndClosingDialog
    await page.getByTestId("open-year-closing-2026").click();
    const closingDialog = page.getByTestId("year-end-closing-dialog");
    await expect(closingDialog).toBeVisible();
    await expect(closingDialog).toContainText("إقفال السنة المالية 2026");
    // precheck stage: real checks before any write, and an explicit no-rollover statement
    await expect(closingDialog.getByText("فحص حقيقي قبل أي كتابة")).toBeVisible();
    await expect(closingDialog.getByText("هذه العملية لا ترحّل أرصدة افتتاحية إلى سنة أخرى.")).toBeVisible();
    // the four stages are declared up front: precheck / entry preview / confirmation / result
    await expect(closingDialog.getByLabel("مراحل إقفال السنة").locator("li")).toHaveText([
      /الفحص المسبق/,
      /معاينة القيد/,
      /التأكيد/,
      /النتيجة/,
    ]);
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
