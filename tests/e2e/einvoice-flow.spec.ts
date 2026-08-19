import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test.describe("E-Invoicing & Statutory Tax Compliance E2E Flow", () => {
  test("Verify E-Invoice Creation Modal, Tax Calculation, and Stamped Register", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Create unique test organization
    const orgSlug = `einvoice-org-${Date.now()}`;
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: "منشأة الفوترة والامتثال الضريبي",
        slug: orgSlug,
        default_currency: "EGP",
        status: "ACTIVE",
        tax_id: "123-456-789",
      })
      .select("id")
      .single();
    expect(orgError).toBeNull();
    const orgId = org!.id;

    // 2. Clone tenant roles
    await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });

    // 3. Create Tenant Owner user
    const ownerEmail = `einvoice-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: ownerCreateErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: STAFF_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "المدير المالي والضريبي" },
    });
    expect(ownerCreateErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    // Profile & Membership for Owner
    await admin.from("profiles").upsert({
      id: ownerId,
      full_name: "المدير المالي والضريبي",
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

    // 4. Create Fiscal Year & Period
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

    await admin.from("fiscal_periods").insert({
      organization_id: orgId,
      fiscal_year_id: insertedYear!.id,
      period_number: 1,
      name: "2026-01",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      status: "OPEN",
    });

    // 5. Create Resort, Unit, Due Type, and Receivable Account
    const { data: resort, error: resErr } = await admin
      .from("resorts")
      .insert({
        organization_id: orgId,
        name: "منتجع ساندز بلازا",
        code: "SANDS",
        timezone: "Africa/Cairo",
      })
      .select("id")
      .single();
    expect(resErr).toBeNull();

    const { data: unit, error: unitErr } = await admin
      .from("units")
      .insert({
        organization_id: orgId,
        property_id: resort!.id,
        code: "U-101",
        unit_type: "VILLA",
      })
      .select("id")
      .single();
    expect(unitErr).toBeNull();

    const { data: recAccount } = await admin
      .from("chart_of_accounts")
      .insert({
        organization_id: orgId,
        code: "1201",
        name_ar: "ذمم الملاك والعملاء",
        name_en: "Accounts Receivable",
        category: "ASSET",
        normal_balance: "DEBIT",
        is_group: false,
        is_active: true,
      })
      .select("id")
      .single();

    const { data: dueType } = await admin
      .from("due_types")
      .insert({
        organization_id: orgId,
        name_ar: "رسوم خدمات صيانة دورية",
        name_en: "Periodic Maintenance Levy",
        default_revenue_account_id: recAccount!.id,
      })
      .select("id")
      .single();

    // 6. Sign in through UI
    await page.goto(`${baseURL}/ar/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', STAFF_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 30000 });

    // 7. Go to /finance/einvoice
    await page.goto(`${baseURL}/ar/finance/einvoice`);
    await expect(page.locator("h1")).toContainText("الفوترة والإقرارات الضريبية الإلكترونية");
    await expect(page.locator("text=إنشاء فاتورة إلكترونية جديدة")).toBeVisible();

    // 8. Open Create E-Invoice Modal
    await page.click("text=إنشاء فاتورة إلكترونية جديدة");
    await expect(page.locator("text=إنشاء وإصدار فاتورة ضريبية إلكترونية")).toBeVisible();

    // Fill amount and check real-time calculation
    await page.fill('input[type="number"]', "10000");
    await expect(page.getByText("11,400")).toBeVisible(); // Gross total (10,000 + 14% VAT)

    // Submit invoice
    await page.click('button[type="submit"]:has-text("إصدار وختم الفاتورة فوراً")');
    await expect(page.locator("text=تم إصدار الفاتورة الضريبية الإلكترونية بنجاح")).toBeVisible({ timeout: 15000 });

    // Clean up
    await admin.from("organizations").delete().eq("id", orgId);
    await admin.auth.admin.deleteUser(ownerId);
  });
});
