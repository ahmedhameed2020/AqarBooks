/**
 * deferred_aging_page_permission_ux: /finance/reports/aging previously
 * relied entirely on RLS returning zero rows for a user without
 * finance.dues.read, showing the exact same "no outstanding receivables"
 * empty state as a genuinely-empty report -- misleading, though not a
 * data leak (RLS was already confirmed correct, see
 * deferred_aging_rls_tightening). This proves the new page-level
 * permission check live: a user without finance.dues.read sees a clear
 * denial message, and a user with it still sees the real report.
 *
 * Fixture conventions match tests/e2e/payment-provider-settings.spec.ts:
 * service-role admin client for setup, a genuinely authenticated staff
 * browser session for the RLS/has_permission-gated page itself.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

test("a staff user without finance.dues.read sees a clear permission-denied message, not a misleading empty report", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "E2E Aging Gate Org", slug: `e2e-aging-gate-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr, `clone_tenant_role_templates failed: ${cloneErr?.message}`).toBeNull();

  const staffEmail = `staff-aging-gate-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr, `staff createUser failed: ${staffCreateErr?.message}`).toBeNull();

  // Org membership, but deliberately NO role assignment -- has_permission()
  // returns false for a member with zero granted roles/permissions.
  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr, `membership insert failed: ${membershipErr?.message}`).toBeNull();

  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/reports/aging");
  await expect(page.getByRole("heading", { name: "Receivables Aging" })).toBeVisible();
  await expect(page.getByText("You don't have permission to view this report.")).toBeVisible();
  // Never the misleading empty-report state for a permission-denied user.
  await expect(page.getByText("No outstanding receivables")).not.toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});

test("a TENANT_OWNER (has finance.dues.read) still sees the real report, not the denial message", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "E2E Aging Gate Owner Org", slug: `e2e-aging-gate-owner-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr).toBeNull();

  const { data: ownerRole, error: ownerRoleErr } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(ownerRoleErr, `TENANT_OWNER lookup failed: ${ownerRoleErr?.message}`).toBeNull();

  const staffEmail = `staff-aging-gate-owner-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr).toBeNull();

  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: org!.id });
  expect(assignErr).toBeNull();

  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/reports/aging");
  await expect(page.getByRole("heading", { name: "Receivables Aging" })).toBeVisible();
  await expect(page.getByText("You don't have permission to view this report.")).not.toBeVisible();
  // A genuinely empty report (no dues fixtures created for this org) still
  // renders the real table with its own empty-state row, not the denial
  // message.
  await expect(page.getByText("No outstanding receivables")).toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});
