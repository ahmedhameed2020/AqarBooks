/**
 * /finance/accounts page-level permission gate: finance.accounts.view
 * already existed as a defined, correctly-granted permission (ACCOUNTANT,
 * AUDITOR, FINANCE_MANAGER, TENANT_OWNER) but was never wired into the
 * page itself -- the page relied entirely on RLS's broad
 * chart_of_accounts_select_member policy (is_org_member, no permission
 * check), which is DELIBERATELY left untouched here: chart_of_accounts is
 * a shared reference table read by 8+ other finance pages across roles
 * that don't have finance.accounts.view (CASHIER, COLLECTOR,
 * GENERAL_MANAGER, PROPERTY_MANAGER, TENANT_ADMIN, VIEWER,
 * PURCHASING_MANAGER) -- tightening RLS directly would break all of them.
 * This is a page-level-only fix, same pattern as
 * tests/e2e/aging-report-permission-gate.spec.ts.
 *
 * RLS-only assertions (no browser needed -- insert rejection, cross-org
 * isolation) live separately in
 * tests/chart-of-accounts-rls.integration.test.ts.
 *
 * Fixture conventions match tests/e2e/aging-report-permission-gate.spec.ts /
 * tests/e2e/payment-provider-settings.spec.ts: service-role admin client
 * for setup, genuinely authenticated staff browser sessions for the
 * has_permission-gated page.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

async function makeOrgWithStaff(admin: ReturnType<typeof createClient>, label: string, roleKey: string | null) {
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: `E2E COA Gate ${label}`, slug: `e2e-coa-gate-${label.toLowerCase()}-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr, `clone_tenant_role_templates failed: ${cloneErr?.message}`).toBeNull();

  const staffEmail = `e2e-coa-gate-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr, `staff createUser failed: ${staffCreateErr?.message}`).toBeNull();

  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr, `membership insert failed: ${membershipErr?.message}`).toBeNull();

  if (roleKey) {
    const { data: role, error: roleErr } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", org!.id)
      .eq("key", roleKey)
      .single();
    expect(roleErr, `role lookup failed for ${roleKey}: ${roleErr?.message}`).toBeNull();

    const { error: assignErr } = await admin
      .from("user_role_assignments")
      .insert({ user_id: staffCreated!.user!.id, role_id: role!.id, organization_id: org!.id });
    expect(assignErr, `role assignment failed: ${assignErr?.message}`).toBeNull();
  }

  return { orgId: org!.id as string, staffEmail };
}

test("a member without finance.accounts.view sees a denial message, never the table or the create-account form", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  // No role assignment at all -- organization membership only, so
  // has_permission() returns false for every permission.
  const { orgId, staffEmail } = await makeOrgWithStaff(admin, "NoPerm", null);

  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/accounts");
  await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();
  await expect(page.getByText("You don't have permission to view the chart of accounts.")).toBeVisible();
  await expect(page.getByRole("table")).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Add account/i })).not.toBeVisible();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
});

for (const roleKey of ["ACCOUNTANT", "FINANCE_MANAGER", "TENANT_OWNER"]) {
  test(`${roleKey} (has finance.accounts.view) sees the real chart-of-accounts page, not the denial message`, async ({ page }) => {
    test.setTimeout(60_000);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { orgId, staffEmail } = await makeOrgWithStaff(admin, roleKey, roleKey);

    await page.goto("/en/login");
    await page.locator("#email").fill(staffEmail);
    await page.locator("#password").fill(STAFF_PASSWORD);
    await page.getByRole("button", { name: /Sign In/i }).click();
    await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

    await page.goto("/en/finance/accounts");
    await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();
    await expect(page.getByText("You don't have permission to view the chart of accounts.")).not.toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });
}
