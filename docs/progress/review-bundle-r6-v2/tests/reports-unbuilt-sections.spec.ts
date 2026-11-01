/**
 * CAM allocation and CAPEX/OPEX are NOT built in this release: their pages render a static
 * placeholder after the permission check (docs/audits/_parts/B-demo.md section 6). These checks keep the
 * ORIGINAL expectations of the reports journey. They are expected to FAIL until the reports are built or a
 * deferral is decided by the owner. They are never converted to pass by matching placeholder text.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

async function ownerSession(label: string) {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const stamp = Date.now();
  const { data: org, error: orgErr } = await admin.from("organizations").insert({
    name: `Unbuilt ${label} ${stamp}`, slug: `unbuilt-${label}-${stamp}`, default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();
  const orgId = org!.id as string;
  await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  const email = `unbuilt-${label}-${stamp}@aqarbooks-test.local`;
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  expect(userErr, `user create failed: ${userErr?.message}`).toBeNull();
  const userId = created!.user!.id;
  await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: userId, status: "active" });
  const { data: role } = await admin.from("roles").select("id")
    .eq("organization_id", orgId).eq("key", "TENANT_OWNER").single();
  await admin.from("user_role_assignments").insert({ user_id: userId, role_id: role!.id, organization_id: orgId });
  return {
    admin, orgId, userId, email,
    async cleanUp() {
      await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
      await admin.from("organization_memberships").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

async function signInUi(page: import("@playwright/test").Page, email: string) {
  await page.goto(`${baseURL}/ar/login`);
  await page.waitForLoadState("domcontentloaded");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 30000 });
}

test("CAM allocation report (NOT BUILT: placeholder; this check is expected to fail)", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await ownerSession("cam");
  try {
    await signInUi(page, owner.email);
    await page.goto(`${baseURL}/ar/finance/reports/cam-allocation`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM)");
    await expect(page.locator("text=معدل تكلفة المتر المربع").first()).toBeVisible();
  } finally {
    await owner.cleanUp();
  }
});

test("CAPEX vs OPEX report (NOT BUILT: placeholder; this check is expected to fail)", async ({ page }) => {
  test.setTimeout(120_000);
  const owner = await ownerSession("capex");
  try {
    await signInUi(page, owner.email);
    await page.goto(`${baseURL}/ar/finance/reports/capex-opex`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("h1")).toContainText("تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX)");
    await expect(page.locator("text=إنفاق رأسمالي (CAPEX)").first()).toBeVisible();
  } finally {
    await owner.cleanUp();
  }
});

