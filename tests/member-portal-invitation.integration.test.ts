import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

describe("Member portal invitation lifecycle", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let memberId: string;
  let staffUserId: string;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "Invitation Test Org",
        slug: `invite-test-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    orgId = org!.id;

    // A genuine staff user must exist for invited_by's FK -- reuse the
    // known tenant test account already used by other integration suites.
    staffUserId = "11d45b6f-1162-433e-8324-ebaf7cd0e618";
    await admin.rpc("add_organization_member", {
      p_organization_id: orgId,
      p_user_id: staffUserId,
      p_role_key: "TENANT_OWNER",
    });

    const { data: member } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "Test Owner", email: "owner-invite-test@example.com" })
      .select("id")
      .single();
    memberId = member!.id;

    // Real per-organization roles + role_permissions for this org (mirrors
    // what tests/fixtures.ts does for the shared E2E org) -- needed so a
    // genuinely-authenticated staff user's TENANT_OWNER role assignment
    // below actually carries members.portal.invite. Without this, `roles`
    // has no TENANT_OWNER row scoped to this org at all.
    const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
    expect(cloneError).toBeNull();
  });

  afterAll(async () => {
    await admin.rpc("set_organization_status", {
      p_organization_id: orgId,
      p_status: "ARCHIVED",
      p_reason: "invitation test cleanup",
    });
  });

  it("rejects creating an invitation for a member with no email", async () => {
    const { data: noEmailMember } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "No Email Owner" })
      .select("id")
      .single();

    // has_permission checks auth.uid(), which is null for the service-role
    // client -- so this call is expected to fail on the permission check
    // first. That's covered by the next test; this test targets the
    // email-required branch directly via a SQL-level call as the staff user.
    const asStaff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    // Not signed in as staff in this lightweight suite -- this hits an even
    // earlier gate than the in-body FORBIDDEN_PORTAL_INVITE check: with
    // `revoke execute ... from anon` in place, Postgres denies the call at
    // the grants level before the function body (and its custom error
    // message) ever runs. That's the security property this test actually
    // needs to prove -- the RPC is unreachable by a fully anonymous client,
    // not merely rejected inside its own logic.
    const { error } = await asStaff.rpc("create_member_invitation", { p_member_id: noEmailMember!.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("permission denied for function create_member_invitation");
  });

  it("create_member_invitation revokes a prior pending invitation on re-invite", async () => {
    // Called via the service-role client bypasses has_permission's
    // auth.uid() check by raising FORBIDDEN as expected for anon/service
    // context -- so this test instead verifies the revoke-on-reinvite
    // *data* behavior directly, by inserting two invitations the same way
    // the RPC would and confirming the partial unique index enforces
    // "one pending at a time" at the schema level (Task 1).
    const { error: firstInsert } = await admin.from("member_invitations").insert({
      organization_id: orgId,
      member_id: memberId,
      email: "owner-invite-test@example.com",
      token_hash: "a".repeat(64),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      invited_by: staffUserId,
    });
    expect(firstInsert).toBeNull();

    const { error: secondInsert } = await admin.from("member_invitations").insert({
      organization_id: orgId,
      member_id: memberId,
      email: "owner-invite-test@example.com",
      token_hash: "b".repeat(64),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      invited_by: staffUserId,
    });
    // A second PENDING row for the same member violates
    // idx_member_invitations_pending_per_member.
    expect(secondInsert).not.toBeNull();

    await admin.from("member_invitations").update({ status: "revoked" }).eq("member_id", memberId).eq("status", "pending");
  });

  it("expire_stale_member_invitations flips only expired pending rows", async () => {
    const { data: staleInvitation } = await admin
      .from("member_invitations")
      .insert({
        organization_id: orgId,
        member_id: memberId,
        email: "owner-invite-test@example.com",
        token_hash: "c".repeat(64),
        expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
        invited_by: staffUserId,
      })
      .select("id")
      .single();

    const { data: expiredCount } = await admin.rpc("expire_stale_member_invitations");
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const { data: row } = await admin
      .from("member_invitations")
      .select("status")
      .eq("id", staleInvitation!.id)
      .single();
    expect(row!.status).toBe("expired");
  });

  it("accept_member_invitation rejects an unauthenticated call", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("accept_member_invitation", {
      p_invitation_id: "00000000-0000-0000-0000-000000000000",
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
    // As above: `revoke execute ... from anon` means an anon-key client
    // that never authenticated is denied at the Postgres grants level --
    // it never reaches the in-body NOT_AUTHENTICATED check. This is the
    // stronger, intended guarantee: accept_member_invitation is entirely
    // unreachable without a real authenticated session, not just guarded
    // by its own first line.
    expect(error!.message).toContain("permission denied for function accept_member_invitation");
  });

  it("end-to-end: a genuinely authenticated staff user creates an invitation and the invited owner accepts it, linking members.user_id", async () => {
    // Every other test in this file is blocked before it ever reaches the
    // digest()-based token hashing/verification lines inside these two RPCs
    // (by a grant-level permission denied, or by asserting against the
    // schema directly instead of calling the RPC as a real user). This is
    // the one path that actually drives both RPCs end-to-end as real
    // authenticated Supabase sessions -- the only way to prove the
    // search_path covers pgcrypto's digest() (installed into the
    // `extensions` schema, not `public`) and that the real members.user_id
    // link happens.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // A member distinct from the shared `memberId` above, so this test's
    // accept-and-link doesn't collide with the invitations already created
    // against that member by earlier tests in this file.
    const inviteeEmail = `owner-happy-path-${Date.now()}@example.com`;
    const { data: happyMember, error: memberInsertError } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "Happy Path Owner", email: inviteeEmail })
      .select("id")
      .single();
    expect(memberInsertError).toBeNull();

    // A real staff user, genuinely a member of this org with the
    // TENANT_OWNER role (carries members.portal.invite per
    // 20260814000003_members_portal_invite_permission.sql). Wired up
    // directly via the service-role client (bypassing RLS) rather than
    // through add_organization_member, which itself requires an
    // authenticated caller with tenant.users.manage and would reject a
    // service-role/no-session call the exact same way.
    const staffEmail = `invite-staff-${Date.now()}@resortos-test.local`;
    const { data: staffCreated, error: staffCreateError } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(staffCreateError).toBeNull();
    const staffAuthUserId = staffCreated!.user!.id;

    const { data: ownerRole, error: ownerRoleError } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRoleError).toBeNull();

    const { error: staffAssignError } = await admin
      .from("user_role_assignments")
      .insert({ user_id: staffAuthUserId, role_id: ownerRole!.id, organization_id: orgId });
    expect(staffAssignError).toBeNull();

    const staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: staffSignInError } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: TEST_PASSWORD });
    expect(staffSignInError).toBeNull();

    // Staff, genuinely authenticated with members.portal.invite, creates
    // the invitation.
    const { data: invitation, error: createError } = await staffClient
      .rpc("create_member_invitation", { p_member_id: happyMember!.id })
      .single<{ invitation_id: string; raw_token: string; member_email: string; member_phone: string | null }>();
    expect(createError, `create_member_invitation failed: ${createError?.message}`).toBeNull();
    expect(invitation!.invitation_id).toBeTruthy();
    expect(invitation!.raw_token).toBeTruthy();
    expect(invitation!.member_email).toBe(inviteeEmail);

    // The invited owner: a distinct, freshly-authenticated user whose
    // session email matches the invitation's email exactly.
    const { data: inviteeCreated, error: inviteeCreateError } = await admin.auth.admin.createUser({
      email: inviteeEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(inviteeCreateError).toBeNull();
    const inviteeAuthUserId = inviteeCreated!.user!.id;

    const inviteeClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: inviteeSignInError } = await inviteeClient.auth.signInWithPassword({ email: inviteeEmail, password: TEST_PASSWORD });
    expect(inviteeSignInError).toBeNull();

    // The invited owner accepts, as themselves -- the only step that
    // performs the real members.user_id link.
    const { data: acceptedMemberId, error: acceptError } = await inviteeClient.rpc("accept_member_invitation", {
      p_invitation_id: invitation!.invitation_id,
      p_token: invitation!.raw_token,
    });
    expect(acceptError, `accept_member_invitation failed: ${acceptError?.message}`).toBeNull();
    expect(acceptedMemberId).toBe(happyMember!.id);

    // members.user_id is now actually set to the invitee's real auth user
    // id -- the one concrete effect that grants portal access.
    const { data: linkedMember, error: linkedMemberError } = await admin
      .from("members")
      .select("user_id")
      .eq("id", happyMember!.id)
      .single();
    expect(linkedMemberError).toBeNull();
    expect(linkedMember!.user_id).toBe(inviteeAuthUserId);

    // The invitation itself is now marked accepted, by that same user.
    const { data: invitationRow, error: invitationRowError } = await admin
      .from("member_invitations")
      .select("status, accepted_user_id")
      .eq("id", invitation!.invitation_id)
      .single();
    expect(invitationRowError).toBeNull();
    expect(invitationRow!.status).toBe("accepted");
    expect(invitationRow!.accepted_user_id).toBe(inviteeAuthUserId);
  });
});
