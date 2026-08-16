// @ts-nocheck
/**
 * Task 15 (Owner Portal Phase 2 exit gate): RLS isolation proven in
 * pgTAP-style scripts (Task 10, see supabase/tests/phase_owner_portal_data_integrity.sql)
 * is necessary but not sufficient -- this test logs in as two different
 * owners in two different orgs through real browser sessions (real cookies,
 * real rendered pages) and confirms each only ever sees their own unit on
 * /portal/units, not just through direct table queries.
 *
 * Fixture setup uses the service-role client directly for plain table
 * writes, matching this repo's established e2e convention (see
 * tests/e2e/owner-portal-invite.spec.ts / tests/e2e/cashier-flow.spec.ts /
 * tests/fixtures.ts). create_resort() is SECURITY DEFINER and
 * self-authorizes via has_permission(auth.uid(), ...), which is null (and
 * therefore unauthorized) under the service-role client -- so, again
 * mirroring owner-portal-invite.spec.ts, it's called through a genuinely
 * authenticated TENANT_OWNER staff session instead.
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const OWNER_PASSWORD = "TestPassword123!";
const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

async function setUpOwnerWithData(admin: SupabaseClient, label: string) {
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: `E2E Isolation ${label}`,
      slug: `e2e-iso-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgError, `org insert failed: ${orgError?.message}`).toBeNull();

  // create_resort is SECURITY DEFINER and self-authorizes via
  // has_permission(auth.uid(), ...) -- auth.uid() is null for the
  // service-role client (no JWT `sub` claim), so calling it as `admin`
  // fails with 42501 "not authorized". Mirror
  // tests/e2e/owner-portal-invite.spec.ts: provision a genuinely
  // authenticated staff user with TENANT_OWNER (which carries
  // tenant.settings.manage) via clone_tenant_role_templates +
  // user_role_assignments, sign in as them, and call create_resort as
  // that real session -- not as the service-role client.
  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneError, `clone_tenant_role_templates failed: ${cloneError?.message}`).toBeNull();

  const staffEmail = `staff-iso-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: staffCreated, error: staffCreateError } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateError, `staff createUser failed: ${staffCreateError?.message}`).toBeNull();

  const { data: ownerRole, error: ownerRoleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(ownerRoleError, `TENANT_OWNER role lookup failed: ${ownerRoleError?.message}`).toBeNull();

  const { error: staffAssignError } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: org!.id });
  expect(staffAssignError, `staff role assignment failed: ${staffAssignError?.message}`).toBeNull();

  const staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: staffSignInError } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: STAFF_PASSWORD });
  expect(staffSignInError, `staff sign-in failed: ${staffSignInError?.message}`).toBeNull();

  const email = `owner-iso-${label.toLowerCase()}-${Date.now()}@example.com`;

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  expect(createUserError, `createUser failed: ${createUserError?.message}`).toBeNull();

  // create_resort takes contact-detail fields alongside the core ones --
  // pass all 8 explicitly, matching lib/actions/tenant.ts and
  // supabase/tests/phase_owner_portal_data_integrity.sql. (Until
  // 2026-08-16 this also had to disambiguate against orphaned legacy
  // overloads with fewer args; those have since been dropped as drift.)
  const { data: resort, error: resortError } = await staffClient.rpc("create_resort", {
    p_organization_id: org!.id,
    p_name: `Resort ${label}`,
    p_code: `R${label}`,
    p_timezone: "Africa/Cairo",
    p_address: null,
    p_governorate: null,
    p_phone: null,
    p_email: null,
  });
  expect(resortError, `create_resort failed: ${resortError?.message}`).toBeNull();

  const unitCode = `UNIT-${label}`;
  const { data: unit, error: unitError } = await admin
    .from("units")
    .insert({ organization_id: org!.id, resort_id: resort, code: unitCode, unit_type: "VILLA" })
    .select("id")
    .single();
  expect(unitError, `unit insert failed: ${unitError?.message}`).toBeNull();

  const { data: member, error: memberError } = await admin
    .from("members")
    .insert({ organization_id: org!.id, full_name: `Owner ${label}`, email, user_id: created!.user!.id })
    .select("id")
    .single();
  expect(memberError, `member insert failed: ${memberError?.message}`).toBeNull();

  const { error: ownershipError } = await admin
    .from("unit_ownerships")
    .insert({ organization_id: org!.id, unit_id: unit!.id, member_id: member!.id, is_primary_contact: true });
  expect(ownershipError, `unit_ownerships insert failed: ${ownershipError?.message}`).toBeNull();

  return { orgId: org!.id as string, email, password: OWNER_PASSWORD, unitCode };
}

test("two owners in a browser each see only their own unit", async ({ browser }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const ownerA = await setUpOwnerWithData(admin, "A");
  const ownerB = await setUpOwnerWithData(admin, "B");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("/ar/portal/login");
  await pageA.getByLabel(/البريد الإلكتروني|Email/).fill(ownerA.email);
  await pageA.getByLabel(/كلمة المرور|Password/).fill(ownerA.password);
  await pageA.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await pageA.waitForURL(/\/portal$/);
  await pageA.goto("/ar/portal/units");
  await expect(pageA.getByText(ownerA.unitCode)).toBeVisible();
  await expect(pageA.getByText(ownerB.unitCode)).not.toBeVisible();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/ar/portal/login");
  await pageB.getByLabel(/البريد الإلكتروني|Email/).fill(ownerB.email);
  await pageB.getByLabel(/كلمة المرور|Password/).fill(ownerB.password);
  await pageB.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await pageB.waitForURL(/\/portal$/);
  await pageB.goto("/ar/portal/units");
  await expect(pageB.getByText(ownerB.unitCode)).toBeVisible();
  await expect(pageB.getByText(ownerA.unitCode)).not.toBeVisible();

  await contextA.close();
  await contextB.close();

  // set_organization_status is security definer but self-gates on
  // is_platform_admin(auth.uid()) -- auth.uid() is null under the
  // service-role client, so calling it here silently fails (42501) and
  // never archives anything, leaving orphaned ACTIVE test orgs behind on
  // every run. Update the status directly instead: the service-role client
  // already bypasses RLS, so the RPC's permission gate isn't buying
  // anything for a throwaway test fixture teardown.
  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", ownerA.orgId);
  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", ownerB.orgId);
});
