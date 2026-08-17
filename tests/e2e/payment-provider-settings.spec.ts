// @ts-nocheck
/**
 * Task 4 (Payment Provider Settings UI) exit gate: drives the real settings
 * page through a genuine staff browser session -- create a Fawry SANDBOX
 * setting, test its connection against Fawry's real staging host (reachable
 * from this sandbox, no mock needed since probeProvider only checks that
 * the host responds, not that a charge succeeds), enable it, then disable
 * it. Also proves Paymob's own connection test genuinely fails closed
 * (real auth/tokens call with a fake api_key) and never lets Enable be
 * clickable in that state.
 *
 * Fixture conventions match tests/e2e/owner-portal-isolation.spec.ts /
 * owner-portal-online-payment-fawry.spec.ts: service-role admin client for
 * setup, a genuinely authenticated TENANT_OWNER staff browser session for
 * anything RLS/has_permission-gated.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

test("staff configures, verifies, enables and disables a Fawry sandbox payment provider setting", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "E2E PPS Org", slug: `e2e-pps-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr, `clone_tenant_role_templates failed: ${cloneErr?.message}`).toBeNull();

  const staffEmail = `staff-pps-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr, `staff createUser failed: ${staffCreateErr?.message}`).toBeNull();

  const { data: ownerRole, error: ownerRoleErr } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(ownerRoleErr, `TENANT_OWNER lookup failed: ${ownerRoleErr?.message}`).toBeNull();

  const { error: membershipErr } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr, `membership insert failed: ${membershipErr?.message}`).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: org!.id });
  expect(assignErr, `role assignment failed: ${assignErr?.message}`).toBeNull();

  // Real browser login as staff (not the service-role/API client) -- the
  // page under test is server-rendered and permission-gated via RLS on the
  // real authenticated session's cookies.
  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/payment-providers");
  await expect(page.getByRole("heading", { name: "Payment Providers" })).toBeVisible();

  // --- Create a Fawry SANDBOX, organization-wide setting ---
  await page.getByLabel("Merchant identifier").fill("E2E-FAWRY-MERCHANT");
  await page.getByLabel("API key").fill("e2e-fake-api-key");
  await page.getByLabel("HMAC secret").fill("e2e-fake-hmac-secret");
  await page.getByRole("button", { name: "Save setting" }).click();

  const row = page.locator("tr", { hasText: "Fawry" }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();

  // --- Test connection: probeProvider does a real GET against Fawry's
  // real staging host, any completed HTTP response counts as reachable. ---
  await row.getByRole("button", { name: "Test connection" }).click();
  await expect(row.getByText("Verified", { exact: true })).toBeVisible({ timeout: 15_000 });

  // --- Enable only becomes clickable/effective now that it's VERIFIED ---
  const enableButton = row.getByRole("button", { name: "Enable" });
  await expect(enableButton).toBeEnabled();
  await enableButton.click();
  await expect(row.getByText("Enabled", { exact: true })).toBeVisible({ timeout: 10_000 });

  // --- Disable reverts it ---
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row.getByText("Disabled", { exact: true })).toBeVisible({ timeout: 10_000 });

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});

test("Paymob connection test fails closed with fake credentials and Enable never becomes clickable", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "E2E PPS Paymob Org", slug: `e2e-pps-pm-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneErr).toBeNull();

  const staffEmail = `staff-pps-pm-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateErr).toBeNull();

  const { data: ownerRole } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();

  const { error: membershipErr2 } = await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: staffCreated!.user!.id, status: "active" });
  expect(membershipErr2).toBeNull();

  const { error: assignErr } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: org!.id });
  expect(assignErr).toBeNull();

  await page.goto("/en/login");
  await page.locator("#email").fill(staffEmail);
  await page.locator("#password").fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForURL(/\/(dashboard|finance|admin)/, { timeout: 15_000 });

  await page.goto("/en/finance/payment-providers");

  await page.getByRole("combobox").filter({ hasText: "Fawry" }).click();
  await page.getByRole("option", { name: "Paymob" }).click();
  await page.getByLabel("Merchant identifier").fill("E2E-PAYMOB-MERCHANT");
  await page.getByLabel("API key").fill("definitely-not-a-real-paymob-api-key");
  await page.getByLabel("HMAC secret").fill("e2e-fake-hmac-secret");
  await page.getByRole("button", { name: "Save setting" }).click();

  const row = page.locator("tr", { hasText: "Paymob" }).first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  await row.getByRole("button", { name: "Test connection" }).click();
  // A fake api_key genuinely fails Paymob's real auth/tokens endpoint --
  // status stays Draft, never advances to Verified, and Enable stays
  // disabled (the button's own disabled={status !== "VERIFIED"} condition,
  // backed by enable_payment_provider's own NOT_VERIFIED guard server-side).
  await expect(row.getByText("Draft", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("button", { name: "Enable" })).toBeDisabled();

  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});
