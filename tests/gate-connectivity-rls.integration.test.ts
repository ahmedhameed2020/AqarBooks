import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient;

const TEST_PASSWORD = "Gate_Connectivity_Test_P@ssw0rd_2026!";

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
    throw new Error("Gate connectivity tests must run against local Supabase.");
  }
  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("Local Supabase credentials are unavailable.");
  return env as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createSignedInUser(
  admin: Client,
  apiUrl: string,
  anonKey: string,
  label: string,
) {
  const email = `gate-connectivity-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed: ${error?.message}`).toBeNull();
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(signIn.error, `sign-in failed: ${signIn.error?.message}`).toBeNull();
  return { id: data.user!.id, client };
}

function recordIncident(
  client: Client,
  input: {
    deviceId: string;
    credential: string;
    gateId: string;
    clientScanId: string;
    fingerprint?: string;
  },
) {
  return client.rpc("record_gate_connectivity_incident", {
    p_device_id: input.deviceId,
    p_device_credential: input.credential,
    p_gate_id: input.gateId,
    p_direction: "ENTRY",
    p_client_scan_id: input.clientScanId,
    p_occurred_at: new Date().toISOString(),
    p_payload_fingerprint: input.fingerprint ?? sha256("opaque-qr-payload"),
    p_error_code: "NETWORK_ERROR",
  });
}

describe.sequential("gate connectivity incident runtime RLS gate", () => {
  let admin: Client;
  let guard: Awaited<ReturnType<typeof createSignedInUser>>;
  let viewer: Awaited<ReturnType<typeof createSignedInUser>>;
  let orgId: string;
  let gateId: string;
  let otherGateId: string;
  let deviceId: string;
  const credential = `credential-${randomUUID()}`;

  beforeAll(async () => {
    const local = readLocalSupabaseEnv();
    admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    guard = await createSignedInUser(admin, local.API_URL, local.ANON_KEY, "guard");
    viewer = await createSignedInUser(admin, local.API_URL, local.ANON_KEY, "viewer");

    const suffix = randomUUID().slice(0, 8);
    const organization = await admin.from("organizations").insert({
      name: "Gate Connectivity Runtime",
      slug: `gate-connectivity-${suffix}`,
      default_currency: "EGP",
      status: "ACTIVE",
    }).select("id").single();
    expect(organization.error, `organization create failed: ${organization.error?.message}`).toBeNull();
    orgId = organization.data!.id;

    const clone = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
    expect(clone.error, `role clone failed: ${clone.error?.message}`).toBeNull();
    const plan = await admin.from("plans").select("id").eq("key", "PROFESSIONAL").single();
    expect(plan.error, `plan lookup failed: ${plan.error?.message}`).toBeNull();
    const subscription = await admin.from("subscriptions").insert({
      organization_id: orgId,
      plan_id: plan.data!.id,
      status: "ACTIVE",
    });
    expect(subscription.error, `subscription create failed: ${subscription.error?.message}`).toBeNull();

    const property = await admin.from("properties").insert({
      organization_id: orgId,
      name: "Connectivity Property",
      code: `GC-${suffix}`,
      timezone: "Asia/Qatar",
      property_type: "building",
    }).select("id").single();
    expect(property.error, `property create failed: ${property.error?.message}`).toBeNull();

    const memberships = await admin.from("organization_memberships").insert([
      { organization_id: orgId, user_id: guard.id, status: "active" },
      { organization_id: orgId, user_id: viewer.id, status: "active" },
    ]);
    expect(memberships.error, `membership create failed: ${memberships.error?.message}`).toBeNull();
    const role = await admin.from("roles").insert({
      organization_id: orgId,
      key: "CONNECTIVITY_GUARD",
      name_ar: "حارس الاتصال",
      name_en: "Connectivity Guard",
      is_system: false,
    }).select("id").single();
    const permission = await admin.from("permissions").select("id").eq("key", "operations.gates.scan").single();
    expect(role.error, `guard role create failed: ${role.error?.message}`).toBeNull();
    expect(permission.error, `scan permission lookup failed: ${permission.error?.message}`).toBeNull();
    const grants = await Promise.all([
      admin.from("role_permissions").insert({ role_id: role.data!.id, permission_id: permission.data!.id }),
      admin.from("user_role_assignments").insert({
        organization_id: orgId,
        user_id: guard.id,
        role_id: role.data!.id,
      }),
    ]);
    expect(grants[0].error, `role permission failed: ${grants[0].error?.message}`).toBeNull();
    expect(grants[1].error, `role assignment failed: ${grants[1].error?.message}`).toBeNull();

    const gates = await admin.from("gates").insert([
      {
        organization_id: orgId,
        property_id: property.data!.id,
        code: `GC1-${suffix}`,
        name_ar: "البوابة الأولى",
        name_en: "Gate One",
        direction_mode: "BOTH",
        created_by: guard.id,
      },
      {
        organization_id: orgId,
        property_id: property.data!.id,
        code: `GC2-${suffix}`,
        name_ar: "البوابة الثانية",
        name_en: "Gate Two",
        direction_mode: "BOTH",
        created_by: guard.id,
      },
    ]).select("id, code");
    expect(gates.error, `gate fixture failed: ${gates.error?.message}`).toBeNull();
    gateId = gates.data!.find((gate) => gate.code.startsWith("GC1-"))!.id;
    otherGateId = gates.data!.find((gate) => gate.code.startsWith("GC2-"))!.id;

    execFileSync("docker", ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
      `insert into public.gate_completion_policy(organization_id,enabled,updated_by) values('${orgId}',true,'${guard.id}')`], { stdio: "pipe" });
    const device = await admin.from("gate_devices").insert({
      organization_id: orgId,
      property_id: property.data!.id,
      gate_id: gateId,
      installation_id_hash: sha256(`installation-${randomUUID()}`),
      credential_hash: sha256(credential),
      display_name: "Connectivity Scanner",
      allowed_direction: "ENTRY",
      enrolled_by: guard.id,
    }).select("id").single();
    expect(device.error, `device fixture failed: ${device.error?.message}`).toBeNull();
    deviceId = device.data!.id;
  }, 120_000);

  afterAll(async () => {
    if (admin && orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("records only a safe idempotent incident for a bound scanner with scan permission", async () => {
    const clientScanId = randomUUID();
    const first = await recordIncident(guard.client, { deviceId, credential, gateId, clientScanId });
    const duplicate = await recordIncident(guard.client, { deviceId, credential, gateId, clientScanId });
    expect(first.error, `incident record failed: ${first.error?.message}`).toBeNull();
    expect(duplicate.error, `duplicate incident failed: ${duplicate.error?.message}`).toBeNull();

    const rows = await admin.from("gate_connectivity_incidents").select("*").eq("client_scan_id", clientScanId);
    expect(rows.error, `incident lookup failed: ${rows.error?.message}`).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(Object.keys(rows.data![0]).sort()).toEqual([
      "client_scan_id",
      "device_id",
      "direction",
      "error_code",
      "gate_id",
      "occurred_at",
      "organization_id",
      "payload_fingerprint",
    ]);
    expect(JSON.stringify(rows.data![0])).not.toContain("opaque-qr-payload");
  });

  it("rejects users without scan permission and mismatched device bindings", async () => {
    const viewerAttempt = await recordIncident(viewer.client, {
      deviceId,
      credential,
      gateId,
      clientScanId: randomUUID(),
    });
    expect(viewerAttempt.error?.message).toMatch(/not authorized|not_authorized|permission denied/i);

    for (const attempt of [
      { deviceId, credential: "wrong-credential", gateId },
      { deviceId, credential, gateId: otherGateId },
    ]) {
      const result = await recordIncident(guard.client, { ...attempt, clientScanId: randomUUID() });
      expect(result.error?.message).toMatch(/not authorized|not_authorized|permission denied/i);
    }
  });

  it("denies authenticated clients direct table access", async () => {
    const directRead = await guard.client.from("gate_connectivity_incidents").select("*");
    expect(directRead.error).not.toBeNull();
  });

  it("contains no invitation lookup or raw payload persistence path", () => {
    const migrationName = readdirSync(join(process.cwd(), "supabase", "migrations"))
      .find((name) => name.endsWith("_gate_connectivity_incidents.sql"));
    expect(migrationName).toBeTruthy();
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", migrationName!), "utf8");

    expect(sql).not.toMatch(/visitor_invitations|access_events|raw_payload|qr_payload/i);
  });
});
