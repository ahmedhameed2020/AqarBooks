import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;
type Actor = { userId: string; email: string; client: Client };
type OrgFixture = {
  orgId: string;
  propertyId: string;
  gateId: string;
  otherGateId: string;
  manager: Actor;
  guard: Actor;
  viewer: Actor;
};

const TEST_PASSWORD = "Gate_Device_Trust_Test_P@ssw0rd_2026!";

function readLocalSupabaseEnv() {
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
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(env.API_URL ?? "")) {
    throw new Error("Gate device trust tests must run against local Supabase.");
  }
  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Local Supabase credentials are unavailable.");
  return env as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function opaqueSecret() {
  return randomBytes(32).toString("base64url");
}

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(/permission denied|row-level security|not authorized|not_authorized|not_authenticated|not_found|forbidden|invalid|expired|redeemed|revoked/i);
}

async function createAuthUser(admin: Client, label: string) {
  const email = `gate-device-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
}

async function createStaffActor(
  admin: Client,
  apiUrl: string,
  anonKey: string,
  orgId: string,
  roleKey: "PROPERTY_MANAGER" | "VIEWER",
  label: string,
): Promise<Actor> {
  const actor = await createAuthUser(admin, label);
  const { error: membershipError } = await admin.from("organization_memberships").insert({
    organization_id: orgId,
    user_id: actor.userId,
    status: "active",
  });
  expect(membershipError, `membership create failed: ${membershipError?.message}`).toBeNull();

  const { data: role, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", orgId)
    .eq("key", roleKey)
    .single();
  expect(roleError, `role lookup failed: ${roleError?.message}`).toBeNull();
  const { error: assignmentError } = await admin.from("user_role_assignments").insert({
    organization_id: orgId,
    user_id: actor.userId,
    role_id: role!.id,
  });
  expect(assignmentError, `role assignment failed: ${assignmentError?.message}`).toBeNull();

  const client = createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email: actor.email, password: TEST_PASSWORD });
  expect(signInError, `sign-in failed: ${signInError?.message}`).toBeNull();
  return { ...actor, client };
}

async function createGuardActor(
  admin: Client,
  apiUrl: string,
  anonKey: string,
  orgId: string,
  label: string,
): Promise<Actor> {
  const actor = await createAuthUser(admin, label);
  const { error: membershipError } = await admin.from("organization_memberships").insert({
    organization_id: orgId,
    user_id: actor.userId,
    status: "active",
  });
  expect(membershipError, `guard membership create failed: ${membershipError?.message}`).toBeNull();

  const { data: role, error: roleError } = await admin
    .from("roles")
    .insert({
      organization_id: orgId,
      key: "GATE_GUARD",
      name_ar: "حارس البوابة",
      name_en: "Gate Guard",
      is_system: false,
    })
    .select("id")
    .single();
  expect(roleError, `guard role create failed: ${roleError?.message}`).toBeNull();
  const { data: permission, error: permissionError } = await admin
    .from("permissions")
    .select("id")
    .eq("key", "operations.gates.scan")
    .single();
  expect(permissionError, `scan permission lookup failed: ${permissionError?.message}`).toBeNull();
  const { error: rolePermissionError } = await admin.from("role_permissions").insert({
    role_id: role!.id,
    permission_id: permission!.id,
  });
  expect(rolePermissionError, `guard permission grant failed: ${rolePermissionError?.message}`).toBeNull();
  const { error: assignmentError } = await admin.from("user_role_assignments").insert({
    organization_id: orgId,
    user_id: actor.userId,
    role_id: role!.id,
  });
  expect(assignmentError, `guard role assignment failed: ${assignmentError?.message}`).toBeNull();

  const client = createClient<Database>(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email: actor.email, password: TEST_PASSWORD });
  expect(signInError, `guard sign-in failed: ${signInError?.message}`).toBeNull();
  return { ...actor, client };
}

async function createOrgFixture(
  admin: Client,
  apiUrl: string,
  anonKey: string,
  label: string,
): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: `Gate Device ${label}`,
      slug: `gate-device-${label.toLowerCase()}-${suffix}`,
      default_currency: "EGP",
      status: "ACTIVE",
    })
    .select("id")
    .single();
  expect(orgError, `organization create failed: ${orgError?.message}`).toBeNull();
  const orgId = org!.id;

  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  expect(cloneError, `role clone failed: ${cloneError?.message}`).toBeNull();
  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("key", "PROFESSIONAL").single();
  expect(planError, `plan lookup failed: ${planError?.message}`).toBeNull();
  const { error: subscriptionError } = await admin.from("subscriptions").insert({
    organization_id: orgId,
    plan_id: plan!.id,
    status: "ACTIVE",
  });
  expect(subscriptionError, `subscription create failed: ${subscriptionError?.message}`).toBeNull();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({
      organization_id: orgId,
      name: `Gate Device Property ${label}`,
      code: `GD-${label}-${suffix}`,
      timezone: "Africa/Cairo",
      property_type: "building",
    })
    .select("id")
    .single();
  expect(propertyError, `property create failed: ${propertyError?.message}`).toBeNull();

  const manager = await createStaffActor(admin, apiUrl, anonKey, orgId, "PROPERTY_MANAGER", `${label}-manager`);
  expect((await manager.client.rpc("set_gate_completion_policy", { p_organization_id: orgId, p_enabled: true })).error).toBeNull();
  const guard = await createGuardActor(admin, apiUrl, anonKey, orgId, `${label}-guard`);
  const viewer = await createStaffActor(admin, apiUrl, anonKey, orgId, "VIEWER", `${label}-viewer`);
  const createGate = (code: string) =>
    manager.client.rpc("create_gate", {
      p_property_id: property!.id,
      p_code: code,
      p_name_ar: "بوابة جهاز الاختبار",
      p_name_en: "Device Test Gate",
      p_direction_mode: "BOTH",
    });
  const [gate, otherGate] = await Promise.all([createGate(`GD-${suffix}`), createGate(`GD2-${suffix}`)]);
  expect(gate.error, `gate create failed: ${gate.error?.message}`).toBeNull();
  expect(otherGate.error, `second gate create failed: ${otherGate.error?.message}`).toBeNull();

  return {
    orgId,
    propertyId: property!.id,
    gateId: gate.data!,
    otherGateId: otherGate.data!,
    manager,
    guard,
    viewer,
  };
}

function createEnrollment(client: Client, gateId: string, direction: "ENTRY" | "EXIT" | "BOTH", code: string) {
  return client.rpc("create_gate_device_enrollment", {
    p_gate_id: gateId,
    p_direction: direction,
    p_code_hash: sha256(code),
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
}

function redeemEnrollment(client: Client, enrollmentId: string, code: string) {
  return client.rpc("redeem_gate_device_enrollment", {
    p_enrollment_id: enrollmentId,
    p_code: code,
    p_installation_id_hash: sha256(`installation-${randomUUID()}`),
    p_credential_hash: sha256(`credential-${randomUUID()}`),
    p_display_name: `Scanner ${randomUUID().slice(0, 6)}`,
  });
}

describe.sequential("gate device trust runtime Supabase/PostgreSQL RLS gate", () => {
  let admin: Client;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  const cleanupOrgIds: string[] = [];

  beforeAll(async () => {
    const local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    orgA = await createOrgFixture(admin, local.API_URL, local.ANON_KEY, "A");
    orgB = await createOrgFixture(admin, local.API_URL, local.ANON_KEY, "B");
    cleanupOrgIds.push(orgA.orgId, orgB.orgId);
  }, 120_000);

  afterAll(async () => {
    if (admin && cleanupOrgIds.length) await admin.from("organizations").delete().in("id", cleanupOrgIds);
  });

  it("allows only tenant managers to create enrollment codes", async () => {
    const managerCode = opaqueSecret();
    const managerEnrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "ENTRY", managerCode);
    expect(managerEnrollment.error, `manager enrollment failed: ${managerEnrollment.error?.message}`).toBeNull();

    const viewerEnrollment = await createEnrollment(orgA.viewer.client, orgA.gateId, "ENTRY", opaqueSecret());
    expectSecurityRejection(viewerEnrollment.error, "viewer must not create an enrollment");

    const crossTenantEnrollment = await createEnrollment(orgB.manager.client, orgA.gateId, "ENTRY", opaqueSecret());
    expectSecurityRejection(crossTenantEnrollment.error, "another tenant must not create an enrollment");
  });

  it("serializes concurrent redemption and denies replay", async () => {
    const code = opaqueSecret();
    const enrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "ENTRY", code);
    expect(enrollment.error, `enrollment create failed: ${enrollment.error?.message}`).toBeNull();

    const guardA = orgA.manager.client;
    const guardB = orgA.guard.client;
    const [first, second] = await Promise.all([
      redeemEnrollment(guardA, enrollment.data!, code),
      redeemEnrollment(guardB, enrollment.data!, code),
    ]);
    expect([first.error, second.error].filter(Boolean)).toHaveLength(1);
    expect([first.data, second.data].filter(Boolean)).toHaveLength(1);

    const device = (first.data ?? second.data)!;
    expect(device.credential_hash).toBeNull();
    expect(device.installation_id_hash).toBeNull();
    const replay = await redeemEnrollment(guardA, enrollment.data!, code);
    expectSecurityRejection(replay.error, "single-use enrollment must deny replay");
  });

  it("denies expired enrollment codes", async () => {
    const code = opaqueSecret();
    const enrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "ENTRY", code);
    expect(enrollment.error, `enrollment create failed: ${enrollment.error?.message}`).toBeNull();
    const { error: expireError } = await admin
      .from("gate_device_enrollments")
      .update({
        created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq("id", enrollment.data!);
    expect(expireError, `fixture expiry update failed: ${expireError?.message}`).toBeNull();

    const redemption = await redeemEnrollment(orgA.viewer.client, enrollment.data!, code);
    expectSecurityRejection(redemption.error, "expired enrollment must be denied");
  });

  it("enforces credential, gate, direction, tenant, and revocation binding", async () => {
    const code = opaqueSecret();
    const credentialHash = sha256(`credential-${randomUUID()}`);
    const enrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "ENTRY", code);
    expect(enrollment.error, `enrollment create failed: ${enrollment.error?.message}`).toBeNull();
    const redeemed = await orgA.viewer.client.rpc("redeem_gate_device_enrollment", {
      p_enrollment_id: enrollment.data!,
      p_code: code,
      p_installation_id_hash: sha256(`installation-${randomUUID()}`),
      p_credential_hash: credentialHash,
      p_display_name: "North Entry Scanner",
    });
    expect(redeemed.error, `redemption failed: ${redeemed.error?.message}`).toBeNull();
    const deviceId = redeemed.data!.id;

    const viewerDenied = await orgA.viewer.client.rpc("verify_gate_device_binding", {
      p_device_id: deviceId,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: "ENTRY",
    });
    expect(viewerDenied.error, `viewer binding check errored: ${viewerDenied.error?.message}`).toBeNull();
    expect(viewerDenied.data).toBe(false);

    const valid = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: deviceId,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: "ENTRY",
    });
    expect(valid.error, `valid binding check failed: ${valid.error?.message}`).toBeNull();
    expect(valid.data).toBe(true);

    for (const [client, gateId, direction, hash] of [
      [orgA.guard.client, orgA.gateId, "EXIT", credentialHash],
      [orgA.guard.client, orgA.otherGateId, "ENTRY", credentialHash],
      [orgA.guard.client, orgA.gateId, "ENTRY", sha256("wrong-credential")],
      [orgB.manager.client, orgA.gateId, "ENTRY", credentialHash],
    ] as const) {
      const denied = await client.rpc("verify_gate_device_binding", {
        p_device_id: deviceId,
        p_credential_hash: hash,
        p_gate_id: gateId,
        p_direction: direction,
      });
      expect(denied.error, `denied binding check errored: ${denied.error?.message}`).toBeNull();
      expect(denied.data).toBe(false);
    }

    const viewerRevoke = await orgA.viewer.client.rpc("revoke_gate_device", {
      p_device_id: deviceId,
      p_reason: "Viewer attempted revocation",
    });
    expectSecurityRejection(viewerRevoke.error, "viewer must not revoke a device");
    const managerRevoke = await orgA.manager.client.rpc("revoke_gate_device", {
      p_device_id: deviceId,
      p_reason: "Device retired from service",
    });
    expect(managerRevoke.error, `manager revoke failed: ${managerRevoke.error?.message}`).toBeNull();

    const revoked = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: deviceId,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: "ENTRY",
    });
    expect(revoked.error, `revoked binding check errored: ${revoked.error?.message}`).toBeNull();
    expect(revoked.data).toBe(false);
  });

  it("fails closed for null binding inputs sent through the raw RPC boundary", async () => {
    const code = opaqueSecret();
    const credentialHash = sha256(`credential-${randomUUID()}`);
    const enrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "BOTH", code);
    expect(enrollment.error, `enrollment create failed: ${enrollment.error?.message}`).toBeNull();
    const redeemed = await orgA.guard.client.rpc("redeem_gate_device_enrollment", {
      p_enrollment_id: enrollment.data!,
      p_code: code,
      p_installation_id_hash: sha256(`installation-${randomUUID()}`),
      p_credential_hash: credentialHash,
      p_display_name: "Null Boundary Scanner",
    });
    expect(redeemed.error, `redemption failed: ${redeemed.error?.message}`).toBeNull();

    const nullGate = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: redeemed.data!.id,
      p_credential_hash: credentialHash,
      p_gate_id: null as unknown as string,
      p_direction: "ENTRY",
    });
    expect(nullGate.error, `null-gate binding check errored: ${nullGate.error?.message}`).toBeNull();
    expect(nullGate.data).toBe(false);

    const nullDirection = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: redeemed.data!.id,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: null as unknown as "ENTRY",
    });
    expect(nullDirection.error, `null-direction binding check errored: ${nullDirection.error?.message}`).toBeNull();
    expect(nullDirection.data).toBe(false);
  });

  it("re-checks the canonical gate active state and direction mode", async () => {
    const code = opaqueSecret();
    const credentialHash = sha256(`credential-${randomUUID()}`);
    const enrollment = await createEnrollment(orgA.manager.client, orgA.gateId, "ENTRY", code);
    expect(enrollment.error, `enrollment create failed: ${enrollment.error?.message}`).toBeNull();
    const redeemed = await orgA.guard.client.rpc("redeem_gate_device_enrollment", {
      p_enrollment_id: enrollment.data!,
      p_code: code,
      p_installation_id_hash: sha256(`installation-${randomUUID()}`),
      p_credential_hash: credentialHash,
      p_display_name: "Gate Lifecycle Scanner",
    });
    expect(redeemed.error, `redemption failed: ${redeemed.error?.message}`).toBeNull();

    const { error: disableError } = await admin.from("gates").update({ is_active: false }).eq("id", orgA.gateId);
    expect(disableError, `gate disable failed: ${disableError?.message}`).toBeNull();
    const inactive = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: redeemed.data!.id,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: "ENTRY",
    });
    expect(inactive.error, `inactive-gate check errored: ${inactive.error?.message}`).toBeNull();
    expect(inactive.data).toBe(false);

    const { error: reconfigureError } = await admin
      .from("gates")
      .update({ is_active: true, direction_mode: "EXIT" })
      .eq("id", orgA.gateId);
    expect(reconfigureError, `gate reconfiguration failed: ${reconfigureError?.message}`).toBeNull();
    const incompatibleDirection = await orgA.guard.client.rpc("verify_gate_device_binding", {
      p_device_id: redeemed.data!.id,
      p_credential_hash: credentialHash,
      p_gate_id: orgA.gateId,
      p_direction: "ENTRY",
    });
    expect(incompatibleDirection.error, `direction-mode check errored: ${incompatibleDirection.error?.message}`).toBeNull();
    expect(incompatibleDirection.data).toBe(false);

    const { error: restoreError } = await admin
      .from("gates")
      .update({ direction_mode: "BOTH" })
      .eq("id", orgA.gateId);
    expect(restoreError, `gate fixture restore failed: ${restoreError?.message}`).toBeNull();
  });

  it("denies direct authenticated writes to both trust tables", async () => {
    const directEnrollment = await orgA.manager.client.from("gate_device_enrollments").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      gate_id: orgA.gateId,
      direction: "ENTRY",
      code_hash: sha256(opaqueSecret()),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_by: orgA.manager.userId,
    });
    expectSecurityRejection(directEnrollment.error, "authenticated enrollment table write must fail");

    const directDevice = await orgA.manager.client.from("gate_devices").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      gate_id: orgA.gateId,
      installation_id_hash: sha256(`installation-${randomUUID()}`),
      credential_hash: sha256(`credential-${randomUUID()}`),
      display_name: "Direct Device",
      allowed_direction: "ENTRY",
      enrolled_by: orgA.manager.userId,
    });
    expectSecurityRejection(directDevice.error, "authenticated device table write must fail");
  });
});
