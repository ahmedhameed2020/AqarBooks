/**
 * Task 11: End-to-end coverage of the onboarding wizard itself, in
 * isolation from the email-confirmation flow (already covered by an RPC
 * regression test and a manual audit -- see the onboarding plan). Creates
 * an already-confirmed user directly via the Admin API, signs in as them
 * through the real /login page, and drives the two-step wizard form.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Module-level mutable state shared between beforeEach/afterEach and the
// tests themselves. This is only safe because playwright.config.ts pins
// workers: 1 / fullyParallel: false for this project -- do not introduce
// parallelism here without re-deriving per-test state instead.
let email: string;
let password: string;
let userId: string;
let organizationId: string | undefined;

test.beforeEach(async () => {
  email = `e2e-onboarding-${Date.now()}-${Math.random().toString(36).slice(2)}@resortos-test.local`;
  password = "TestPassword123!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
});

test.afterEach(async () => {
  if (organizationId) {
    // The onboarding RPC writes a platform_audit_logs row referencing the
    // organization, and that FK has no ON DELETE CASCADE -- deleting the
    // organization first fails silently (Supabase JS doesn't throw on a
    // PostgREST error unless you check it), leaving orphaned test orgs
    // behind. Clear the audit log row first.
    const { error: auditError } = await admin
      .from("platform_audit_logs")
      .delete()
      .eq("organization_id", organizationId);
    if (auditError) {
      console.error(`Failed to clean up audit logs for organization ${organizationId}:`, auditError.message);
    }
    const { error: orgError } = await admin.from("organizations").delete().eq("id", organizationId);
    if (orgError) {
      console.error(`Failed to clean up test organization ${organizationId}:`, orgError.message);
    }
    organizationId = undefined;
  }
  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) {
    console.error(`Failed to clean up test user ${userId}:`, userError.message);
  }
});

test("a freshly confirmed user completes onboarding and lands on a working dashboard", async ({ page }) => {
  await page.goto("/ar/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();

  // A freshly confirmed user has no organization membership yet, so login
  // lands on /dashboard's "no organization" empty state (dashboard/page.tsx
  // has no automatic redirect straight to /onboarding); the user reaches
  // the wizard via that empty state's CTA link.
  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });
  await page.getByRole("link", { name: "أنشئ مؤسستك الآن" }).click();
  await page.waitForURL(/\/ar\/onboarding/, { timeout: 15000 });

  await page.getByPlaceholder("شركة النخبة العقارية").fill("شركة اختبار E2E العقارية");
  await page.getByRole("radio", { name: /إدارة مرافق/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();

  await page.getByPlaceholder("منتجع النخيل الذهبي").fill("مشروع اختبار E2E الأول");
  await page.getByRole("button", { name: "إنشاء المؤسسة" }).click();

  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });
  await expect(page.getByText("حسابك غير مرتبط بأي منظمة بعد")).not.toBeVisible();

  const { data: membership } = await admin
    .from("organization_memberships")
    .select("organization_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  // Record the org id for afterEach cleanup before asserting -- the org is
  // already created by this point regardless of assertion outcome, so
  // capturing it first ensures a failed assertion doesn't leak the row.
  organizationId = membership?.organization_id;
  expect(membership?.status).toBe("active");
});

test("visiting /onboarding a second time after finishing it redirects to the dashboard", async ({ page }) => {
  // create_organization_onboarding reads auth.uid() -- it must be called as
  // the real signed-in user, not the service-role admin client (which has no
  // auth.uid() and would just fail with UNAUTHORIZED). One call, no throwaway
  // first attempt.
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  const { data: rpcData, error } = await client.rpc("create_organization_onboarding", {
    p_org_name: "شركة اختبار إعادة الزيارة",
    p_entity_type: "OTHER",
    p_entity_type_custom_label: "اختبار",
    p_resort_name: "مشروع اختبار",
  });
  if (error) throw error;
  organizationId = rpcData?.organization_id;

  await page.goto("/ar/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /تسجيل الدخول/ }).click();
  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });

  await page.goto("/ar/onboarding");
  await page.waitForURL(/\/ar\/dashboard/, { timeout: 15000 });
});
