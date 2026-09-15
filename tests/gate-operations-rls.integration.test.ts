import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Gate_Operations_RLS_Test_P@ssw0rd_2026!";

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
  otherPropertyId: string;
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
    throw new Error("Gate operations RLS gate must run against local Supabase.");
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

function tokenHash(secret: string) {
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
  const email = `gate-ops-${label}-${randomUUID()}@aqarbooks-test.local`;
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
      full_name: `Gate Member ${label}`,
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
      name: `Gate RLS ${label}`,
      slug: `gate-rls-${label.toLowerCase()}-${suffix}`,
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

  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("key", planKey).single();
  expect(planError, `plan lookup failed for ${planKey}: ${planError?.message}`).toBeNull();
  const { error: subscriptionError } = await admin.from("subscriptions").insert({
    organization_id: orgId,
    plan_id: plan!.id,
    status: "ACTIVE",
  });
  expect(subscriptionError, `subscription insert failed: ${subscriptionError?.message}`).toBeNull();

  const [{ data: property, error: propertyError }, { data: otherProperty, error: otherPropertyError }] =
    await Promise.all([
      admin
        .from("properties")
        .insert({
          organization_id: orgId,
          name: `Gate Property ${label}`,
          code: `G-${label}-${suffix}`,
          timezone: "Africa/Cairo",
          property_type: "building",
        })
        .select("id")
        .single(),
      admin
        .from("properties")
        .insert({
          organization_id: orgId,
          name: `Gate Other Property ${label}`,
          code: `GO-${label}-${suffix}`,
          timezone: "Africa/Cairo",
          property_type: "building",
        })
        .select("id")
        .single(),
    ]);
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();
  expect(otherPropertyError, `other property insert failed: ${otherPropertyError?.message}`).toBeNull();

  const [unitAResult, unitBResult, futureUnitResult] = await Promise.all([
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `A-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `B-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `F-${suffix}` }).select("id").single(),
  ]);
  expect(unitAResult.error, `unit A insert failed: ${unitAResult.error?.message}`).toBeNull();
  expect(unitBResult.error, `unit B insert failed: ${unitBResult.error?.message}`).toBeNull();
  expect(futureUnitResult.error, `future unit insert failed: ${futureUnitResult.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-b`);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { error: ownershipError } = await admin.from("unit_ownerships").insert([
    { organization_id: orgId, unit_id: unitAResult.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: unitBResult.data!.id, member_id: memberB.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: futureUnitResult.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: tomorrow },
  ]);
  expect(ownershipError, `ownership insert failed: ${ownershipError?.message}`).toBeNull();

  return {
    orgId,
    propertyId: property!.id,
    otherPropertyId: otherProperty!.id,
    unitAId: unitAResult.data!.id,
    unitBId: unitBResult.data!.id,
    futureUnitId: futureUnitResult.data!.id,
    memberA,
    memberB,
    staffManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`),
    staffViewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createInvitation(
  client: Client,
  unitId: string,
  secret: string,
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
    p_guest_name: overrides.guestName ?? `Gate Guest ${randomUUID().slice(0, 6)}`,
    p_guest_phone: null,
    p_guest_note: null,
    p_valid_from: overrides.validFrom ?? new Date(now - 60_000).toISOString(),
    p_valid_until: overrides.validUntil ?? new Date(now + 60 * 60 * 1000).toISOString(),
    p_usage_policy: overrides.usagePolicy ?? "SINGLE_USE",
  });
}

async function createGate(
  client: Client,
  propertyId: string,
  directionMode: "ENTRY" | "EXIT" | "BOTH" = "BOTH",
) {
  return client.rpc("create_gate", {
    p_property_id: propertyId,
    p_code: `G-${randomUUID().slice(0, 8)}`,
    p_name_ar: "بوابة الاختبار",
    p_name_en: "Test Gate",
    p_direction_mode: directionMode,
  });
}

function scan(client: Client, gateId: string, invitationId: string, secret: string, direction: "ENTRY" | "EXIT", clientScanId = randomUUID()) {
  return client.rpc("process_visitor_gate_scan", {
    p_gate_id: gateId,
    p_invitation_id: invitationId,
    p_raw_secret: secret,
    p_direction: direction,
    p_client_scan_id: clientScanId,
  });
}

describe.sequential("gate operations runtime Supabase/PostgreSQL RLS gate", () => {
  let local: LocalSupabaseEnv;
  let admin: Client;
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

  it("installs authenticated-only gate tables, RLS, and intended RPC privileges", () => {
    const privileges = runLocalDbQuery(`
      select
        has_table_privilege('anon', 'public.gates', 'select'),
        has_table_privilege('authenticated', 'public.gates', 'select'),
        has_table_privilege('authenticated', 'public.gates', 'insert'),
        has_table_privilege('authenticated', 'public.access_events', 'select'),
        has_table_privilege('authenticated', 'public.access_events', 'insert'),
        has_table_privilege('authenticated', 'public.access_events', 'update'),
        has_table_privilege('authenticated', 'public.visitor_access_state', 'select'),
        has_table_privilege('authenticated', 'public.visitor_access_state', 'insert'),
        has_function_privilege('anon', 'public.process_visitor_gate_scan(uuid,uuid,text,text,uuid)', 'execute'),
        has_function_privilege('authenticated', 'public.process_visitor_gate_scan(uuid,uuid,text,text,uuid)', 'execute'),
        has_function_privilege('authenticated', 'public.create_gate(uuid,text,text,text,text)', 'execute')
    `);
    expect(privileges).toBe("f|t|f|t|f|f|t|f|f|t|t");
  });

  it("lets staff managers create gates while view-only staff cannot mutate them", async () => {
    const gate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(gate.error, `manager gate create failed: ${gate.error?.message}`).toBeNull();

    const viewerGate = await createGate(orgA.staffViewer.client, orgA.propertyId);
    expectSecurityRejection(viewerGate.error, "view-only staff cannot create gates");

    const crossTenantRead = await orgB.staffManager.client.from("gates").select("id").eq("id", gate.data!);
    expect(crossTenantRead.error, `cross-tenant gate read errored: ${crossTenantRead.error?.message}`).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const directInsert = await orgA.staffManager.client.from("gates").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      code: "DIRECT",
      name_ar: "مباشر",
      name_en: "Direct",
      created_by: orgA.staffManager.userId,
    });
    expectSecurityRejection(directInsert.error, "direct gate table insert rejected");
  });

  it("processes valid entry/exit, idempotent retry, and single-use replay denial", async () => {
    const gate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(gate.error, `gate create failed: ${gate.error?.message}`).toBeNull();
    const secret = `single-${randomUUID()}`;
    const invitation = await createInvitation(orgA.memberA.client, orgA.unitAId, secret, { usagePolicy: "SINGLE_USE" });
    expect(invitation.error, `invitation create failed: ${invitation.error?.message}`).toBeNull();
    const clientScanId = randomUUID();

    const entry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY", clientScanId);
    expect(entry.error, `entry scan failed: ${entry.error?.message}`).toBeNull();
    expect(entry.data![0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_ENTRY", invitation_id: invitation.data });

    const retry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY", clientScanId);
    expect(retry.error, `idempotent retry failed: ${retry.error?.message}`).toBeNull();
    expect(retry.data![0].event_id).toBe(entry.data![0].event_id);
    expect(retry.data![0].reason_code).toBe("VALID_ENTRY");

    const replay = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expect(replay.error, `single-use replay errored: ${replay.error?.message}`).toBeNull();
    expect(replay.data![0]).toMatchObject({ decision: "DENY", reason_code: "PASS_ALREADY_USED" });

    const exit = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "EXIT");
    expect(exit.error, `exit scan failed: ${exit.error?.message}`).toBeNull();
    expect(exit.data![0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_EXIT", is_inside: false });
  });

  it("allows multi-use cycles but rejects already-inside and not-inside transitions", async () => {
    const gate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(gate.error, `gate create failed: ${gate.error?.message}`).toBeNull();
    const secret = `multi-${randomUUID()}`;
    const invitation = await createInvitation(orgA.memberA.client, orgA.unitAId, secret, { usagePolicy: "MULTI_USE" });
    expect(invitation.error, `multi invitation create failed: ${invitation.error?.message}`).toBeNull();

    const entry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expect(entry.data![0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_ENTRY" });

    const duplicateEntry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expect(duplicateEntry.data![0]).toMatchObject({ decision: "DENY", reason_code: "ALREADY_INSIDE" });

    const exit = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "EXIT");
    expect(exit.data![0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_EXIT" });

    const duplicateExit = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "EXIT");
    expect(duplicateExit.data![0]).toMatchObject({ decision: "DENY", reason_code: "NOT_INSIDE" });

    const reentry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expect(reentry.data![0]).toMatchObject({ decision: "ALLOW", reason_code: "VALID_ENTRY" });
  });

  it("keeps single-use consumption race-safe under concurrent scans", async () => {
    const gate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(gate.error, `gate create failed: ${gate.error?.message}`).toBeNull();
    const secret = `race-${randomUUID()}`;
    const invitation = await createInvitation(orgA.memberA.client, orgA.unitAId, secret, { usagePolicy: "SINGLE_USE" });
    expect(invitation.error, `race invitation create failed: ${invitation.error?.message}`).toBeNull();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY")),
    );
    for (const result of results) {
      expect(result.error, `concurrent scan errored: ${result.error?.message}`).toBeNull();
    }

    const allowed = results.filter((result) => result.data![0].decision === "ALLOW");
    const denied = results.filter((result) => result.data![0].decision === "DENY");
    expect(allowed).toHaveLength(1);
    expect(allowed[0].data![0].reason_code).toBe("VALID_ENTRY");
    expect(denied.map((result) => result.data![0].reason_code)).toEqual(
      Array.from({ length: 7 }, () => "PASS_ALREADY_USED"),
    );
  });

  it("denies invalid, revoked, future, expired, wrong-property, inactive-gate, and wrong-direction scans", async () => {
    const bothGate = await createGate(orgA.staffManager.client, orgA.propertyId);
    const otherPropertyGate = await createGate(orgA.staffManager.client, orgA.otherPropertyId);
    const exitOnlyGate = await createGate(orgA.staffManager.client, orgA.propertyId, "EXIT");
    expect(bothGate.error).toBeNull();
    expect(otherPropertyGate.error).toBeNull();
    expect(exitOnlyGate.error).toBeNull();

    const validSecret = `valid-${randomUUID()}`;
    const validInvitation = await createInvitation(orgA.memberA.client, orgA.unitAId, validSecret);
    expect(validInvitation.error).toBeNull();

    const invalid = await scan(orgA.staffManager.client, bothGate.data!, validInvitation.data!, "wrong-secret", "ENTRY");
    expect(invalid.data![0]).toMatchObject({ decision: "DENY", reason_code: "INVALID_PASS", invitation_id: null });

    const wrongProperty = await scan(orgA.staffManager.client, otherPropertyGate.data!, validInvitation.data!, validSecret, "ENTRY");
    expect(wrongProperty.data![0]).toMatchObject({ decision: "DENY", reason_code: "PROPERTY_MISMATCH" });

    const wrongDirection = await scan(orgA.staffManager.client, exitOnlyGate.data!, validInvitation.data!, validSecret, "ENTRY");
    expect(wrongDirection.data![0]).toMatchObject({ decision: "DENY", reason_code: "DIRECTION_NOT_ALLOWED" });

    const inactiveGate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(inactiveGate.error).toBeNull();
    const deactivate = await orgA.staffManager.client.rpc("update_gate", {
      p_gate_id: inactiveGate.data!,
      p_code: `IN-${randomUUID().slice(0, 8)}`,
      p_name_ar: "بوابة متوقفة",
      p_name_en: "Inactive Gate",
      p_direction_mode: "BOTH",
      p_is_active: false,
    });
    expect(deactivate.error, `deactivate failed: ${deactivate.error?.message}`).toBeNull();
    const inactive = await scan(orgA.staffManager.client, inactiveGate.data!, validInvitation.data!, validSecret, "ENTRY");
    expect(inactive.data![0]).toMatchObject({ decision: "DENY", reason_code: "GATE_INACTIVE" });

    const futureSecret = `future-${randomUUID()}`;
    const future = await createInvitation(orgA.memberA.client, orgA.unitAId, futureSecret, {
      validFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    expect(future.error).toBeNull();
    const futureScan = await scan(orgA.staffManager.client, bothGate.data!, future.data!, futureSecret, "ENTRY");
    expect(futureScan.data![0]).toMatchObject({ decision: "DENY", reason_code: "NOT_YET_VALID" });

    const expiredSecret = `expired-${randomUUID()}`;
    const expired = await createInvitation(orgA.memberA.client, orgA.unitAId, expiredSecret);
    expect(expired.error).toBeNull();
    await admin.from("visitor_invitations").update({ valid_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.data!);
    const expiredScan = await scan(orgA.staffManager.client, bothGate.data!, expired.data!, expiredSecret, "ENTRY");
    expect(expiredScan.data![0]).toMatchObject({ decision: "DENY", reason_code: "EXPIRED" });

    const revokedSecret = `revoked-${randomUUID()}`;
    const revoked = await createInvitation(orgA.memberA.client, orgA.unitAId, revokedSecret);
    expect(revoked.error).toBeNull();
    await orgA.memberA.client.rpc("revoke_visitor_invitation", { p_invitation_id: revoked.data! });
    const revokedScan = await scan(orgA.staffManager.client, bothGate.data!, revoked.data!, revokedSecret, "ENTRY");
    expect(revokedScan.data![0]).toMatchObject({ decision: "DENY", reason_code: "REVOKED" });
  });

  it("enforces scan authorization, event immutability, visibility, and zero accounting impact", async () => {
    const gate = await createGate(orgA.staffManager.client, orgA.propertyId);
    expect(gate.error).toBeNull();
    const secret = `scope-${randomUUID()}`;
    const invitation = await createInvitation(orgA.memberA.client, orgA.unitAId, secret);
    expect(invitation.error).toBeNull();

    const viewerScan = await scan(orgA.staffViewer.client, gate.data!, invitation.data!, secret, "ENTRY");
    expectSecurityRejection(viewerScan.error, "view-only staff cannot scan");

    const crossTenantScan = await scan(orgB.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expectSecurityRejection(crossTenantScan.error, "cross-tenant staff cannot scan another tenant gate");

    const entry = await scan(orgA.staffManager.client, gate.data!, invitation.data!, secret, "ENTRY");
    expect(entry.error).toBeNull();
    const eventId = entry.data![0].event_id;

    const memberEventRead = await orgA.memberA.client.from("access_events").select("id").eq("id", eventId);
    expect(memberEventRead.error, `member event read errored: ${memberEventRead.error?.message}`).toBeNull();
    expect(memberEventRead.data).toEqual([]);

    const staffEventRead = await orgA.staffManager.client.from("access_events").select("id, guest_name").eq("id", eventId);
    expect(staffEventRead.error, `staff event read failed: ${staffEventRead.error?.message}`).toBeNull();
    expect(staffEventRead.data).toHaveLength(1);

    const crossTenantRead = await orgB.staffManager.client.from("access_events").select("id").eq("id", eventId);
    expect(crossTenantRead.error, `cross-tenant event read errored: ${crossTenantRead.error?.message}`).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const directInsert = await orgA.staffManager.client.from("access_events").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      gate_id: gate.data!,
      direction: "ENTRY",
      decision: "ALLOW",
      reason_code: "VALID_ENTRY",
      client_scan_id: randomUUID(),
      operator_user_id: orgA.staffManager.userId,
    });
    expectSecurityRejection(directInsert.error, "direct access event insert rejected");

    const directUpdate = await orgA.staffManager.client.from("access_events").update({ reason_code: "INVALID_PASS" }).eq("id", eventId);
    expectSecurityRejection(directUpdate.error, "access events are immutable");

    const disabledGate = await admin
      .from("gates")
      .insert({
        organization_id: disabledOrg.orgId,
        property_id: disabledOrg.propertyId,
        code: `DG-${randomUUID().slice(0, 8)}`,
        name_ar: "بوابة غير مفعلة",
        name_en: "Disabled Gate",
        created_by: disabledOrg.staffManager.userId,
      })
      .select("id")
      .single();
    expect(disabledGate.error).toBeNull();
    const disabledSecret = `disabled-${randomUUID()}`;
    const disabledInvitation = await admin
      .from("visitor_invitations")
      .insert({
        organization_id: disabledOrg.orgId,
        property_id: disabledOrg.propertyId,
        unit_id: disabledOrg.unitAId,
        invited_by_member_id: disabledOrg.memberA.memberId,
        invitation_no: `VP-${randomUUID().slice(0, 8)}`,
        guest_name: "Disabled Guest",
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        valid_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        usage_policy: "SINGLE_USE",
        status: "ACTIVE",
        created_by: disabledOrg.memberA.userId,
        updated_by: disabledOrg.memberA.userId,
      })
      .select("id")
      .single();
    expect(disabledInvitation.error).toBeNull();
    await admin.from("visitor_invitation_secrets").insert({
      invitation_id: disabledInvitation.data!.id,
      organization_id: disabledOrg.orgId,
      token_hash: tokenHash(disabledSecret),
    });
    const disabledScan = await scan(disabledOrg.staffManager.client, disabledGate.data!.id, disabledInvitation.data!.id, disabledSecret, "ENTRY");
    expect(disabledScan.data![0]).toMatchObject({ decision: "DENY", reason_code: "FEATURE_DISABLED" });

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
