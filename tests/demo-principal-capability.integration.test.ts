// @ts-nocheck
/**
 * Demo principal effective-capability sweep.
 *
 * WHY THIS EXISTS
 * The public live demo is served by ONE shared authenticated principal. Any
 * persistent write it can perform is performed on behalf of every visitor and
 * survives for every subsequent visitor. The target is therefore absolute:
 * ZERO persistent application-state mutation for the demo principal.
 *
 * Three defects motivated this suite. Each was reachable by the demo principal
 * with nothing but its own session and a direct PostgREST call:
 *
 *   D1  property_import_logs INSERT gated on mere organization membership
 *   D2  alert_dismissals FOR ALL -- insert/update/delete, all persistent
 *   D3  profiles insert/update gated only on `id = auth.uid()`
 *
 * plus, at the provisioning layer:
 *
 *   D4  create_organization_onboarding EXECUTE granted to `authenticated`,
 *       so any signed-in user could self-provision an ACTIVE tenant over
 *       PostgREST with no UI involved.
 *
 * WHY THE PROBES GO DIRECTLY TO POSTGREST
 * Testing through the UI would prove only that the buttons are hidden. The
 * security boundary is the database, so these probes bypass the application
 * entirely and speak to PostgREST as the demo principal -- which is exactly
 * what a hostile visitor holding the session would do.
 *
 * ANTI-VACUITY, TWO WAYS
 * 1. A PostgREST UPDATE or DELETE that RLS filters out returns 200 with an
 *    empty array, NOT an error. An assertion that "no error was thrown" would
 *    therefore pass against a completely open policy. Every negative write
 *    probe here re-reads the row through the service-role client afterwards and
 *    asserts the stored value is unchanged.
 * 2. A policy that denies everyone would pass every negative probe. Each
 *    defect therefore carries a POSITIVE CONTROL: the same operation, against
 *    an ephemeral NON-demo tenant, by a principal that legitimately holds the
 *    required permission, asserted to SUCCEED.
 *
 * Missing demo credentials FAIL this suite. They never skip it.
 *
 * EXPECTED TO FAIL UNTIL THE MIGRATION IS APPLIED. See
 * docs/superpowers/specs/2026-08-25-release-a-demo-security-hardening.md.
 * Pre-migration failure is the proof these probes detect the real defects.
 *
 * This suite never touches the frozen demo financial dataset. It writes only to
 * its own ephemeral fixture tenant, which it removes in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;

/** RLS / privilege refusal. */
const INSUFFICIENT_PRIVILEGE = "42501";

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Signed-in demo principal, speaking PostgREST through the anon key. */
let demo;
let demoUserId: string;
let demoOrgId: string;

/** Ephemeral non-demo tenant + a principal holding property.units.manage. */
const fixture = {
  orgId: null as string | null,
  userId: null as string | null,
  roleId: null as string | null,
  email: `demo-probe-${randomUUID()}@aqarbooks-test.invalid`,
  password: `Probe-${randomUUID()}`,
  client: null as ReturnType<typeof createClient> | null,
};

beforeAll(async () => {
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
    DEMO_USER_EMAIL: DEMO_EMAIL,
    DEMO_USER_PASSWORD: DEMO_PASSWORD,
  })) {
    if (!value) {
      throw new Error(
        `${name} is not set. This suite must fail loudly rather than skip: an ` +
          `unrun demo capability sweep is indistinguishable from a passing one.`,
      );
    }
  }

  // Resolve the demo tenant by its semantic marker. Never by email or UUID.
  const { data: demoOrgs, error: demoOrgError } = await admin
    .from("organizations")
    .select("id, name")
    .eq("is_demo", true);
  if (demoOrgError) throw demoOrgError;
  expect(
    demoOrgs?.length,
    "exactly one organization must carry is_demo = true",
  ).toBe(1);
  demoOrgId = demoOrgs[0].id;

  // Sign the demo principal in exactly as the demo route will.
  demo = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: signInError } = await demo.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signInError) throw signInError;
  demoUserId = session.user.id;

  // The probes are meaningless unless this principal really is the demo tenant's.
  const { data: membership, error: membershipError } = await admin
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", demoUserId)
    .eq("organization_id", demoOrgId)
    .maybeSingle();
  if (membershipError) throw membershipError;
  expect(
    membership,
    "the configured demo credentials must belong to the is_demo tenant",
  ).toBeTruthy();

  // ---- positive-control fixture: a normal, non-demo tenant -----------------
  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: fixture.email,
    password: fixture.password,
    email_confirm: true,
  });
  if (createUserError) throw createUserError;
  fixture.userId = created.user.id;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: "Capability Probe Fixture",
      slug: `capability-probe-${randomUUID().slice(0, 8)}`,
      status: "ACTIVE",
      is_demo: false,
    })
    .select("id")
    .single();
  if (orgError) throw orgError;
  fixture.orgId = org.id;

  const { data: role, error: roleError } = await admin
    .from("roles")
    .insert({
      organization_id: fixture.orgId,
      key: "PROBE_MANAGER",
      name_ar: "مدير الاختبار",
      name_en: "Probe Manager",
      is_system: false,
    })
    .select("id")
    .single();
  if (roleError) throw roleError;
  fixture.roleId = role.id;

  const { data: perm, error: permError } = await admin
    .from("permissions")
    .select("id")
    .eq("key", "property.units.manage")
    .single();
  if (permError) throw permError;

  const { error: rpError } = await admin
    .from("role_permissions")
    .insert({ role_id: fixture.roleId, permission_id: perm.id });
  if (rpError) throw rpError;

  const { error: memError } = await admin
    .from("organization_memberships")
    .insert({ organization_id: fixture.orgId, user_id: fixture.userId, status: "active" });
  if (memError) throw memError;

  const { error: uraError } = await admin
    .from("user_role_assignments")
    .insert({
      user_id: fixture.userId,
      role_id: fixture.roleId,
      organization_id: fixture.orgId,
    });
  if (uraError) throw uraError;

  fixture.client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: fixtureSignInError } = await fixture.client.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });
  if (fixtureSignInError) throw fixtureSignInError;
});

afterAll(async () => {
  if (fixture.orgId) {
    await admin.from("alert_dismissals").delete().eq("organization_id", fixture.orgId);
    await admin.from("property_import_logs").delete().eq("organization_id", fixture.orgId);
    await admin.from("user_role_assignments").delete().eq("organization_id", fixture.orgId);
    await admin.from("organization_memberships").delete().eq("organization_id", fixture.orgId);
    await admin.from("role_permissions").delete().eq("role_id", fixture.roleId);
    await admin.from("roles").delete().eq("organization_id", fixture.orgId);
    // platform_audit_logs has no ON DELETE CASCADE on organization_id.
    await admin.from("platform_audit_logs").delete().eq("organization_id", fixture.orgId);
    await admin.from("organizations").delete().eq("id", fixture.orgId);
  }
  if (fixture.userId) await admin.auth.admin.deleteUser(fixture.userId);
});

describe("demo principal has zero persistent mutation capability", () => {
  it("D1: cannot insert property_import_logs into the demo tenant", async () => {
    const { error } = await demo.from("property_import_logs").insert({
      organization_id: demoOrgId,
      import_kind: "UNITS",
      imported_rows: 1,
      skipped_rows: 0,
      allow_partial: false,
    });

    expect(error).toBeTruthy();
    expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

    const { count } = await admin
      .from("property_import_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", demoOrgId)
      .eq("import_kind", "UNITS");
    expect(count ?? 0).toBe(0);
  });

  it("D2: cannot insert an alert dismissal into the demo tenant", async () => {
    const alertKey = `probe-${randomUUID()}`;
    const { error } = await demo.from("alert_dismissals").insert({
      organization_id: demoOrgId,
      user_id: demoUserId,
      alert_key: alertKey,
    });

    expect(error).toBeTruthy();
    expect(error.code).toBe(INSUFFICIENT_PRIVILEGE);

    const { count } = await admin
      .from("alert_dismissals")
      .select("id", { count: "exact", head: true })
      .eq("alert_key", alertKey);
    expect(count ?? 0).toBe(0);
  });

  it("D2: cannot delete an existing demo alert dismissal", async () => {
    // Seed through service role so there is something real to attempt to remove.
    const alertKey = `probe-delete-${randomUUID()}`;
    const { error: seedError } = await admin.from("alert_dismissals").insert({
      organization_id: demoOrgId,
      user_id: demoUserId,
      alert_key: alertKey,
    });
    if (seedError) throw seedError;

    try {
      // A DELETE filtered out by RLS returns 200 + [], so the row check below,
      // not the absence of an error, is what actually proves the denial.
      await demo.from("alert_dismissals").delete().eq("alert_key", alertKey);

      const { count } = await admin
        .from("alert_dismissals")
        .select("id", { count: "exact", head: true })
        .eq("alert_key", alertKey);
      expect(count, "the dismissal must survive the demo principal's DELETE").toBe(1);
    } finally {
      await admin.from("alert_dismissals").delete().eq("alert_key", alertKey);
    }
  });

  it("D3: cannot mutate its own profile", async () => {
    const { data: before } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", demoUserId)
      .single();

    await demo
      .from("profiles")
      .update({ full_name: `tampered-${randomUUID()}` })
      .eq("id", demoUserId);

    const { data: after } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", demoUserId)
      .single();

    expect(after.full_name).toBe(before.full_name);
  });

  it("D4: cannot self-provision an organization over PostgREST", async () => {
    const { error } = await demo.rpc("create_organization_onboarding", {
      p_org_name: "Unauthorized Tenant",
      p_entity_type: "DEVELOPER",
      p_entity_type_custom_label: null,
      p_resort_name: "Unauthorized Project",
      p_resort_code: "RES-01",
      p_timezone: "Africa/Cairo",
      p_default_currency: "EGP",
    });

    expect(error, "create_organization_onboarding must not be callable").toBeTruthy();

    const { count } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("name", "Unauthorized Tenant");
    expect(count ?? 0).toBe(0);
  });

  it("cannot upload into member-documents storage", async () => {
    const { error } = await demo.storage
      .from("member-documents")
      .upload(`${demoOrgId}/probe-${randomUUID()}.txt`, new Blob(["probe"]));

    expect(error, "storage upload must be refused for the demo principal").toBeTruthy();
  });

  it("cannot reach a financial mutation RPC", async () => {
    const { error } = await demo.rpc("issue_dues", {
      p_organization_id: demoOrgId,
    });
    expect(error, "issue_dues must be refused for the demo principal").toBeTruthy();
  });

  it("cannot read another tenant's data", async () => {
    const { data } = await demo
      .from("dues")
      .select("id")
      .eq("organization_id", fixture.orgId);
    expect(data ?? []).toHaveLength(0);
  });

  it("frozen demo ledger is untouched by this suite", async () => {
    const { count } = await admin
      .from("dues")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", demoOrgId);
    expect(count).toBe(240);
  });
});

describe("positive controls -- the same policies still permit legitimate writes", () => {
  it("D1 control: an authorized principal CAN insert property_import_logs", async () => {
    const { error } = await fixture.client.from("property_import_logs").insert({
      organization_id: fixture.orgId,
      import_kind: "UNITS",
      imported_rows: 1,
      skipped_rows: 0,
      allow_partial: false,
    });

    expect(error, "property.units.manage must still permit the insert").toBeNull();

    const { count } = await admin
      .from("property_import_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", fixture.orgId);
    expect(count).toBe(1);
  });

  it("D2 control: a non-demo principal CAN insert and delete an alert dismissal", async () => {
    const alertKey = `control-${randomUUID()}`;

    const { error: insertError } = await fixture.client.from("alert_dismissals").insert({
      organization_id: fixture.orgId,
      user_id: fixture.userId,
      alert_key: alertKey,
    });
    expect(insertError, "a normal tenant must still dismiss alerts").toBeNull();

    await fixture.client.from("alert_dismissals").delete().eq("alert_key", alertKey);

    const { count } = await admin
      .from("alert_dismissals")
      .select("id", { count: "exact", head: true })
      .eq("alert_key", alertKey);
    expect(count ?? 0, "a normal tenant must still undismiss alerts").toBe(0);
  });

  it("D3 control: a non-demo principal CAN mutate its own profile", async () => {
    const name = `control-${randomUUID().slice(0, 8)}`;
    await fixture.client.from("profiles").update({ full_name: name }).eq("id", fixture.userId);

    const { data } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", fixture.userId)
      .single();
    expect(data.full_name).toBe(name);
  });
});
