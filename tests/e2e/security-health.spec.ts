import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

test("a TENANT_OWNER can inspect the read-only security and ops health dashboard", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: "E2E Security Health Org",
      slug: `e2e-security-health-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  try {
    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", {
      p_organization_id: org!.id,
    });
    expect(cloneErr, `clone_tenant_role_templates failed: ${cloneErr?.message}`).toBeNull();

    const ownerEmail = `security-health-owner-${Date.now()}@aqarbooks-test.local`;
    const { data: ownerUser, error: ownerCreateErr } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: STAFF_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Security Health Owner" },
    });
    expect(ownerCreateErr, `owner createUser failed: ${ownerCreateErr?.message}`).toBeNull();

    await admin.from("profiles").upsert({
      id: ownerUser!.user!.id,
      full_name: "Security Health Owner",
      locale: "ar",
    });

    const { error: membershipErr } = await admin.from("organization_memberships").insert({
      organization_id: org!.id,
      user_id: ownerUser!.user!.id,
      status: "active",
    });
    expect(membershipErr, `membership insert failed: ${membershipErr?.message}`).toBeNull();

    const { data: ownerRole, error: ownerRoleErr } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", org!.id)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRoleErr, `TENANT_OWNER lookup failed: ${ownerRoleErr?.message}`).toBeNull();

    const { error: assignErr } = await admin.from("user_role_assignments").insert({
      organization_id: org!.id,
      user_id: ownerUser!.user!.id,
      role_id: ownerRole!.id,
    });
    expect(assignErr, `owner role assignment failed: ${assignErr?.message}`).toBeNull();

    await page.goto("/ar/login");
    await page.locator("#email").fill(ownerEmail);
    await page.locator("#password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: /تسجيل الدخول|Sign In/i }).click();
    await page.waitForURL(/\/(ar|en)\/(dashboard|finance|admin)/, { timeout: 20_000 });

    await page.goto("/ar/admin/security-health");
    await expect(page.getByRole("heading", { name: "صحة الأمن والتشغيل" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "عزل الصلاحيات" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "جاهزية النشر" })).toBeVisible();
    await expect(page.getByText("قراءة فقط")).toBeVisible();
    await expect(page.getByRole("heading", { name: "قرار الجاهزية" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "أولويات المعالجة" })).toBeVisible();
    await expect(page.getByText("الخطوة التالية").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "نسخ Snapshot" })).toBeVisible();

    await page.goto("/en/admin/security-health");
    await expect(page.getByRole("heading", { name: "Security & Ops Health" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Readiness Decision" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Remediation Priorities" })).toBeVisible();
    await expect(page.getByText("Next step").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy Snapshot" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 900 });
    const askButton = page.getByRole("button", { name: /Ask AqarBooks|اسأل AqarBooks/i }).first();
    await expect(askButton).toBeVisible();
    const box = await askButton.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(56);
  } finally {
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
  }
});
