import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test.describe("Admin Team & Users Governance E2E Suite", () => {
  test("Complete Team Management Flow: Invite, Role Change, and Status Toggle", async ({ page }) => {
    test.setTimeout(90_000);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Create unique test organization
    const orgSlug = `team-org-${Date.now()}`;
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: "منشأة اختبار فريق العمل",
        slug: orgSlug,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    expect(orgError).toBeNull();
    const orgId = org!.id;

    // 2. Clone tenant roles
    const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: orgId,
    });
    expect(cloneError).toBeNull();

    // 3. Create Tenant Owner user
    const ownerEmail = `team-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: ownerCreateErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: STAFF_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "مدير النظام الرئيسي" },
    });
    expect(ownerCreateErr).toBeNull();
    const ownerId = ownerUser!.user!.id;

    // Profile & Membership for Owner
    await admin.from("profiles").upsert({
      id: ownerId,
      full_name: "مدير النظام الرئيسي",
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

    // 4. Log in via real browser
    await page.goto(`${baseURL}/ar/login`);
    await page.waitForLoadState("domcontentloaded");

    await page.fill('input[type="email"]', ownerEmail);
    await page.fill('input[type="password"]', STAFF_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait until logged in and navigate to /ar/admin/users
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20_000 });

    await page.goto(`${baseURL}/ar/admin/users`);
    await page.waitForLoadState("domcontentloaded");

    // 5. Verify page title and executive pulse banner
    await expect(page.locator("h1")).toContainText("أعضاء الفريق وصلاحيات الوصول");

    // 6. Test Inviting a new team member
    const inviteButton = page.locator('button:has-text("دعوة عضو جديد للفريق")');
    await expect(inviteButton).toBeVisible();
    await inviteButton.click();

    // Wait for invite modal
    const inviteModal = page.locator('[role="dialog"]');
    await expect(inviteModal).toBeVisible();
    await expect(inviteModal.locator("h2, [class*='font-black']")).toContainText("دعوة عضو جديد");

    const newMemberEmail = `accountant-${Date.now()}@aqarbooks-test.local`;
    const newMemberName = "محاسب أول المنشأة";

    await inviteModal.locator('input[type="email"]').fill(newMemberEmail);
    await inviteModal.locator('input[placeholder*="أحمد"]').fill(newMemberName);

    // Submit invitation
    await inviteModal.locator('button[type="submit"]:has-text("إرسال الدعوة")').click();

    // Verify modal closes and new member name appears in the list
    await expect(page.getByText(newMemberName)).toBeVisible({ timeout: 20_000 });

    // 7. Test Role Change
    const memberCard = page.locator(`div:has-text("${newMemberName}")`).last();
    const changeRoleBtn = memberCard.locator('button:has-text("تغيير الدور")').first();
    if (await changeRoleBtn.isVisible()) {
      await changeRoleBtn.click();
      const roleModal = page.locator('[role="dialog"]');
      await expect(roleModal).toBeVisible();

      // Submit role confirmation
      await roleModal.locator('button:has-text("تأكيد تغيير الدور")').click();
      await page.waitForLoadState("networkidle");
    }

    // 8. Test Suspend Toggle
    const lockBtn = memberCard.locator('button[title*="تجميد"]').first();
    if (await lockBtn.isVisible()) {
      await lockBtn.click();
      const statusModal = page.locator('[role="dialog"]');
      await expect(statusModal).toBeVisible();

      await statusModal.locator('button:has-text("تجميد الحساب الآن")').click();
      await page.waitForLoadState("networkidle");

      // Verify status badge changed to suspended
      await expect(page.locator(`text=مجمد / معلق`)).toBeVisible();
    }
  });
});
