import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Unit_Experience_RLS_Test_P@ssw0rd_2026!";

type LocalSupabaseEnv = {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
};

type Actor = { userId: string; email: string; client: Client };
type MemberActor = Actor & { memberId: string };

type OrgFixture = {
  orgId: string;
  propertyId: string;
  unitAId: string;
  unitBId: string;
  futureUnitId: string;
  categoryId: string;
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
    throw new Error("Unit experience RLS gate must run against local Supabase.");
  }
  return { API_URL: env.API_URL, ANON_KEY: env.ANON_KEY, SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY };
}

function runLocalDbQuery(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "|", "-c", sql],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function sqlLiteral(value: string | null): string {
  if (value === null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function tokenHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(/row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized|duplicate|invalid/i);
}

async function createSignedInClient(local: LocalSupabaseEnv, email: string): Promise<Client> {
  const client = createClient<Database>(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return client;
}

async function createAuthUser(admin: Client, label: string) {
  const email = `unit-experience-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
}

async function createMemberActor(admin: Client, local: LocalSupabaseEnv, orgId: string, label: string): Promise<MemberActor> {
  const actor = await createAuthUser(admin, label);
  const { data, error } = await admin
    .from("members")
    .insert({ organization_id: orgId, full_name: `Unit Experience Member ${label}`, email: actor.email, user_id: actor.userId })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();
  return { ...actor, memberId: data!.id, client: await createSignedInClient(local, actor.email) };
}

async function createStaffActor(admin: Client, local: LocalSupabaseEnv, orgId: string, roleKey: "PROPERTY_MANAGER" | "VIEWER", label: string): Promise<Actor> {
  const actor = await createAuthUser(admin, label);
  const { error: membershipError } = await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  expect(membershipError, `staff membership failed: ${membershipError?.message}`).toBeNull();
  const { data: role, error: roleError } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
  expect(roleError, `role lookup failed for ${roleKey}: ${roleError?.message}`).toBeNull();
  const { error: assignmentError } = await admin.from("user_role_assignments").insert({ user_id: actor.userId, role_id: role!.id, organization_id: orgId });
  expect(assignmentError, `staff role assignment failed: ${assignmentError?.message}`).toBeNull();
  return { ...actor, client: await createSignedInClient(local, actor.email) };
}

async function createOrgFixture(admin: Client, local: LocalSupabaseEnv, label: string, planKey: "PROFESSIONAL" | "STARTER"): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Unit Experience ${label}`, slug: `unit-experience-${label.toLowerCase()}-${suffix}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `organization insert failed: ${orgError?.message}`).toBeNull();
  const orgId = org!.id;
  expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId })).error).toBeNull();
  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("key", planKey).single();
  expect(planError, `plan lookup failed: ${planError?.message}`).toBeNull();
  expect((await admin.from("subscriptions").insert({ organization_id: orgId, plan_id: plan!.id, status: "ACTIVE" })).error).toBeNull();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({ organization_id: orgId, name: `Unit Experience Property ${label}`, code: `UX-${label}-${suffix}`, timezone: "Africa/Cairo", property_type: "building" })
    .select("id")
    .single();
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();

  const [unitA, unitB, futureUnit] = await Promise.all([
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `A-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `B-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `F-${suffix}` }).select("id").single(),
  ]);
  expect(unitA.error, `unit A insert failed: ${unitA.error?.message}`).toBeNull();
  expect(unitB.error, `unit B insert failed: ${unitB.error?.message}`).toBeNull();
  expect(futureUnit.error, `future unit insert failed: ${futureUnit.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-b`);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { error: ownershipError } = await admin.from("unit_ownerships").insert([
    { organization_id: orgId, unit_id: unitA.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: unitB.data!.id, member_id: memberB.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: futureUnit.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: tomorrow },
  ]);
  expect(ownershipError, `ownership insert failed: ${ownershipError?.message}`).toBeNull();
  const { data: categories, error: categoryError } = await admin.from("maintenance_categories").select("id").eq("organization_id", orgId).limit(1);
  expect(categoryError, `category lookup failed: ${categoryError?.message}`).toBeNull();

  return {
    orgId,
    propertyId: property!.id,
    unitAId: unitA.data!.id,
    unitBId: unitB.data!.id,
    futureUnitId: futureUnit.data!.id,
    categoryId: categories![0].id,
    memberA,
    memberB,
    staffManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`),
    staffViewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createRequest(client: Client, unitId: string, categoryId: string): Promise<string> {
  const { data, error } = await client.rpc("create_maintenance_request", {
    p_unit_id: unitId,
    p_category_id: categoryId,
    p_title: "Timeline AC leak",
    p_description: "A timeline fixture maintenance request with enough detail.",
    p_priority: "NORMAL",
  });
  expect(error, `request create failed: ${error?.message}`).toBeNull();
  return data as string;
}

async function createInvitation(client: Client, unitId: string, secret: string) {
  const now = Date.now();
  return client.rpc("create_visitor_invitation", {
    p_unit_id: unitId,
    p_token_hash: tokenHash(secret),
    p_token_hint: secret.slice(-8),
    p_guest_name: `Timeline Guest ${randomUUID().slice(0, 6)}`,
    p_guest_phone: null,
    p_guest_note: null,
    p_valid_from: new Date(now - 60_000).toISOString(),
    p_valid_until: new Date(now + 60 * 60 * 1000).toISOString(),
    p_usage_policy: "MULTI_USE",
  });
}

describe.sequential("unit experience runtime Supabase/PostgreSQL RLS gate", () => {
  let local: LocalSupabaseEnv;
  let admin: Client;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  let disabledOrg: OrgFixture;
  const cleanupOrgIds: string[] = [];
  const cleanupUserIds: string[] = [];

  beforeAll(async () => {
    local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    orgA = await createOrgFixture(admin, local, "A", "PROFESSIONAL");
    orgB = await createOrgFixture(admin, local, "B", "PROFESSIONAL");
    disabledOrg = await createOrgFixture(admin, local, "Disabled", "STARTER");
    cleanupOrgIds.push(orgA.orgId, orgB.orgId, disabledOrg.orgId);
    cleanupUserIds.push(
      orgA.memberA.userId,
      orgA.memberB.userId,
      orgA.staffManager.userId,
      orgA.staffViewer.userId,
      orgB.memberA.userId,
      orgB.memberB.userId,
      orgB.staffManager.userId,
      orgB.staffViewer.userId,
      disabledOrg.memberA.userId,
      disabledOrg.memberB.userId,
      disabledOrg.staffManager.userId,
      disabledOrg.staffViewer.userId,
    );
  }, 120_000);

  afterAll(async () => {
    for (const orgId of cleanupOrgIds) {
      await admin.from("notifications").delete().eq("organization_id", orgId);
      await admin.from("vehicles").delete().eq("organization_id", orgId);
      await admin.from("access_events").delete().eq("organization_id", orgId);
      await admin.from("visitor_access_state").delete().eq("organization_id", orgId);
      await admin.from("visitor_invitation_secrets").delete().eq("organization_id", orgId);
      await admin.from("visitor_invitations").delete().eq("organization_id", orgId);
      await admin.from("gates").delete().eq("organization_id", orgId);
      await admin.from("work_order_costs").delete().eq("organization_id", orgId);
      await admin.from("work_order_updates").delete().eq("organization_id", orgId);
      await admin.from("work_orders").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_updates").delete().eq("organization_id", orgId);
      await admin.from("maintenance_requests").delete().eq("organization_id", orgId);
      await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
      await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
      await admin.from("members").delete().eq("organization_id", orgId);
      await admin.from("units").delete().eq("organization_id", orgId);
      await admin.from("properties").delete().eq("organization_id", orgId);
      await admin.from("subscriptions").delete().eq("organization_id", orgId);
      await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
      await admin.from("organization_memberships").delete().eq("organization_id", orgId);
      await admin.from("roles").delete().eq("organization_id", orgId);
      await admin.from("maintenance_categories").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
    for (const userId of cleanupUserIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  it("installs SELECT-only vehicles/notifications tables and intended RPC grants", () => {
    const privileges = runLocalDbQuery(`
      select
        has_table_privilege('anon', 'public.vehicles', 'select'),
        has_table_privilege('authenticated', 'public.vehicles', 'select'),
        has_table_privilege('authenticated', 'public.vehicles', 'insert'),
        has_table_privilege('anon', 'public.notifications', 'select'),
        has_table_privilege('authenticated', 'public.notifications', 'select'),
        has_table_privilege('authenticated', 'public.notifications', 'insert'),
        has_table_privilege('authenticated', 'public.notifications', 'update'),
        has_function_privilege('anon', 'public.create_vehicle(uuid,text,text,text,text,text,text,integer,text)', 'execute'),
        has_function_privilege('authenticated', 'public.create_vehicle(uuid,text,text,text,text,text,text,integer,text)', 'execute'),
        has_function_privilege('authenticated', 'public.create_notification_once(uuid,uuid,uuid,text,text,text,text,text,text,uuid,text,text)', 'execute'),
        has_function_privilege('authenticated', 'public.get_unit_timeline(uuid,timestamp with time zone,text,integer)', 'execute')
    `);
    expect(privileges).toBe("f|t|f|f|t|f|f|f|t|f|t");
  });

  it("lets an owner create vehicles only for current owned units and enforces normalized active plate uniqueness", async () => {
    const created = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitAId,
      p_plate_number: "ABC 123",
      p_plate_country: "EG",
      p_plate_region: "Cairo",
      p_make: "Toyota",
      p_model: "Corolla",
      p_color: "Silver",
      p_year: 2024,
      p_notes: null,
    });
    expect(created.error, `vehicle create failed: ${created.error?.message}`).toBeNull();

    const { data: ownRows, error: ownReadError } = await orgA.memberA.client
      .from("vehicles")
      .select("id, normalized_plate, unit_id, member_id, is_active")
      .eq("id", created.data!);
    expect(ownReadError, `own read failed: ${ownReadError?.message}`).toBeNull();
    expect(ownRows).toEqual([{ id: created.data!, normalized_plate: "EGCAIROABC123", unit_id: orgA.unitAId, member_id: orgA.memberA.memberId, is_active: true }]);

    const duplicate = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitAId,
      p_plate_number: "abc-123",
      p_plate_country: "EG",
      p_plate_region: "Cairo",
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expectSecurityRejection(duplicate.error, "normalized active duplicate plate must be rejected");

    const otherUnit = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitBId,
      p_plate_number: "ZZZ 999",
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expectSecurityRejection(otherUnit.error, "member cannot add a vehicle to another member's unit");

    const futureUnit = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.futureUnitId,
      p_plate_number: "FUT 100",
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expectSecurityRejection(futureUnit.error, "future ownership must not authorize vehicle creation");

    const disabled = await disabledOrg.memberA.client.rpc("create_vehicle", {
      p_unit_id: disabledOrg.unitAId,
      p_plate_number: "DIS 100",
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expectSecurityRejection(disabled.error, "starter plan cannot use unit experience");
  });

  it("keeps vehicle reads and mutations scoped to owner and organization staff permissions", async () => {
    const created = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitAId,
      p_plate_number: `SCOPE-${randomUUID().slice(0, 6)}`,
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expect(created.error).toBeNull();

    const memberBRead = await orgA.memberB.client.from("vehicles").select("id").eq("id", created.data!);
    expect(memberBRead.error, `member B vehicle read errored: ${memberBRead.error?.message}`).toBeNull();
    expect(memberBRead.data).toEqual([]);

    const staffRead = await orgA.staffViewer.client.from("vehicles").select("id").eq("id", created.data!);
    expect(staffRead.error, `staff read failed: ${staffRead.error?.message}`).toBeNull();
    expect(staffRead.data).toEqual([{ id: created.data! }]);

    const crossTenantRead = await orgB.staffManager.client.from("vehicles").select("id").eq("id", created.data!);
    expect(crossTenantRead.error, `cross tenant read errored: ${crossTenantRead.error?.message}`).toBeNull();
    expect(crossTenantRead.data).toEqual([]);

    const directInsert = await orgA.memberA.client.from("vehicles").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      unit_id: orgA.unitAId,
      member_id: orgA.memberA.memberId,
      plate_number: "DIRECT",
      plate_country: "EG",
      normalized_plate: "EGDIRECT",
      created_by: orgA.memberA.userId,
    });
    expectSecurityRejection(directInsert.error, "direct vehicle table insert must be rejected");

    const viewerUpdate = await orgA.staffViewer.client.rpc("update_vehicle_staff", {
      p_vehicle_id: created.data!,
      p_plate_number: "VIEWER",
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
      p_is_active: true,
    });
    expectSecurityRejection(viewerUpdate.error, "view-only staff cannot mutate vehicles");

    const managerDeactivate = await orgA.staffManager.client.rpc("update_vehicle_staff", {
      p_vehicle_id: created.data!,
      p_plate_number: "MGR 100",
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
      p_is_active: false,
    });
    expect(managerDeactivate.error, `manager deactivate failed: ${managerDeactivate.error?.message}`).toBeNull();
  });

  it("projects an owner-safe timeline without staff-only notes, internal costs, denied scans, or unrelated units", async () => {
    const vehicle = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitAId,
      p_plate_number: `TIME-${randomUUID().slice(0, 6)}`,
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expect(vehicle.error).toBeNull();

    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId);
    expect((await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: requestId,
      p_next_status: "TRIAGED",
      p_category_id: null,
      p_priority: "HIGH",
      p_note: "Internal diagnosis must stay staff-only.",
      p_visibility: "STAFF_ONLY",
    })).error).toBeNull();
    expect((await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: requestId,
      p_next_status: null,
      p_category_id: null,
      p_priority: null,
      p_note: "We reviewed your request.",
      p_visibility: "MEMBER_VISIBLE",
    })).error).toBeNull();

    const secret = `timeline-${randomUUID()}`;
    const invitation = await createInvitation(orgA.memberA.client, orgA.unitAId, secret);
    expect(invitation.error, `invitation create failed: ${invitation.error?.message}`).toBeNull();
    const gate = await orgA.staffManager.client.rpc("create_gate", {
      p_property_id: orgA.propertyId,
      p_code: `UX-${randomUUID().slice(0, 6)}`,
      p_name_ar: "بوابة التجربة",
      p_name_en: "Experience Gate",
      p_direction_mode: "BOTH",
    });
    expect(gate.error, `gate create failed: ${gate.error?.message}`).toBeNull();
    const denied = await orgA.staffManager.client.rpc("process_visitor_gate_scan", {
      p_gate_id: gate.data!,
      p_invitation_id: invitation.data!,
      p_raw_secret: "wrong-secret",
      p_direction: "ENTRY",
      p_client_scan_id: randomUUID(),
    });
    expect(denied.error).toBeNull();
    expect(denied.data![0].decision).toBe("DENY");
    const allowed = await orgA.staffManager.client.rpc("process_visitor_gate_scan", {
      p_gate_id: gate.data!,
      p_invitation_id: invitation.data!,
      p_raw_secret: secret,
      p_direction: "ENTRY",
      p_client_scan_id: randomUUID(),
    });
    expect(allowed.error, `allowed scan failed: ${allowed.error?.message}`).toBeNull();

    const timeline = await orgA.memberA.client.rpc("get_unit_timeline", {
      p_unit_id: orgA.unitAId,
      p_cursor_occurred_at: null,
      p_cursor_event_id: null,
      p_limit: 30,
    });
    expect(timeline.error, `timeline failed: ${timeline.error?.message}`).toBeNull();
    const eventTypes = (timeline.data ?? []).map((row) => row.event_type);
    expect(eventTypes).toContain("VEHICLE_REGISTERED");
    expect(eventTypes).toContain("MAINTENANCE_REQUEST");
    expect(eventTypes).toContain("MAINTENANCE_UPDATE");
    expect(eventTypes).toContain("VISITOR_INVITATION_CREATED");
    expect(eventTypes).toContain("VISITOR_ENTERED");
    expect(JSON.stringify(timeline.data)).not.toContain("Internal diagnosis must stay staff-only");
    expect(JSON.stringify(timeline.data)).not.toContain("INVALID_PASS");

    const memberBTimeline = await orgA.memberB.client.rpc("get_unit_timeline", {
      p_unit_id: orgA.unitAId,
      p_cursor_occurred_at: null,
      p_cursor_event_id: null,
      p_limit: 10,
    });
    expectSecurityRejection(memberBTimeline.error, "unrelated member cannot view another unit timeline");
  });

  it("creates idempotent notifications and lets only the recipient mark them read", async () => {
    const before = await orgA.memberA.client.from("notifications").select("id, type, is_read").eq("type", "VEHICLE_REGISTERED");
    expect(before.error).toBeNull();

    const vehicle = await orgA.memberA.client.rpc("create_vehicle", {
      p_unit_id: orgA.unitAId,
      p_plate_number: `NOTE-${randomUUID().slice(0, 6)}`,
      p_plate_country: "EG",
      p_plate_region: null,
      p_make: null,
      p_model: null,
      p_color: null,
      p_year: null,
      p_notes: null,
    });
    expect(vehicle.error).toBeNull();

    runLocalDbQuery(`
      select public.create_notification_once(
        ${sqlLiteral(orgA.orgId)}::uuid,
        ${sqlLiteral(orgA.memberA.userId)}::uuid,
        ${sqlLiteral(orgA.memberA.memberId)}::uuid,
        'VEHICLE_REGISTERED',
        'تم تسجيل مركبة',
        'Vehicle registered',
        'مكرر',
        'Duplicate',
        'vehicle',
        ${sqlLiteral(vehicle.data!)}::uuid,
        ${sqlLiteral(`/portal/vehicles/${vehicle.data}`)},
        'NORMAL'
      )
    `);

    const notifications = await orgA.memberA.client
      .from("notifications")
      .select("id, type, source_id, is_read")
      .eq("type", "VEHICLE_REGISTERED")
      .eq("source_id", vehicle.data!);
    expect(notifications.error, `recipient notification read failed: ${notifications.error?.message}`).toBeNull();
    expect(notifications.data).toHaveLength(1);

    const unrelatedRead = await orgA.memberB.client.from("notifications").select("id").eq("id", notifications.data![0].id);
    expect(unrelatedRead.error, `unrelated notification read errored: ${unrelatedRead.error?.message}`).toBeNull();
    expect(unrelatedRead.data).toEqual([]);

    const directInsert = await orgA.memberA.client.from("notifications").insert({
      organization_id: orgA.orgId,
      recipient_user_id: orgA.memberA.userId,
      recipient_member_id: orgA.memberA.memberId,
      type: "VEHICLE_REGISTERED",
      title_ar: "مزور",
      title_en: "Forged",
      body_ar: "مزور",
      body_en: "Forged",
      source_type: "vehicle",
      source_id: vehicle.data!,
    });
    expectSecurityRejection(directInsert.error, "direct notification insert must be rejected");

    const memberBMark = await orgA.memberB.client.rpc("mark_notification_read", { p_notification_id: notifications.data![0].id });
    expect(memberBMark.error).not.toBeNull();
    expect(memberBMark.error!.message).toBe("NOTIFICATION_NOT_FOUND");

    const ownMark = await orgA.memberA.client.rpc("mark_notification_read", { p_notification_id: notifications.data![0].id });
    expect(ownMark.error, `own mark read failed: ${ownMark.error?.message}`).toBeNull();

    const directUpdate = await orgA.memberA.client.from("notifications").update({ is_read: false, read_at: null }).eq("id", notifications.data![0].id);
    expectSecurityRejection(directUpdate.error, "direct notification update must be rejected");
  });
});
