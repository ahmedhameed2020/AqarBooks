/**
 * Task 9 (Owner Portal Phase 1 exit gate): drives the full invite-to-login
 * loop through a real browser -- a genuinely authenticated staff user (not
 * the service-role client, which has no auth.uid() and cannot pass
 * has_permission()/tenant.users.manage checks -- see
 * tests/member-portal-invitation.integration.test.ts's own notes on this)
 * creates a real member invitation, the invitee follows a real Supabase
 * invite link, sets a password through the actual (guest)/accept-invite UI,
 * and lands on the guarded (member) portal dashboard.
 *
 * Setup (org, staff role assignment, member row) uses the service-role
 * client directly, matching this repo's established e2e convention (see
 * tests/e2e/cashier-flow.spec.ts / tests/fixtures.ts): direct DB calls for
 * fixtures, then real browser interaction for the behavior under test.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const STAFF_PASSWORD = "E2E_Test_P@ssw0rd_2026!";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

test("owner accepts an invite and reaches the portal dashboard", async ({ page }) => {
  test.setTimeout(60_000);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: "E2E Portal Org", slug: `e2e-portal-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError).toBeNull();

  // Real per-organization roles + role_permissions (TENANT_OWNER carries
  // members.portal.invite) -- organizations.insert() alone does not clone
  // these; only create_organization()/onboarding RPCs do that automatically.
  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });
  expect(cloneError).toBeNull();

  // A genuinely authenticated staff user with TENANT_OWNER, wired up
  // directly against user_role_assignments via the service-role client --
  // NOT through add_organization_member, which itself requires an
  // authenticated caller with tenant.users.manage and would reject a
  // service-role/no-session call (auth.uid() is null for service-role).
  const staffEmail = `staff-e2e-${Date.now()}@resortos-test.local`;
  const { data: staffCreated, error: staffCreateError } = await admin.auth.admin.createUser({
    email: staffEmail,
    password: STAFF_PASSWORD,
    email_confirm: true,
  });
  expect(staffCreateError).toBeNull();
  const staffUserId = staffCreated!.user!.id;

  const { data: ownerRole, error: ownerRoleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  expect(ownerRoleError).toBeNull();

  const { error: staffAssignError } = await admin
    .from("user_role_assignments")
    .insert({ user_id: staffUserId, role_id: ownerRole!.id, organization_id: org!.id });
  expect(staffAssignError).toBeNull();

  const staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: staffSignInError } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: STAFF_PASSWORD });
  expect(staffSignInError).toBeNull();

  const email = `owner-e2e-${Date.now()}@example.com`;
  const { data: member, error: memberError } = await admin
    .from("members")
    .insert({ organization_id: org!.id, full_name: "E2E Test Owner", email })
    .select("id")
    .single();
  expect(memberError).toBeNull();

  // Real call as the genuinely authenticated staff member -- exercises the
  // members.portal.invite permission check for real.
  const { data: invitation, error: invitationError } = await staffClient
    .rpc("create_member_invitation", { p_member_id: member!.id })
    .single<{ invitation_id: string; raw_token: string; member_email: string; member_phone: string | null }>();
  expect(invitationError, `create_member_invitation failed: ${invitationError?.message}`).toBeNull();

  const redirectTo = `${baseURL}/ar/portal/accept-invite?invitation=${invitation!.invitation_id}&t=${invitation!.raw_token}`;
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  expect(linkError).toBeNull();

  await page.goto(linkData!.properties!.action_link);
  await expect(page.getByRole("heading", { name: /تعيين كلمة مرور|Set your password/ })).toBeVisible({ timeout: 10000 });

  await page.getByLabel(/كلمة المرور|Password/).fill("TestPassword123!");
  await page.getByRole("button", { name: /تفعيل الحساب|Activate account/ }).click();

  await expect(page).toHaveURL(/\/portal$/, { timeout: 10000 });
  // exact: true, not a plain substring match -- Task 14's real dashboard
  // added an h1 ("مرحبًا، E2E Test Owner") and a route-announcer div that
  // both contain this name as a substring alongside the sidebar's exact
  // "E2E Test Owner" <p>, so a non-exact getByText resolves to 3 elements
  // (Playwright strict-mode violation). The sidebar's exact match is the
  // one that actually proves the member link succeeded (PortalShell only
  // renders it once getPortalMemberContext() resolves a real member row).
  await expect(page.getByText("E2E Test Owner", { exact: true })).toBeVisible();

  // set_organization_status is security definer but self-gates on
  // is_platform_admin(auth.uid()) -- auth.uid() is null under the
  // service-role client, so the RPC call silently fails (42501) and never
  // archives anything. Update the status directly instead: the
  // service-role client already bypasses RLS, so the RPC's permission gate
  // isn't buying anything for a throwaway test fixture teardown.
  await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", org!.id);
});
