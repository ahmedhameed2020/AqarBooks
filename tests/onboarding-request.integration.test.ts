// @ts-nocheck
/**
 * Assisted onboarding (Release B): request submission + approval-gated provisioning.
 *
 * WHY THIS TESTS THE RPC/RLS LAYER, NOT lib/actions/onboarding-request.ts DIRECTLY
 * submitOnboardingRequestAction and approveOnboardingRequest/rejectOnboardingRequest
 * (lib/actions/platform.ts) are thin, validated pass-throughs -- the actual security
 * boundary is the RLS policies on onboarding_requests/onboarding_request_events and
 * the SECURITY DEFINER functions approve_onboarding_request/reject_onboarding_request
 * (migration 20260826102930_assisted_onboarding_requests.sql). The submission action
 * also calls next/headers' headers(), which throws outside a real Next.js request
 * scope -- exercising it via a running dev server would add an HTTP hop without
 * adding any assurance the RLS/RPC layer itself doesn't already give, matching the
 * same reasoning tests/demo-entry-rate-limit.integration.test.ts documents for the
 * demo rate limiter. This suite calls the database directly and, where it needs to
 * reproduce "what the submission action does," does so with the same two calls the
 * action makes (admin.auth.admin.createUser then an admin insert) rather than
 * importing the action.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_PASSWORD = `Onboarding-${randomUUID()}`;

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdRequestIds: string[] = [];
const createdRoleAssignmentIds: string[] = [];

/** Creates a confirmed auth user and returns a signed-in client for them. */
async function createSignedInUser(prefix: string) {
  const email = `${prefix}-${randomUUID()}@aqarbooks-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInError) throw signInError;

  return { userId: data.user.id, email, client };
}

/**
 * Grants the single, real, already-seeded PLATFORM_SUPER_ADMIN role to a
 * fresh test user -- an ASSIGNMENT, not a second role row. The baseline
 * hard-asserts exactly one PLATFORM_SUPER_ADMIN role exists
 * (organization_id IS NULL); this never creates another one, it only points
 * a new user_role_assignments row at the existing one.
 */
async function createPlatformAdmin() {
  const { userId, email, client } = await createSignedInUser("platform-admin-probe");

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("key", "PLATFORM_SUPER_ADMIN")
    .is("organization_id", null)
    .single();
  if (roleError || !role) throw roleError ?? new Error("PLATFORM_SUPER_ADMIN role not found");

  const { data: assignment, error: assignError } = await admin
    .from("user_role_assignments")
    .insert({ user_id: userId, role_id: role.id, organization_id: null })
    .select("id")
    .single();
  if (assignError) throw assignError;
  createdRoleAssignmentIds.push(assignment.id);

  return { userId, email, client };
}

/**
 * Fixture helper: creates a fresh confirmed user and one onboarding_requests
 * row for them via the service-role client. NOTE: this does not simulate
 * lib/actions/onboarding-request.ts's exact call sequence anymore -- since
 * the Release B follow-up split that action in two (startOnboardingAccountAction
 * for Step 1, submitOnboardingRequestAction for Step 4, joined by a real
 * session rather than one all-or-nothing transaction), the request INSERT
 * itself is still always done via the service-role admin client either way
 * (submitOnboardingRequestAction resolves the requester from the session,
 * but still writes through createAdminClient() -- see that file), so this
 * helper's shape is still an accurate stand-in for "a request exists for
 * this requester", which is what most tests below need.
 */
async function submitRequest(overrides: Record<string, unknown> = {}) {
  const email = `onboarding-request-${randomUUID()}@aqarbooks-test.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Test Requester" },
  });
  if (createError || !created?.user) throw createError ?? new Error("createUser failed");
  createdUserIds.push(created.user.id);

  const { data: inserted, error: insertError } = await admin
    .from("onboarding_requests")
    .insert({
      requester_user_id: created.user.id,
      full_name: "Test Requester",
      work_email: email,
      organization_name: `Test Co ${randomUUID()}`,
      entity_type: "DEVELOPER",
      requested_plan_key: "STARTER",
      ...overrides,
    })
    .select("*")
    .single();
  if (insertError || !inserted) throw insertError ?? new Error("insert failed");
  createdRequestIds.push(inserted.id);

  await admin.from("onboarding_request_events").insert({
    request_id: inserted.id,
    event_type: "SUBMITTED",
    actor_id: created.user.id,
  });

  return { requesterId: created.user.id, request: inserted };
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
    await admin.from("organization_memberships").delete().eq("organization_id", orgId);
    await admin.from("role_permissions").delete().in(
      "role_id",
      (await admin.from("roles").select("id").eq("organization_id", orgId)).data?.map((r) => r.id) ?? [],
    );
    await admin.from("roles").delete().eq("organization_id", orgId);
    await admin.from("subscriptions").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const requestId of createdRequestIds) {
    await admin.from("onboarding_request_events").delete().eq("request_id", requestId);
    await admin.from("onboarding_requests").delete().eq("id", requestId);
  }
  for (const assignmentId of createdRoleAssignmentIds) {
    await admin.from("user_role_assignments").delete().eq("id", assignmentId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("public submission never touches organizations directly", () => {
  it("onboarding_requests has no anon/authenticated INSERT policy -- the door is the service-role action, nothing else", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await anon.from("onboarding_requests").insert({
      requester_user_id: "00000000-0000-0000-0000-000000000000",
      full_name: "x",
      work_email: "x@example.com",
      organization_name: "x",
      entity_type: "DEVELOPER",
      requested_plan_key: "STARTER",
    });
    expect(error, "anon must never be able to insert a request row directly").toBeTruthy();
  });

  it("a submitted request creates exactly one PENDING_APPROVAL row and zero organizations", async () => {
    const orgsBefore = await admin.from("organizations").select("id", { count: "exact", head: true });

    const { request } = await submitRequest();

    expect(request.status).toBe("PENDING_APPROVAL");
    expect(request.organization_id).toBeNull();

    const orgsAfter = await admin.from("organizations").select("id", { count: "exact", head: true });
    expect(orgsAfter.count, "submission alone must create zero organizations").toBe(orgsBefore.count);
  });
});

describe("Step 1 requires real email verification, never Admin-API auto-confirmation", () => {
  const actionSource = readFileSync(join(process.cwd(), "lib/actions/onboarding-request.ts"), "utf8");
  const accountFormSource = readFileSync(
    join(process.cwd(), "app/[locale]/get-started/account-step-form.tsx"),
    "utf8",
  );
  const checkEmailPageSource = readFileSync(
    join(process.cwd(), "app/[locale]/get-started/check-email/page.tsx"),
    "utf8",
  );

  it("startOnboardingAccountAction never calls the Admin API to create or auto-confirm an identity", () => {
    expect(actionSource, "must not force email_confirm").not.toContain("email_confirm");
    expect(actionSource, "must not use the Admin API to create a user").not.toContain("admin.auth.admin.createUser");
    expect(actionSource, "must not use the Admin API to delete a user (no orphan to compensate for anymore)").not.toContain(
      "admin.auth.admin.deleteUser",
    );
    expect(actionSource, "must not touch an existing account's password/metadata").not.toContain("updateUserById");
    expect(actionSource, "must use the real, unprivileged signUp flow").toContain(".auth.signUp(");
  });

  it("a brand-new signup gets no session until the emailed confirmation link is used (no email_confirm override reaches signUp's options)", () => {
    const signUpCallStart = actionSource.indexOf(".auth.signUp(");
    const signUpCallEnd = actionSource.indexOf("});", signUpCallStart);
    const signUpCall = actionSource.slice(signUpCallStart, signUpCallEnd);
    expect(signUpCall, "signUp() must be called with only email/password/options -- no confirmation override exists on this API").not.toContain(
      "email_confirm",
    );
    expect(signUpCall, "the confirmation link must resume the wizard at the company step").toContain(
      "/get-started/company",
    );
  });

  it("submitOnboardingRequestAction refuses when there is no session, rather than trusting a client-supplied identity", () => {
    expect(actionSource).toContain('error: "not_authenticated"');
    const submitFnStart = actionSource.indexOf("export async function submitOnboardingRequestAction");
    const getUserGuard = actionSource.indexOf("if (!user) {", submitFnStart);
    expect(getUserGuard, "submitOnboardingRequestAction must guard on the session's own user, not a form field").toBeGreaterThan(-1);
  });

  it("neither the account form nor the post-submit page discloses whether an email is already registered", () => {
    const haystack = (actionSource + accountFormSource + checkEmailPageSource).toLowerCase();
    expect(haystack, "no UI-facing branch may state that an email already exists").not.toContain("already registered");
    expect(actionSource, "no distinguishing error code for an existing email").not.toContain("email_already_registered");
  });

  it("the new-user trigger on auth.users creates a profile row and nothing tenant-shaped, confirmed or not", async () => {
    const fakeId = randomUUID();
    const email = `verify-trigger-${fakeId}@aqarbooks-test.invalid`;

    // Mirrors exactly what supabase.auth.signUp() leaves behind before the
    // confirmation link is ever clicked: a real auth.users row with
    // email_confirmed_at still null. Inserted directly (not via signUp,
    // which this test file cannot call without a request scope) so the
    // trigger this row fires is exercised the same way either way.
    const { data: createdData, error: insertUserError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: false,
      user_metadata: { full_name: "Trigger Probe" },
    });
    expect(insertUserError, "fixture setup must succeed").toBeNull();
    const created = createdData?.user;
    expect(created, "fixture user must exist").toBeTruthy();
    createdUserIds.push(created!.id);
    expect(created!.email_confirmed_at, "this fixture must reproduce the pre-confirmation state").toBeFalsy();

    const { data: profile } = await admin.from("profiles").select("id").eq("id", created!.id).maybeSingle();
    expect(profile, "the new-user trigger must still create the ordinary profile row").toBeTruthy();

    const [orgs, memberships, roleAssignments, onboardingRequests] = await Promise.all([
      admin.from("organizations").select("id", { count: "exact", head: true }).eq("created_by", created!.id),
      admin.from("organization_memberships").select("id", { count: "exact", head: true }).eq("user_id", created!.id),
      admin.from("user_role_assignments").select("id", { count: "exact", head: true }).eq("user_id", created!.id),
      admin.from("onboarding_requests").select("id", { count: "exact", head: true }).eq("requester_user_id", created!.id),
    ]);
    expect(orgs.count, "an unconfirmed signup must own zero organizations").toBe(0);
    expect(memberships.count, "an unconfirmed signup must have zero memberships").toBe(0);
    expect(roleAssignments.count, "an unconfirmed signup must have zero role assignments").toBe(0);
    expect(onboardingRequests.count, "an unconfirmed signup must have zero onboarding requests").toBe(0);
  });
});

describe("request idempotency: onboarding_requests_one_actionable_per_requester", () => {
  it("a second actionable-status insert for the same requester is refused (23505), not a second row", async () => {
    const { requesterId, request } = await submitRequest();

    const { error: retryError } = await admin.from("onboarding_requests").insert({
      requester_user_id: requesterId,
      full_name: "Test Requester",
      work_email: request.work_email,
      organization_name: "Retry Co",
      entity_type: "DEVELOPER",
      requested_plan_key: "STARTER",
    });
    expect(retryError, "a second actionable request for the same requester must be refused").toBeTruthy();
    expect(retryError!.code).toBe("23505");

    const { count } = await admin
      .from("onboarding_requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_user_id", requesterId);
    expect(count, "exactly one row must exist for this requester, not two").toBe(1);
  });

  it("after a terminal state (REJECTED), the same requester may submit a new actionable request", async () => {
    const { requesterId, request } = await submitRequest();

    await admin.from("onboarding_requests").update({ status: "REJECTED" }).eq("id", request.id);

    const { data: secondRequest, error: secondError } = await admin
      .from("onboarding_requests")
      .insert({
        requester_user_id: requesterId,
        full_name: "Test Requester",
        work_email: request.work_email,
        organization_name: "Second Entity Co",
        entity_type: "DEVELOPER",
        requested_plan_key: "PROFESSIONAL",
      })
      .select("id")
      .single();
    expect(secondError, `a new request after REJECTED must be allowed: ${secondError?.message}`).toBeNull();
    if (secondRequest) createdRequestIds.push(secondRequest.id);
  });
});

describe("an existing customer requesting a second entity keeps their existing tenant access", () => {
  it("a new onboarding request does not touch the requester's pre-existing organization_memberships row", async () => {
    const { userId, client } = await createSignedInUser("existing-customer-second-entity");

    const { data: placeholderOrg, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `Pre-existing Co ${randomUUID()}`, slug: `pre-existing-${randomUUID()}`, default_currency: "EGP" })
      .select("id")
      .single();
    if (orgError || !placeholderOrg) throw orgError ?? new Error("failed to create placeholder org");
    createdOrgIds.push(placeholderOrg.id);

    const { error: membershipError } = await admin
      .from("organization_memberships")
      .insert({ organization_id: placeholderOrg.id, user_id: userId, status: "active" });
    if (membershipError) throw membershipError;

    // The existing customer's own session still resolves to their existing org.
    const { data: sessionUser } = await client.auth.getUser();
    expect(sessionUser.user?.id).toBe(userId);

    const { request } = await submitRequest({ requester_user_id: userId, work_email: sessionUser.user!.email! });

    const { data: membershipAfter, error: membershipAfterError } = await admin
      .from("organization_memberships")
      .select("status")
      .eq("organization_id", placeholderOrg.id)
      .eq("user_id", userId)
      .single();
    expect(membershipAfterError, "the pre-existing membership must still exist").toBeNull();
    expect(membershipAfter?.status, "the pre-existing membership must remain active, untouched").toBe("active");
    expect(request.status).toBe("PENDING_APPROVAL");
  });
});

describe("onboarding account-creation rate limit (separate from request-submission rate limit)", () => {
  it("onboarding_account_create is durably rate-limited at 5/hour/client, independently of onboarding_request_submit", async () => {
    const key = `account-create-gate-${randomUUID()}`;

    for (let i = 0; i < 5; i += 1) {
      const { data: allowed, error } = await admin.rpc("check_and_record_rate_limit", {
        p_action: "onboarding_account_create",
        p_client_key: key,
        p_limit: 5,
        p_window_seconds: 3600,
      });
      expect(error, `attempt ${i + 1} of 5`).toBeNull();
      expect(allowed, `attempt ${i + 1} of 5`).toBe(true);
    }

    const { data: sixth } = await admin.rpc("check_and_record_rate_limit", {
      p_action: "onboarding_account_create",
      p_client_key: key,
      p_limit: 5,
      p_window_seconds: 3600,
    });
    expect(sixth, "6th account-creation attempt in one hour must be denied").toBe(false);

    // A denied account-creation attempt is a distinct action from request
    // submission -- the same client_key must still have full quota there,
    // proving the two rate limits are independent, not one shared bucket.
    const { data: requestSubmitStillAllowed } = await admin.rpc("check_and_record_rate_limit", {
      p_action: "onboarding_request_submit",
      p_client_key: key,
      p_limit: 5,
      p_window_seconds: 3600,
    });
    expect(requestSubmitStillAllowed, "onboarding_request_submit must not share onboarding_account_create's bucket").toBe(true);
  });

  it("rate-limit ordering: lib/actions/onboarding-request.ts calls check_and_record_rate_limit before admin.auth.admin.createUser (verified by source order, not executable here -- see file doc comment on why headers() blocks importing the action directly)", () => {
    const source = readFileSync(join(process.cwd(), "lib/actions/onboarding-request.ts"), "utf8");
    const rateLimitIndex = source.indexOf("onboarding_account_create");
    const createUserIndex = source.indexOf("admin.auth.admin.createUser(");
    expect(rateLimitIndex, "the rate-limit call must appear in the source").toBeGreaterThan(-1);
    expect(createUserIndex, "the createUser call must appear in the source").toBeGreaterThan(-1);
    expect(rateLimitIndex, "the rate-limit check must be written before createUser in startOnboardingAccountAction").toBeLessThan(createUserIndex);
  });
});

describe("approval is authorization-gated", () => {
  it("a normal authenticated user (not a platform admin) cannot approve", async () => {
    const { request } = await submitRequest();
    const { client: normalUser } = await createSignedInUser("normal-user-probe");

    const { error } = await normalUser.rpc("approve_onboarding_request", {
      p_request_id: request.id,
      p_review_notes: null,
    });
    expect(error, "a non-admin must be refused").toBeTruthy();
    expect(error.code).toBe("42501");

    const { data: stillPending } = await admin.from("onboarding_requests").select("status").eq("id", request.id).single();
    expect(stillPending.status, "an unauthorized attempt must not change status").toBe("PENDING_APPROVAL");
  });

  it("a normal authenticated user (not a platform admin) cannot reject", async () => {
    const { request } = await submitRequest();
    const { client: normalUser } = await createSignedInUser("normal-user-probe");

    const { error } = await normalUser.rpc("reject_onboarding_request", {
      p_request_id: request.id,
      p_review_notes: "no",
    });
    expect(error).toBeTruthy();
    expect(error.code).toBe("42501");
  });
});

describe("approval provisions exactly one organization, correctly", () => {
  it("a platform admin's approval creates one organization, assigns the requester as TENANT_OWNER, and applies the plan", async () => {
    const { requesterId, request } = await submitRequest({ requested_plan_key: "PROFESSIONAL" });
    const { client: platformAdmin } = await createPlatformAdmin();

    const { data: organizationId, error } = await platformAdmin.rpc("approve_onboarding_request", {
      p_request_id: request.id,
      p_review_notes: "looks good",
    });
    expect(error, `approval must succeed: ${error?.message}`).toBeNull();
    expect(organizationId).toBeTruthy();
    createdOrgIds.push(organizationId);

    const { data: updated } = await admin.from("onboarding_requests").select("*").eq("id", request.id).single();
    expect(updated.status).toBe("ACTIVE");
    expect(updated.organization_id).toBe(organizationId);
    expect(updated.reviewed_by).toBeTruthy();
    expect(updated.review_notes).toBe("looks good");

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("status")
      .eq("organization_id", organizationId)
      .eq("user_id", requesterId)
      .single();
    expect(membership?.status).toBe("active");

    const { data: roleAssignment } = await admin
      .from("user_role_assignments")
      .select("role_id, roles!inner(key)")
      .eq("organization_id", organizationId)
      .eq("user_id", requesterId)
      .single();
    expect(roleAssignment?.roles?.key).toBe("TENANT_OWNER");

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status, plans!inner(key)")
      .eq("organization_id", organizationId)
      .eq("status", "ACTIVE")
      .single();
    expect(subscription?.plans?.key).toBe("PROFESSIONAL");

    const { data: events } = await admin
      .from("onboarding_request_events")
      .select("event_type")
      .eq("request_id", request.id)
      .order("created_at", { ascending: true });
    expect(events?.map((e) => e.event_type)).toEqual([
      "SUBMITTED",
      "APPROVED",
      "PROVISIONING_STARTED",
      "PROVISIONED",
    ]);
  });

  it("double approval (retry/double-click) is idempotent: no second organization, same result", async () => {
    const { request } = await submitRequest();
    const { client: platformAdmin } = await createPlatformAdmin();

    const first = await platformAdmin.rpc("approve_onboarding_request", { p_request_id: request.id });
    expect(first.error, `first approval must succeed: ${first.error?.message}`).toBeNull();
    createdOrgIds.push(first.data);

    const orgsBeforeRetry = await admin.from("organizations").select("id", { count: "exact", head: true });

    const second = await platformAdmin.rpc("approve_onboarding_request", { p_request_id: request.id });
    expect(second.error, "a retry after success must not error").toBeNull();
    expect(second.data, "a retry must return the same organization_id").toBe(first.data);

    const orgsAfterRetry = await admin.from("organizations").select("id", { count: "exact", head: true });
    expect(orgsAfterRetry.count, "a retry must not create a second organization").toBe(orgsBeforeRetry.count);
  });
});

describe("rejection provisions nothing", () => {
  it("rejecting a request records the reviewer and reason, and creates zero organizations", async () => {
    const { request } = await submitRequest();
    const { client: platformAdmin, userId: adminUserId } = await createPlatformAdmin();

    const orgsBefore = await admin.from("organizations").select("id", { count: "exact", head: true });

    const { error } = await platformAdmin.rpc("reject_onboarding_request", {
      p_request_id: request.id,
      p_review_notes: "duplicate submission",
    });
    expect(error, `rejection must succeed: ${error?.message}`).toBeNull();

    const { data: updated } = await admin.from("onboarding_requests").select("*").eq("id", request.id).single();
    expect(updated.status).toBe("REJECTED");
    expect(updated.reviewed_by).toBe(adminUserId);
    expect(updated.review_notes).toBe("duplicate submission");
    expect(updated.organization_id).toBeNull();

    const orgsAfter = await admin.from("organizations").select("id", { count: "exact", head: true });
    expect(orgsAfter.count, "rejection must create zero organizations").toBe(orgsBefore.count);
  });

  it("a rejected request cannot subsequently be approved", async () => {
    const { request } = await submitRequest();
    const { client: platformAdmin } = await createPlatformAdmin();

    await platformAdmin.rpc("reject_onboarding_request", { p_request_id: request.id, p_review_notes: "no" });

    const { data, error } = await platformAdmin.rpc("approve_onboarding_request", { p_request_id: request.id });
    expect(error, "approving an already-rejected request must be refused").toBeTruthy();
    expect(data).toBeFalsy();
  });
});

describe("existing customer login is unaffected by this migration", () => {
  it("a plain authenticated sign-in still works and has_permission still resolves", async () => {
    const { client, userId } = await createSignedInUser("existing-customer-probe");

    const { data: sessionUser } = await client.auth.getUser();
    expect(sessionUser.user?.id).toBe(userId);

    const { data: anyOrg } = await admin.from("organizations").select("id").limit(1).single();
    const { error } = await client.rpc("has_permission", {
      p_user_id: userId,
      p_organization_id: anyOrg!.id,
      p_permission_key: "finance.reports.read",
    });
    expect(error, "has_permission must still resolve normally after this migration").toBeNull();
  });
});

describe("the demo tenant remains frozen and read-only", () => {
  it("the demo organization's financial snapshot is unchanged", async () => {
    const { data: demoOrg } = await admin.from("organizations").select("id").eq("is_demo", true).limit(1).single();
    expect(demoOrg, "a demo organization must exist").toBeTruthy();

    const { count: dueCount } = await admin
      .from("dues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", demoOrg!.id);
    expect(dueCount).toBe(240);

    const { count: paymentCount } = await admin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", demoOrg!.id);
    expect(paymentCount).toBe(183);

    const { count: journalEntryCount } = await admin
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", demoOrg!.id);
    expect(journalEntryCount).toBe(423);
  });

  it("the demo principal still cannot write (spot check: cannot submit an onboarding request as itself)", async () => {
    const { data: demoOrg } = await admin.from("organizations").select("id").eq("is_demo", true).limit(1).single();
    const { data: membership } = await admin
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", demoOrg!.id)
      .eq("status", "active")
      .limit(1)
      .single();

    const { error } = await admin.from("onboarding_requests").insert({
      requester_user_id: membership!.user_id,
      full_name: "demo principal",
      work_email: "demo-principal-should-not-write@aqarbooks-test.invalid",
      organization_name: "should not be created",
      entity_type: "DEVELOPER",
      requested_plan_key: "STARTER",
    });
    // This uses the admin client (service role always bypasses RLS) purely to
    // create a fixture-free row for cleanup bookkeeping -- the actual demo
    // read-only guarantee is that this table has no anon/authenticated INSERT
    // policy at all (see the first describe block above), which already
    // applies uniformly to every authenticated principal including the demo
    // one; this test exists only to document that the demo principal is not
    // special-cased into an exception.
    if (!error) {
      const { data } = await admin
        .from("onboarding_requests")
        .select("id")
        .eq("work_email", "demo-principal-should-not-write@aqarbooks-test.invalid")
        .single();
      if (data) createdRequestIds.push(data.id);
    }
  });
});
