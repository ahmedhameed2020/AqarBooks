import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Maintenance_RLS_Test_P@ssw0rd_2026!";

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
  categoryId: string;
  alternateCategoryId: string;
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
    if (match) {
      env[match[1]] = match[2];
    }
  }

  const apiUrl = env.API_URL;
  if (!apiUrl?.startsWith("http://127.0.0.1:") && !apiUrl?.startsWith("http://localhost:")) {
    throw new Error("Maintenance RLS gate must run against local Supabase, not a remote project.");
  }

  if (!env.ANON_KEY || !env.SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase anon/service-role keys were not available from supabase status.");
  }

  return {
    API_URL: apiUrl,
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

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(
    /row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized/i,
  );
}

function expectRejectedOrNoop<T>(
  result: { data: T[] | null; error: { message: string } | null },
  context: string,
) {
  if (result.error) {
    expect(result.error.message, context).toMatch(
      /row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized/i,
    );
    return;
  }

  expect(result.data ?? [], context).toEqual([]);
}

async function expectRequestStatus(admin: Client, requestId: string, expectedStatus: string) {
  const { data, error } = await admin
    .from("maintenance_requests")
    .select("status")
    .eq("id", requestId)
    .single();
  expect(error, `request status lookup failed: ${error?.message}`).toBeNull();
  expect(data!.status).toBe(expectedStatus);
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
  const email = `maintenance-rls-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
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
      full_name: `Maintenance Member ${label}`,
      email: actor.email,
      user_id: actor.userId,
    })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();

  return { ...actor, memberId: member!.id, client: await createSignedInClient(local, actor.email) };
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
      name: `Maintenance RLS ${label}`,
      slug: `maintenance-rls-${label.toLowerCase()}-${suffix}`,
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
      name: `Maintenance Property ${label}`,
      code: `MR-${label}-${suffix}`,
      timezone: "Africa/Cairo",
      property_type: "building",
    })
    .select("id")
    .single();
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();
  const propertyId = property!.id;

  const [unitAResult, unitBResult, futureUnitResult] = await Promise.all([
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `A-${suffix}` })
      .select("id")
      .single(),
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `B-${suffix}` })
      .select("id")
      .single(),
    admin
      .from("units")
      .insert({ organization_id: orgId, property_id: propertyId, code: `F-${suffix}` })
      .select("id")
      .single(),
  ]);
  expect(unitAResult.error, `unit A insert failed: ${unitAResult.error?.message}`).toBeNull();
  expect(unitBResult.error, `unit B insert failed: ${unitBResult.error?.message}`).toBeNull();
  expect(futureUnitResult.error, `future unit insert failed: ${futureUnitResult.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-member-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-member-b`);

  const { error: ownershipError } = await admin.from("unit_ownerships").insert([
    {
      organization_id: orgId,
      unit_id: unitAResult.data!.id,
      member_id: memberA.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2020-01-01",
    },
    {
      organization_id: orgId,
      unit_id: unitBResult.data!.id,
      member_id: memberB.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2020-01-01",
    },
    {
      organization_id: orgId,
      unit_id: futureUnitResult.data!.id,
      member_id: memberA.memberId,
      share_percentage: 100,
      is_primary_contact: true,
      start_date: "2099-01-01",
    },
  ]);
  expect(ownershipError, `ownership insert failed: ${ownershipError?.message}`).toBeNull();

  const { data: categories, error: categoryError } = await admin
    .from("maintenance_categories")
    .select("id")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true })
    .limit(2);
  expect(categoryError, `category lookup failed: ${categoryError?.message}`).toBeNull();
  expect(categories).toHaveLength(2);

  return {
    orgId,
    propertyId,
    unitAId: unitAResult.data!.id,
    unitBId: unitBResult.data!.id,
    futureUnitId: futureUnitResult.data!.id,
    categoryId: categories![0].id,
    alternateCategoryId: categories![1].id,
    memberA,
    memberB,
    staffManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`),
    staffViewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createRequest(
  client: Client,
  unitId: string,
  categoryId: string,
  label: string,
): Promise<string> {
  const { data, error } = await client.rpc("create_maintenance_request", {
    p_unit_id: unitId,
    p_category_id: categoryId,
    p_title: `Water leak ${label}`,
    p_description: `The AC drain is leaking in test request ${label}.`,
    p_priority: "NORMAL",
  });
  expect(error, `request create failed: ${error?.message}`).toBeNull();
  expect(data).toMatch(/^[0-9a-f-]{36}$/i);
  return data as string;
}

async function countRows(admin: Client, table: "dues" | "expenses" | "journal_entries" | "payments" | "supplier_invoices", orgId: string) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  expect(error, `${table} count failed: ${error?.message}`).toBeNull();
  return count ?? 0;
}

describe.sequential("maintenance request core runtime RLS gate", () => {
  let local: LocalSupabaseEnv;
  let admin: Client;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  let disabledOrg: OrgFixture;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgA = await createOrgFixture(admin, local, "A", "PROFESSIONAL");
    orgB = await createOrgFixture(admin, local, "B", "PROFESSIONAL");
    disabledOrg = await createOrgFixture(admin, local, "Disabled", "STARTER");

    createdOrgIds.push(orgA.orgId, orgB.orgId, disabledOrg.orgId);
    createdUserIds.push(
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
    for (const orgId of createdOrgIds) {
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

    for (const userId of createdUserIds) {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 120_000);

  it("installs maintenance tables, RLS, authenticated-only table grants, and intended RPC privileges", () => {
    const rlsRows = runLocalDbQuery(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('maintenance_categories', 'maintenance_requests', 'maintenance_request_updates')
      order by c.relname;
    `).split(/\r?\n/);

    expect(rlsRows).toEqual([
      "maintenance_categories|t",
      "maintenance_request_updates|t",
      "maintenance_requests|t",
    ]);

    const tableGrants = runLocalDbQuery(`
      select c.relname,
             r.role_name,
             has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
             has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
             has_table_privilege(r.role_name, c.oid, 'UPDATE') as can_update,
             has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete,
             has_table_privilege(r.role_name, c.oid, 'TRUNCATE') as can_truncate,
             has_table_privilege(r.role_name, c.oid, 'REFERENCES') as can_references,
             has_table_privilege(r.role_name, c.oid, 'TRIGGER') as can_trigger
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(role_name)
      where n.nspname = 'public'
        and c.relname in ('maintenance_categories', 'maintenance_requests', 'maintenance_request_updates')
      order by c.relname, r.role_name;
    `).split(/\r?\n/);

    expect(tableGrants).toEqual([
      "maintenance_categories|anon|f|f|f|f|f|f|f",
      "maintenance_categories|authenticated|t|f|f|f|f|f|f",
      "maintenance_request_updates|anon|f|f|f|f|f|f|f",
      "maintenance_request_updates|authenticated|t|f|f|f|f|f|f",
      "maintenance_requests|anon|f|f|f|f|f|f|f",
      "maintenance_requests|authenticated|t|f|f|f|f|f|f",
    ]);

    const functionGrants = runLocalDbQuery(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'maintenance_module_enabled',
          'is_current_member_unit_owner',
          'maintenance_request_staff_can_read',
          'assert_maintenance_status_transition',
          'create_maintenance_request',
          'cancel_own_maintenance_request',
          'update_maintenance_request_staff',
          'seed_default_maintenance_categories'
        )
      order by p.proname;
    `).split(/\r?\n/);

    expect(functionGrants).toEqual([
      "assert_maintenance_status_transition|f|f",
      "cancel_own_maintenance_request|f|t",
      "create_maintenance_request|f|t",
      "is_current_member_unit_owner|f|t",
      "maintenance_module_enabled|f|t",
      "maintenance_request_staff_can_read|f|t",
      "seed_default_maintenance_categories|f|f",
      "update_maintenance_request_staff|f|t",
    ]);

    const anonClient = createClient<Database>(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return anonClient
      .rpc("create_maintenance_request", {
        p_unit_id: orgA.unitAId,
        p_category_id: orgA.categoryId,
        p_title: "Anonymous request",
        p_description: "Anonymous callers must not reach maintenance RPCs.",
        p_priority: "NORMAL",
      })
      .then(({ error }) => {
        expectSecurityRejection(error, "anon must not execute maintenance mutation RPCs");
      });
  });

  it("lets a member create and read a request only for a current owned unit", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "member-owned");

    const { data: ownRows, error: ownReadError } = await orgA.memberA.client
      .from("maintenance_requests")
      .select("id, organization_id, property_id, unit_id, requester_member_id, status")
      .eq("id", requestId);
    expect(ownReadError, `owner read failed: ${ownReadError?.message}`).toBeNull();
    expect(ownRows).toEqual([
      {
        id: requestId,
        organization_id: orgA.orgId,
        property_id: orgA.propertyId,
        unit_id: orgA.unitAId,
        requester_member_id: orgA.memberA.memberId,
        status: "SUBMITTED",
      },
    ]);

    const { data: bystanderRows, error: bystanderReadError } = await orgA.memberB.client
      .from("maintenance_requests")
      .select("id")
      .eq("id", requestId);
    expect(bystanderReadError, `bystander read failed: ${bystanderReadError?.message}`).toBeNull();
    expect(bystanderRows).toEqual([]);

    const unauthorizedUnit = await orgA.memberA.client.rpc("create_maintenance_request", {
      p_unit_id: orgA.unitBId,
      p_category_id: orgA.categoryId,
      p_title: "Unauthorized unit",
      p_description: "Should not be accepted.",
      p_priority: "NORMAL",
    });
    expectSecurityRejection(unauthorizedUnit.error, "member A must not create against member B's unit");

    const futureOwnership = await orgA.memberA.client.rpc("create_maintenance_request", {
      p_unit_id: orgA.futureUnitId,
      p_category_id: orgA.categoryId,
      p_title: "Future ownership",
      p_description: "Future ownership must not qualify before its start date.",
      p_priority: "NORMAL",
    });
    expectSecurityRejection(futureOwnership.error, "future ownership must not authorize maintenance");
  });

  it("rejects forged direct writes and member cancellation outside the allowed ownership/status rules", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "spoofing");

    const directInsert = await orgA.memberA.client.from("maintenance_requests").insert({
      organization_id: orgB.orgId,
      property_id: orgB.propertyId,
      unit_id: orgB.unitAId,
      requester_member_id: orgB.memberA.memberId,
      category_id: orgB.categoryId,
      request_no: `MR-FORGED-${randomUUID().slice(0, 8)}`,
      title: "Forged insert",
      description: "Client must not be able to spoof tenant/member fields.",
      status: "SUBMITTED",
    });
    expectSecurityRejection(directInsert.error, "direct maintenance_requests INSERT must be rejected");

    const directUpdate = await orgA.memberA.client
      .from("maintenance_requests")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("id");
    expectRejectedOrNoop(directUpdate, "member direct UPDATE must be rejected or affect zero rows");
    await expectRequestStatus(admin, requestId, "SUBMITTED");

    const bystanderCancel = await orgA.memberB.client.rpc("cancel_own_maintenance_request", {
      p_request_id: requestId,
      p_note: "Trying to cancel someone else's request.",
    });
    expectSecurityRejection(bystanderCancel.error, "member B must not cancel member A's request");

    const cancelOwn = await orgA.memberA.client.rpc("cancel_own_maintenance_request", {
      p_request_id: requestId,
      p_note: "Issue no longer needs service.",
    });
    expect(cancelOwn.error, `own cancellation failed: ${cancelOwn.error?.message}`).toBeNull();

    const secondCancel = await orgA.memberA.client.rpc("cancel_own_maintenance_request", {
      p_request_id: requestId,
      p_note: "A cancelled request must be terminal.",
    });
    expect(secondCancel.error, "cancelled must be terminal").not.toBeNull();
    expect(secondCancel.error!.message).toMatch(/invalid_maintenance_transition/i);

    const { count: cancellationUpdates, error: cancellationUpdatesError } = await admin
      .from("maintenance_request_updates")
      .select("id", { count: "exact", head: true })
      .eq("maintenance_request_id", requestId)
      .eq("resulting_status", "CANCELLED");
    expect(cancellationUpdatesError, `cancellation update count failed: ${cancellationUpdatesError?.message}`).toBeNull();
    expect(cancellationUpdates).toBe(1);

    const { count: cancellationAuditLogs, error: cancellationAuditError } = await admin
      .from("platform_audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", requestId)
      .eq("action", "maintenance_request.cancelled");
    expect(cancellationAuditError, `cancellation audit count failed: ${cancellationAuditError?.message}`).toBeNull();
    expect(cancellationAuditLogs).toBe(1);
  });

  it("keeps staff access organization-scoped and hides staff-only updates from members", async () => {
    const orgARequestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "staff-org-a");
    const orgBRequestId = await createRequest(orgB.memberA.client, orgB.unitAId, orgB.categoryId, "staff-org-b");

    const { data: staffARows, error: staffAReadError } = await orgA.staffManager.client
      .from("maintenance_requests")
      .select("id")
      .in("id", [orgARequestId, orgBRequestId])
      .order("id", { ascending: true });
    expect(staffAReadError, `staff A read failed: ${staffAReadError?.message}`).toBeNull();
    expect(staffARows?.map((row) => row.id)).toEqual([orgARequestId]);

    const { data: staffBRows, error: staffBReadError } = await orgB.staffManager.client
      .from("maintenance_requests")
      .select("id")
      .in("id", [orgARequestId, orgBRequestId])
      .order("id", { ascending: true });
    expect(staffBReadError, `staff B read failed: ${staffBReadError?.message}`).toBeNull();
    expect(staffBRows?.map((row) => row.id)).toEqual([orgBRequestId]);

    const viewOnlyDirectUpdate = await orgA.staffViewer.client
      .from("maintenance_requests")
      .update({ priority: "URGENT" })
      .eq("id", orgARequestId)
      .select("id");
    expectRejectedOrNoop(
      viewOnlyDirectUpdate,
      "view-only staff direct UPDATE must be rejected or affect zero rows",
    );

    const viewOnlyRpc = await orgA.staffViewer.client.rpc("update_maintenance_request_staff", {
      p_request_id: orgARequestId,
      p_next_status: "TRIAGED",
      p_category_id: null,
      p_priority: "HIGH",
      p_note: "Viewer should not manage.",
      p_visibility: "STAFF_ONLY",
    });
    expectSecurityRejection(viewOnlyRpc.error, "view-only staff RPC mutation must be rejected");

    const foreignStaffRpc = await orgB.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: orgARequestId,
      p_next_status: "TRIAGED",
      p_category_id: null,
      p_priority: "HIGH",
      p_note: "Cross-tenant manager should not manage.",
      p_visibility: "STAFF_ONLY",
    });
    expectSecurityRejection(foreignStaffRpc.error, "org B staff must not mutate org A requests");

    const staffOnlyUpdate = await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: orgARequestId,
      p_next_status: "TRIAGED",
      p_category_id: orgA.alternateCategoryId,
      p_priority: "HIGH",
      p_note: "Internal triage note",
      p_visibility: "STAFF_ONLY",
    });
    expect(staffOnlyUpdate.error, `staff-only update failed: ${staffOnlyUpdate.error?.message}`).toBeNull();

    const memberVisibleUpdate = await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: orgARequestId,
      p_next_status: null,
      p_category_id: null,
      p_priority: null,
      p_note: "We have reviewed your request.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(memberVisibleUpdate.error, `member-visible update failed: ${memberVisibleUpdate.error?.message}`).toBeNull();

    const { data: ownerUpdates, error: ownerUpdatesError } = await orgA.memberA.client
      .from("maintenance_request_updates")
      .select("note, visibility, resulting_status")
      .eq("maintenance_request_id", orgARequestId)
      .order("created_at", { ascending: true });
    expect(ownerUpdatesError, `owner updates read failed: ${ownerUpdatesError?.message}`).toBeNull();
    expect(ownerUpdates?.map((row) => row.visibility)).toEqual(["MEMBER_VISIBLE", "MEMBER_VISIBLE"]);
    expect(ownerUpdates?.map((row) => row.note)).not.toContain("Internal triage note");

    const { data: staffUpdates, error: staffUpdatesError } = await orgA.staffManager.client
      .from("maintenance_request_updates")
      .select("note, visibility")
      .eq("maintenance_request_id", orgARequestId)
      .order("created_at", { ascending: true });
    expect(staffUpdatesError, `staff updates read failed: ${staffUpdatesError?.message}`).toBeNull();
    expect(staffUpdates?.map((row) => row.note)).toContain("Internal triage note");
    expect(staffUpdates?.map((row) => row.note)).toContain("We have reviewed your request.");
  });

  it("enforces the server-side status machine and entitlement gate without accounting side effects", async () => {
    const beforeAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };

    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "state-machine");

    const invalidTransition = await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: requestId,
      p_next_status: "CLOSED",
      p_category_id: null,
      p_priority: null,
      p_note: "Invalid direct close.",
      p_visibility: "STAFF_ONLY",
    });
    expect(invalidTransition.error, "SUBMITTED -> CLOSED must be rejected").not.toBeNull();
    expect(invalidTransition.error!.message).toMatch(/invalid_maintenance_transition/i);

    const triage = await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: requestId,
      p_next_status: "TRIAGED",
      p_category_id: null,
      p_priority: "HIGH",
      p_note: "Triaged.",
      p_visibility: "STAFF_ONLY",
    });
    expect(triage.error, `triage failed: ${triage.error?.message}`).toBeNull();

    const start = await orgA.staffManager.client.rpc("update_maintenance_request_staff", {
      p_request_id: requestId,
      p_next_status: "IN_PROGRESS",
      p_category_id: null,
      p_priority: null,
      p_note: "Started operational handling.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(start.error, `start failed: ${start.error?.message}`).toBeNull();

    const lateMemberCancel = await orgA.memberA.client.rpc("cancel_own_maintenance_request", {
      p_request_id: requestId,
      p_note: "Trying to cancel after work has started.",
    });
    expect(lateMemberCancel.error, "member cancellation after work starts must be rejected").not.toBeNull();
    expect(lateMemberCancel.error!.message).toMatch(/invalid_maintenance_transition/i);

    const disabledEntitlement = await disabledOrg.memberA.client.rpc("create_maintenance_request", {
      p_unit_id: disabledOrg.unitAId,
      p_category_id: disabledOrg.categoryId,
      p_title: "Disabled maintenance",
      p_description: "Starter plan must not pass the maintenance entitlement gate.",
      p_priority: "NORMAL",
    });
    expectSecurityRejection(disabledEntitlement.error, "maintenance entitlement must be enforced server-side");

    const afterAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };
    expect(afterAccounting).toEqual(beforeAccounting);
  });

  it("does not allow direct table updates to bypass staff RPC transition and history rules", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "direct-staff-update");

    const directStaffUpdate = await orgA.staffManager.client
      .from("maintenance_requests")
      .update({ status: "CLOSED", closed_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("id, status");

    expectRejectedOrNoop(
      directStaffUpdate,
      "staff direct UPDATE must be rejected or affect zero rows so status transitions and operational history stay server-authoritative",
    );
    await expectRequestStatus(admin, requestId, "SUBMITTED");
  });
});
