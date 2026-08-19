import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test.describe("Financial & Real Estate Reports Suite E2E Flow", () => {
  test("Verify Reports Hub, Rent Roll, Owner Statements, VAT Return, and PDC Register", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    // 1. Create Organization
    const orgSlug = `fin-hub-${Date.now()}`;
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: `شركة عقار للتقارير ${Date.now()}`,
        slug: orgSlug,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    expect(orgErr).toBeNull();
    const orgId = org!.id;

    // 2. Clone tenant roles
    await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

    // 3. Create Tenant Owner user
    const ownerEmail = `fin-reporter-${Date.now()}@aqarbooks-test.local`;
    const { data: authUser, error: authErr } =
      await admin.auth.admin.createUser({
        email: ownerEmail,
        password: STAFF_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "مدير التقارير المالية" },
      });
    expect(authErr).toBeNull();
    const userId = authUser.user!.id;

    await admin.from("profiles").upsert({
      id: userId,
      full_name: "مدير التقارير المالية",
      locale: "ar",
    });

    await admin.from("organization_memberships").insert({
      organization_id: orgId,
      user_id: userId,
      status: "active",
    });

    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();

    await admin.from("user_role_assignments").insert({
      user_id: userId,
      organization_id: orgId,
      role_id: ownerRole!.id,
    });

    // 4. Create Resort
    await admin.from("resorts").insert({
      organization_id: orgId,
      name: "منتجع ساندز بلازا",
      slug: `resort-${Date.now()}`,
      status: "ACTIVE",
    });

    // 5. Create Fiscal Year & Period
    const { data: insertedYear } = await admin
      .from("fiscal_years")
      .insert({
        organization_id: orgId,
        name: "2026",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        status: "OPEN",
      })
      .select("id")
      .single();

    await admin.from("fiscal_periods").insert({
      organization_id: orgId,
      fiscal_year_id: insertedYear!.id,
      period_number: 1,
      name: "2026-01",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      status: "OPEN",
    });

    // 4. Sign in through UI
    await page.goto(`${baseURL}/ar/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 30000 });

    // 5. Navigate to /finance/reports Hub
    await page.goto(`${baseURL}/ar/finance/reports`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("مركز التقارير والقوائم المالية");
    await expect(page.locator("text=جدول الإيجارات وحصر العقود (Rent Roll)").first()).toBeVisible();
    await expect(page.locator("text=كشف حساب وتوزيعات أرباح الملاك").first()).toBeVisible();
    await expect(page.locator("text=إقرار ضريبة القيمة المضافة ومطابقة الضرائب").first()).toBeVisible();
    await expect(page.locator("text=سجل الشيكات الآجلة وأوراق القبض (PDC)").first()).toBeVisible();

    // 6. Test Rent Roll Page
    await page.goto(`${baseURL}/ar/finance/reports/rent-roll`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("جدول الإيجارات وحصر العقود (Rent Roll)");
    await expect(page.locator("text=نسبة الإشغال الإجمالية")).toBeVisible();

    // 7. Test Owner Statement Page
    await page.goto(`${baseURL}/ar/finance/reports/owner-statement`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("كشف حساب وتوزيعات أرباح الملاك");
    await expect(page.locator("text=صافي الربح المستحق للمالك")).toBeVisible();

    // 8. Test VAT Return Page
    await page.goto(`${baseURL}/ar/finance/reports/vat-return`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("كشف إقرار ضريبة القيمة المضافة");
    await expect(page.locator("text=نموذج احتساب وتوزيع الإقرار الضريبي المعتمد")).toBeVisible();

    // 9. Test PDC Cheques Register Page
    await page.goto(`${baseURL}/ar/finance/reports/pdc`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل الشيكات الآجلة وأوراق القبض (PDC)");
    await expect(page.locator("text=شيكات مقبوضة (واردة)")).toBeVisible();

    // 10. Test Property P&L Page
    await page.goto(`${baseURL}/ar/finance/reports/property-pnl`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("قائمة أرباح وخسائر العقارات والمنتجعات (Property P&L)");
    await expect(page.locator("text=صافي الدخل التشغيلي (NOI)").first()).toBeVisible();

    // 11. Test AP Aging Page
    await page.goto(`${baseURL}/ar/finance/reports/ap-aging`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير أعمار ديون الموردين والالتزامات (AP Aging)");
    await expect(page.locator("text=إجمالي ديون الموردين").first()).toBeVisible();

    // 12. Test Fixed Assets Page
    await page.goto(`${baseURL}/ar/finance/reports/fixed-assets`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل الأصول الثابتة والإهلاك المحاسبي");
    await expect(page.locator("text=صافي القيمة الدفترية (NBV)").first()).toBeVisible();

    // 13. Test Audit Trail Page
    await page.goto(`${baseURL}/ar/finance/reports/audit-trail`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل التدقيق والحركات الملغاة ومكافحة التلاعب");
    await expect(page.locator("text=إجمالي الحركات الموثقة").first()).toBeVisible();

    // 14. Test CAM Allocation Page
    await page.goto(`${baseURL}/ar/finance/reports/cam-allocation`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM)");
    await expect(page.locator("text=معدل تكلفة المتر المربع").first()).toBeVisible();

    // 15. Test Cash Flow Forecast Page
    await page.goto(`${baseURL}/ar/finance/reports/cash-flow-forecast`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير توقعات التدفق النقدي والسيولة المستقبلية");
    await expect(page.locator("text=الرصيد النقدي الفعلي الحالي").first()).toBeVisible();

    // 16. Test CAPEX vs OPEX Page
    await page.goto(`${baseURL}/ar/finance/reports/capex-opex`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX)");
    await expect(page.locator("text=إنفاق رأسمالي (CAPEX)").first()).toBeVisible();

    // 17. Test Lease Expirations Page
    await page.goto(`${baseURL}/ar/finance/reports/lease-expirations`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير جداول انتهاء العقود ومعدل دوران الإشغال");
    await expect(page.locator("text=إجمالي العقود النشطة").first()).toBeVisible();

    // Clean up
    await admin.from("organizations").delete().eq("id", orgId);
  });
});
