import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4Mzg3NTIwMH0.ZXhw";

const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD || "TestPassword123!";

test.describe("Financial & Real Estate Reports Suite E2E Flow", () => {
  test("Verify Reports Hub, Rent Roll, Owner Statements, VAT Return, and PDC Register", async ({
    page,
    baseURL,
  }) => {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const ownerEmail = `fin-reporter-${uniqueSuffix}@resortos.local`;
    const orgSlug = `fin-hub-${uniqueSuffix}`;

    // 1. Create User
    const { data: authUser, error: authErr } =
      await admin.auth.admin.createUser({
        email: ownerEmail,
        password: STAFF_PASSWORD,
        email_confirm: true,
      });
    expect(authErr).toBeNull();
    const userId = authUser.user!.id;

    // 2. Create Organization
    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: `شركة عقار للتقارير ${uniqueSuffix}`,
        slug: orgSlug,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    const orgId = org!.id;

    // 3. Assign TENANT_OWNER role
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

    await admin.from("organization_memberships").insert({
      user_id: userId,
      organization_id: orgId,
      role: "OWNER",
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
    await expect(page.locator("h1")).toContainText("المؤشرات والأداء المالي");
    await expect(page.locator("text=جدول الإيجارات وحصر العقود (Rent Roll)")).toBeVisible();
    await expect(page.locator("text=كشف حساب وتوزيعات أرباح الملاك")).toBeVisible();
    await expect(page.locator("text=إقرار ضريبة القيمة المضافة ومطابقة الضرائب")).toBeVisible();
    await expect(page.locator("text=سجل الشيكات الآجلة وأوراق القبض (PDC)")).toBeVisible();

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

    // Clean up
    await admin.from("organizations").delete().eq("id", orgId);
  });
});
