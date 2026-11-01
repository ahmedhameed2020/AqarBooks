import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createOpenFiscalYear } from "../helpers/fiscal-calendar";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test.describe("Financial & Real Estate Reports Suite E2E Flow", () => {
  test("Verify Reports Hub, Rent Roll, Owner Statements, VAT Return, and PDC Register", async ({
    page,
  }) => {
    test.setTimeout(240_000);
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

    // 5. Create Fiscal Year & Periods through the product RPCs as the owner (the guard refuses direct writes).
    //    The year creates its monthly periods and all of them are opened, so January is open as before.
    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: ownerSignErr } = await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: STAFF_PASSWORD });
    expect(ownerSignErr, `owner sign-in failed: ${ownerSignErr?.message}`).toBeNull();
    await createOpenFiscalYear(admin, ownerClient, {
      orgId, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31",
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

    // 12. Fixed Assets report: deferred out of Batch 1B by owner decision (see the separate fixme test below).

    // 13. Test Audit Trail Page
    await page.goto(`${baseURL}/ar/finance/reports/audit-trail`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل التدقيق والحركات الملغاة ومكافحة التلاعب");
    await expect(page.locator("text=إجمالي الحركات الموثقة").first()).toBeVisible();

    // 14. CAM allocation and 16. CAPEX/OPEX are unbuilt placeholders. They run in reports-unbuilt-sections.spec.ts,
    //     so an unbuilt page cannot stop this journey.

    // 15. Test Cash Flow Forecast Page (the heading the page renders today; the forward projection stays withheld)
    await page.goto(`${baseURL}/ar/finance/reports/cash-flow-forecast`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("توقعات التدفق النقدي");
    await expect(page.locator("text=الرصيد النقدي الحالي").first()).toBeVisible();

    // 17. Lease expirations: a product defect (the page cannot load its data). It runs in
    //     reports-blocked-sections.spec.ts so it cannot stop the rest of this journey.

    // 18. Test User Account & Security Settings Page
    await page.goto(`${baseURL}/ar/account`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("text=الملف الشخصي").first()).toBeVisible();
    await expect(page.locator("text=الأمان وكلمات المرور").first()).toBeVisible();
    await expect(page.locator("text=تفضيلات الإشعارات").first()).toBeVisible();

    // 19. Test AI Smart Data Importer Page
    await page.goto(`${baseURL}/ar/import`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("استيراد ومعالجة البيانات العقارية بالذكاء الاصطناعي");
    await expect(page.locator("text=الوحدات والعقارات").first()).toBeVisible();

    // 20. Test Payment Providers Hub Page
    await page.goto(`${baseURL}/ar/finance/payment-providers`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("بوابات الدفع الإلكتروني والتحصيل الرقمي");
    await expect(page.locator("text=Fawry Pay (فوري باي)").first()).toBeVisible();

    // 21. Test Notifications & Alerts Center Page
    await page.goto(`${baseURL}/ar/notifications`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("التنبيهات التشغيلية");
    await expect(page.locator("text=الإعدادات والعتبات").first()).toBeVisible();

    // 22. Test Members & Owners Directory Page
    await page.goto(`${baseURL}/ar/members`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل الأعضاء والملاك وإدارة الحسابات");
    await expect(page.locator("text=إجمالي الأعضاء والملاك").first()).toBeVisible();

    // Clean up
    await admin.from("organizations").delete().eq("id", orgId);
  });

  // DEFERRED, NOT A PASS. The fixed-asset schedule report is out of Batch 1B by owner decision (2026-10-29), and its
  // navigation link is hidden. The report page is still a placeholder, so this check cannot pass until a separate batch
  // builds the schedule and its own fixtures. Kept skipped so the deferral stays visible in the test report.
  test.fixme("DEFERRED (Batch 1B excluded): fixed-asset schedule shows the NBV table", async ({ page }) => {
    await page.goto(`${baseURL}/ar/finance/reports/fixed-assets`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("سجل الأصول الثابتة والإهلاك المحاسبي");
    await expect(page.locator("text=صافي القيمة الدفترية (NBV)").first()).toBeVisible();
  });
});
