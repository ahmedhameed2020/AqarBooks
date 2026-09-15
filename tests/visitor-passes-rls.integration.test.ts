import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Visitor_Passes_RLS_Test_P@ssw0rd_2026!";
const SECRET_PREFIX = "visitor-pass-secret-for-runtime-rls";

type LocalSupabaseEnv = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

type Actor = {
  userId: string;
  email: string;
  client: Client;
};

type MemberActor = Actor & {
  memberId: string;
};

type OrgFixture = {
  orgId: string;
  propertyId: string;
  unitAId: string;
  unitBId: string;
  futureUnitId: string;
  memberA: MemberActor;
  memberB: MemberActor;
  staffManager: Actor;
  staffViewer: Actor;
};

function readLocalSupabaseEnv(): LocalSupabaseEnv {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }

  if (!env.API_URL?.startsWith("http://127.0.0.1:") && !env.API_URL?.startsWith("http://localhost:")) {
    throw new Error("Visitor pass RLS gate must run against local Supabase.");
  }

  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase anon/service-role keys were not available from supabase status.");
  }

  return {
    API_URL: env.API_URL,
    ANON_KEY: env.ANON_KEY,
    SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  };
}

function runLocalDbQuery(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_aqarbooks",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
      "-F",
      "|",
      "-c",
      sql,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function tokenHash(secret = `${SECRET_PREFIX}-${randomUUID()}`) {
  return createHash("sha256").update(secret).digest("hex");
}

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(
    /row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized|invalid|expired|window/i,
  );
}

async function createSignedInClient(local: LocalSupabaseEnv, email: string): Promise<Client> {
  const client = createClient<Database>(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return client;
}

async function createAuthUser(admin: Client, label: string): Promise<{ userId: string; email: string }> {
  const email = `visitor-passes-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
}

async function createMemberActor(
  admin: Client,
  local: LocalSupabaseEnv,
  orgId: string,
  label: string,
): Promise<MemberActor> {
  const actor = await createAuthUser(admin, label);
  const { data: member, error } = await admin
    .from("members")
    .insert({
      organization_id: orgId,
      full_name: `Visitor Member ${label}`,
      email: actor.email,
      user_id: actor.userId,
    })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();
  return { ...actor, memberId: member!.id, client: await createSignedInClient(local, actor.email) };
}

async function createStaffActor(
  admin: Client,
  local: LocalSupabaseEnv,
  orgId: string,
  roleKey: "PROPERTY_MANAGER" | "VIEWER",
  label: string,
): Promise<Actor> {
  const actor = await createAuthUser(admin, label);

  const { error: membershipError } = await admin
    .from("organization_memberships")
    .insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  expect(membershipError, `staff membership failed: ${membershipError?.message}`).toBeNull();

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", roleKey)
    .single();
  expect(roleError, `role lookup failed for ${roleKey}: ${roleError?.message}`).toBeNull();

  const { error: assignmentError } = await admin.from("user_role_assignments").insert({
    user_id: actor.userId,
    role_id: role!.id,
    organization_id: orgId,
  });
  expect(assignmentError, `staff role assignment failed: ${assignmentError?.message}`).toBeNull();

  return { ...actor, client: await createSignedInClient(local, actor.email) };
}

async function createOrgFixture(
  admin: Client,
  local: LocalSupabaseEnv,
  label: string,
  planKey: "PROFESSIONAL" | "STARTER",
): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: `Visitor RLS ${label}`,
      slug: `visitor-rls-${label.toLowerCase()}-${suffix}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgError, `organization insert failed: ${orgError?.message}`).toBeNull();
  const orgId = org!.id;

  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", {
    p_organization_id: orgId,
  });
  expect(cloneError, `role clone failed: ${cloneError?.message}`).toBeNull();

  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("key", planKey)
    .single();
  expect(planError, `plan lookup failed for ${planKey}: ${planError?.message}`).toBeNull();

  const { error: subscriptionError } = await admin.from("subscriptions").insert({
    organization_id: orgId,
    plan_id: plan!.id,
    status: "ACTIVE",
  });
  expect(subscriptionError, `subscription insert failed: ${subscriptionError?.message}`).toBeNull();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      organization_id: orgId,
      name: `Visitor Property ${label}`,
      code: `VP-${label}-${suffix}`,
      timezone: "Africa/Cairo",
      property_type: "building",
    })
    .select("id")
    .single();
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();
  const propertyId = property!.id;

  const [unitAResult, unitBResult, futureUnitResult] = await Promise.all([
    admin.from("units").insert({ organization_id: orgId, property_id: propertyId, code: `A-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: propertyId, code: `B-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: propertyId, code: `F-${suffix}` }).select("id").single(),
  ]);
  expect(unitAResult.error, `unit A insert failed: ${unitAResult.error?.message}`).toBeNull();
  expect(unitBResult.error, `unit B insert failed: ${unitBResult.error?.message}`).toBeNull();
  expect(futureUnitResult.error, `future unit insert failed: ${futureUnitResult.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-b`);

  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ownershipError = await admin.from("unit_ownerships").insert([
    { organization_id: orgId, unit_id: unitAResult.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: "2026-01-01" },
    { organization_id: orgId, unit_id: unitBResult.data!.id, member_id: memberB.memberId, share_percentage: 100, start_date: "2026-01-01" },
    { organization_id: orgId, unit_id: futureUnitResult.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: tomorrow },
  ]);
  expect(ownershipError.error, `ownership insert failed: ${ownershipError.error?.message}`).toBeNull();

  const staffManager = await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`);
  const staffViewer = await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`);

  return {
    orgId,
    propertyId,
    unitAId: unitAResult.data!.id,
    unitBId: unitBResult.data!.id,
    futureUnitId: futureUnitResult.data!.id,
    memberA,
    memberB,
    staffManager,
    staffViewer,
  };
}

async function createInvitation(
  client: Client,
  unitId: string,
  secret = `${SECRET_PREFIX}-${randomUUID()}`,
  overrides: Partial<{
    validFrom: string;
    validUntil: string;
    usagePolicy: "SINGLE_USE" | "MULTI_USE";
    guestName: string;
  }> = {},
) {
  const now = Date.now();
  return client.rpc("create_visitor_invitation", {
    p_unit_id: unitId,
    p_token_hash: tokenHash(secret),
    p_token_hint: secret.slice(-8),
    p_guest_name: overrides.guestName ?? `Guest ${randomUUID().slice(0, 6)}`,
    p_guest_phone: null,
    p_guest_note: null,
    p_valid_from: overrides.validFrom ?? new Date(now - 60_000).toISOString(),
    p_valid_until: overrides.validUntil ?? new Date(now + 60 * 60 * 1000).toISOString(),
    p_usage_policy: overrides.usagePolicy ?? "SINGLE_USE",
  });
}

describe("Visitor passes Runtime Supabase/PostgreSQL RLS gate", () => {
  let admin: Client;
  let local: LocalSupabaseEnv;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  let disabledOrg: OrgFixture;
  const cleanupOrgIds: string[] = [];

  beforeAll(async () => {
    local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgA = await createOrgFixture(admin, local, "A", "PROFESSIONAL");
    orgB = await createOrgFixture(admin, local, "B", "PROFESSIONAL");
    disabledOrg = await createOrgFixture(admin, local, "Disabled", "STARTER");
    cleanupOrgIds.push(orgA.orgId, orgB.orgId, disabledOrg.orgId);
  }, 120_000);

  afterAll(async () => {
    if (admin && cleanupOrgIds.length > 0) {
      await admin.from("organizations").delete().in("id", cleanupOrgIds);
    }
  });

  it("installs authenticated-only table and RPC privileges", () => {
    const privileges = runLocalDbQuery(`
      select
        has_table_privilege('anon', 'public.visitor_invitations', 'select'),
        has_table_privilege('authenticated', 'public.visitor_invitations', 'select'),
        has_table_privilege('authenticated', 'public.visitor_invitations', 'insert'),
        has_table_privilege('authenticated', 'public.visitor_invitation_secrets', 'select'),
        has_function_privilege('anon', 'public.create_visitor_invitation(uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text)', 'execute'),
        has_function_privilege('authenticated', 'public.create_visitor_invitation(uuid,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text)', 'execute'),
        has_function_privilege('authenticated', 'public.validate_visitor_pass_token(uuid,text)', 'execute')
    `);
    expect(privileges).toBe("f|t|f|f|f|t|t");
  });

  it("lets the current owner create and read only their own visitor pass", async () => {
    const created = await createInvitation(orgA.memberA.client, orgA.unitAId);
    expect(created.error, `owner create failed: ${created.error?.message}`).toBeNull();
    const invitationId = created.data!;

    const ownRead = await orgA.memberA.client
      .from("visitor_invitations")
      .select("id, guest_name, token_hint")
      .eq("id", invitationId)
      .single();
    expect(ownRead.error, `owner read failed: ${ownRead.error?.message}`).toBeNull();
    expect(ownRead.data!.id).toBe(invitationId);

    const secretRead = await orgA.memberA.client.from("visitor_invitation_secrets").select("token_hash");
    expectSecurityRejection(secretRead.error, "member cannot read visitor secret hashes");

    const memberBRead = await orgA.memberB.client
      .from("visitor_invitations")
      .select("id")
      .eq("id", invitationId);
    expect(memberBRead.error, `member B read failed: ${memberBRead.error?.message}`).toBeNull();
    expect(memberBRead.data).toEqual([]);

    const crossTenantRead = await orgB.memberA.client
      .from("visitor_invitations")
      .select("id")
      .eq("id", invitationId);
    expect(crossTenantRead.error, `cross tenant read failed: ${crossTenantRead.error?.message}`).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const directInsert = await orgA.memberA.client.from("visitor_invitations").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      unit_id: orgA.unitAId,
      invited_by_member_id: orgA.memberA.memberId,
      invitation_no: "VP-SPOOF",
      guest_name: "Spoof",
      valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + 60_000).toISOString(),
      created_by: orgA.memberA.userId,
    });
    expectSecurityRejection(directInsert.error, "authenticated direct insert is rejected");
  });

  it("rejects unauthorized, future-owned, and non-entitled creation", async () => {
    const otherUnit = await createInvitation(orgA.memberA.client, orgA.unitBId);
    expectSecurityRejection(otherUnit.error, "member cannot invite against another member unit");

    const futureUnit = await createInvitation(orgA.memberA.client, orgA.futureUnitId);
    expectSecurityRejection(futureUnit.error, "future ownership does not authorize visitor invite");

    const disabled = await createInvitation(disabledOrg.memberA.client, disabledOrg.unitAId);
    expectSecurityRejection(disabled.error, "starter entitlement rejects visitor invite");
  });

  it("validates opaque tokens server-side without leaking on UUID-only or wrong-token attempts", async () => {
    const validSecret = `valid-secret-${randomUUID()}`;
    const valid = await createInvitation(orgA.memberA.client, orgA.unitAId, validSecret);
    expect(valid.error, `valid invitation create failed: ${valid.error?.message}`).toBeNull();

    const ok = await orgA.memberA.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: valid.data!,
      p_raw_secret: validSecret,
    });
    expect(ok.error, `valid token check failed: ${ok.error?.message}`).toBeNull();
    expect(ok.data![0]).toMatchObject({ valid: true, reason_code: "VALID", invitation_id: valid.data });

    const wrong = await orgA.memberA.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: valid.data!,
      p_raw_secret: "wrong-secret",
    });
    expect(wrong.error, `wrong token check errored: ${wrong.error?.message}`).toBeNull();
    expect(wrong.data![0]).toMatchObject({ valid: false, reason_code: "NOT_FOUND_OR_INVALID", invitation_id: null });

    const unrelatedWithSecret = await orgA.memberB.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: valid.data!,
      p_raw_secret: validSecret,
    });
    expect(unrelatedWithSecret.error, `unrelated token check errored: ${unrelatedWithSecret.error?.message}`).toBeNull();
    expect(unrelatedWithSecret.data![0]).toMatchObject({ valid: false, reason_code: "NOT_FOUND_OR_INVALID", invitation_id: null });
  });

  it("returns explicit state reasons for future, expired, and revoked passes", async () => {
    const futureSecret = `future-secret-${randomUUID()}`;
    const future = await createInvitation(orgA.memberA.client, orgA.unitAId, futureSecret, {
      validFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(future.error, `future invitation create failed: ${future.error?.message}`).toBeNull();

    const futureValidation = await orgA.memberA.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: future.data!,
      p_raw_secret: futureSecret,
    });
    expect(futureValidation.data![0].reason_code).toBe("NOT_YET_VALID");

    const expiredSecret = `expired-secret-${randomUUID()}`;
    const expired = await createInvitation(orgA.memberA.client, orgA.unitAId, expiredSecret, {
      validFrom: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      validUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(expired.error, `expired setup create failed: ${expired.error?.message}`).toBeNull();
    await admin
      .from("visitor_invitations")
      .update({ valid_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", expired.data!);

    const expiredValidation = await orgA.memberA.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: expired.data!,
      p_raw_secret: expiredSecret,
    });
    expect(expiredValidation.data![0].reason_code).toBe("EXPIRED");

    const revokedSecret = `revoked-secret-${randomUUID()}`;
    const revoked = await createInvitation(orgA.memberA.client, orgA.unitAId, revokedSecret);
    expect(revoked.error, `revoked invitation create failed: ${revoked.error?.message}`).toBeNull();
    const revoke = await orgA.memberA.client.rpc("revoke_visitor_invitation", { p_invitation_id: revoked.data! });
    expect(revoke.error, `revoke failed: ${revoke.error?.message}`).toBeNull();

    const revokedValidation = await orgA.memberA.client.rpc("validate_visitor_pass_token", {
      p_invitation_id: revoked.data!,
      p_raw_secret: revokedSecret,
    });
    expect(revokedValidation.data![0].reason_code).toBe("REVOKED");
  });

  it("keeps staff organization-scoped and separates view from manage", async () => {
    const created = await createInvitation(orgA.memberA.client, orgA.unitAId, `staff-scope-secret-${randomUUID()}`);
    expect(created.error, `staff scope invitation create failed: ${created.error?.message}`).toBeNull();

    const managerRead = await orgA.staffManager.client.from("visitor_invitations").select("id").eq("id", created.data!);
    expect(managerRead.error, `manager read failed: ${managerRead.error?.message}`).toBeNull();
    expect(managerRead.data).toHaveLength(1);

    const orgBManagerRead = await orgB.staffManager.client.from("visitor_invitations").select("id").eq("id", created.data!);
    expect(orgBManagerRead.error, `cross-tenant staff read failed: ${orgBManagerRead.error?.message}`).toBeNull();
    expect(orgBManagerRead.data).toEqual([]);

    const viewerRevoke = await orgA.staffViewer.client.rpc("revoke_visitor_invitation", {
      p_invitation_id: created.data!,
    });
    expectSecurityRejection(viewerRevoke.error, "view-only staff cannot revoke");

    const managerRevoke = await orgA.staffManager.client.rpc("revoke_visitor_invitation", {
      p_invitation_id: created.data!,
    });
    expect(managerRevoke.error, `manager revoke failed: ${managerRevoke.error?.message}`).toBeNull();
  });

  it("does not create gate/access or accounting records", async () => {
    const before = await admin
      .from("platform_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA.orgId)
      .in("action", ["visitor_invitation.created", "visitor_invitation.revoked"]);
    const beforeAccessEvents = runLocalDbQuery(`
      select count(*)
      from public.access_events
      where organization_id = '${orgA.orgId}'
    `);

    const created = await createInvitation(orgA.memberA.client, orgA.unitAId, `audit-secret-${randomUUID()}`);
    expect(created.error, `audit invitation create failed: ${created.error?.message}`).toBeNull();

    const after = await admin
      .from("platform_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA.orgId)
      .in("action", ["visitor_invitation.created", "visitor_invitation.revoked"]);

    expect((after.count ?? 0) - (before.count ?? 0)).toBe(1);
    const afterAccessEvents = runLocalDbQuery(`
      select count(*)
      from public.access_events
      where organization_id = '${orgA.orgId}'
    `);
    expect(afterAccessEvents).toBe(beforeAccessEvents);

    const accountingCounts = runLocalDbQuery(`
      select
        (select count(*) from public.dues where organization_id = '${orgA.orgId}'),
        (select count(*) from public.expenses where organization_id = '${orgA.orgId}'),
        (select count(*) from public.payments where organization_id = '${orgA.orgId}'),
        (select count(*) from public.journal_entries where organization_id = '${orgA.orgId}')
    `);
    expect(accountingCounts).toBe("0|0|0|0");
  });
});
