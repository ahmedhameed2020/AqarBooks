import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "WorkOrders_RLS_Test_P@ssw0rd_2026!";

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
  categoryId: string;
  supplierId: string;
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
    throw new Error("Work order RLS gate must run against local Supabase, not a remote project.");
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
    ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "|", "-c", sql],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function expectSecurityRejection(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  expect(error!.message).toMatch(/row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|not_authorized/i);
}

function expectRejectedOrNoop<T>(result: { data: T[] | null; error: { message: string } | null }, context: string) {
  if (result.error) {
    expect(result.error.message, context).toMatch(/row-level security|permission denied|not authorized|forbidden|unauthorized/i);
    return;
  }
  expect(result.data ?? [], context).toEqual([]);
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
  const email = `work-orders-rls-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
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

async function createMemberActor(admin: Client, local: LocalSupabaseEnv, orgId: string, label: string): Promise<MemberActor> {
  const actor = await createAuthUser(admin, label);
  const { data: member, error } = await admin
    .from("members")
    .insert({ organization_id: orgId, full_name: `Work Orders Member ${label}`, email: actor.email, user_id: actor.userId })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();
  return { ...actor, memberId: member!.id, client: await createSignedInClient(local, actor.email) };
}

async function createOrgFixture(admin: Client, local: LocalSupabaseEnv, label: string, planKey: "PROFESSIONAL" | "STARTER"): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Work Orders RLS ${label}`, slug: `work-orders-rls-${label.toLowerCase()}-${suffix}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();
  expect(orgError, `organization insert failed: ${orgError?.message}`).toBeNull();
  const orgId = org!.id;

  const { error: cloneError } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
  expect(cloneError, `role clone failed: ${cloneError?.message}`).toBeNull();

  const { data: plan, error: planError } = await admin.from("plans").select("id").eq("key", planKey).single();
  expect(planError, `plan lookup failed: ${planError?.message}`).toBeNull();
  const { error: subscriptionError } = await admin.from("subscriptions").insert({ organization_id: orgId, plan_id: plan!.id, status: "ACTIVE" });
  expect(subscriptionError, `subscription insert failed: ${subscriptionError?.message}`).toBeNull();

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .insert({ organization_id: orgId, name: `Work Order Property ${label}`, code: `WO-${label}-${suffix}`, timezone: "Africa/Cairo", property_type: "building" })
    .select("id")
    .single();
  expect(propertyError, `property insert failed: ${propertyError?.message}`).toBeNull();

  const unitA = await admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `A-${suffix}` }).select("id").single();
  const unitB = await admin.from("units").insert({ organization_id: orgId, property_id: property!.id, code: `B-${suffix}` }).select("id").single();
  expect(unitA.error, `unit A insert failed: ${unitA.error?.message}`).toBeNull();
  expect(unitB.error, `unit B insert failed: ${unitB.error?.message}`).toBeNull();

  const memberA = await createMemberActor(admin, local, orgId, `${label}-member-a`);
  const memberB = await createMemberActor(admin, local, orgId, `${label}-member-b`);
  const { error: ownershipError } = await admin.from("unit_ownerships").insert([
    { organization_id: orgId, unit_id: unitA.data!.id, member_id: memberA.memberId, share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" },
    { organization_id: orgId, unit_id: unitB.data!.id, member_id: memberB.memberId, share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" },
  ]);
  expect(ownershipError, `ownership insert failed: ${ownershipError?.message}`).toBeNull();

  const { data: account, error: accountError } = await admin
    .from("chart_of_accounts")
    .insert({ organization_id: orgId, code: `211-${suffix}`, name_ar: "دائنون اختبار", name_en: "Test Payables", category: "LIABILITY", normal_balance: "CREDIT" })
    .select("id")
    .single();
  expect(accountError, `account insert failed: ${accountError?.message}`).toBeNull();

  const { data: supplier, error: supplierError } = await admin
    .from("suppliers")
    .insert({ organization_id: orgId, name: `Test Supplier ${label}`, payable_account_id: account!.id, is_active: true })
    .select("id")
    .single();
  expect(supplierError, `supplier insert failed: ${supplierError?.message}`).toBeNull();

  const { data: categories, error: categoryError } = await admin.from("maintenance_categories").select("id").eq("organization_id", orgId).limit(1);
  expect(categoryError, `category lookup failed: ${categoryError?.message}`).toBeNull();
  expect(categories).toHaveLength(1);

  return {
    orgId,
    propertyId: property!.id,
    unitAId: unitA.data!.id,
    unitBId: unitB.data!.id,
    categoryId: categories![0].id,
    supplierId: supplier!.id,
    memberA,
    memberB,
    staffManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-manager`),
    staffViewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createRequest(client: Client, unitId: string, categoryId: string, label: string): Promise<string> {
  const { data, error } = await client.rpc("create_maintenance_request", {
    p_unit_id: unitId,
    p_category_id: categoryId,
    p_title: `Work order request ${label}`,
    p_description: `Request ready for work order runtime testing ${label}.`,
    p_priority: "NORMAL",
  });
  expect(error, `request create failed: ${error?.message}`).toBeNull();
  return data as string;
}

async function createWorkOrder(client: Client, requestId: string, assignedUserId: string, label: string): Promise<string> {
  const { data, error } = await client.rpc("create_work_order", {
    p_maintenance_request_id: requestId,
    p_assigned_user_id: assignedUserId,
    p_supplier_id: null,
    p_scheduled_start_at: null,
    p_scheduled_end_at: null,
    p_sla_due_at: null,
    p_note: `Create work order ${label}`,
    p_visibility: "STAFF_ONLY",
  });
  expect(error, `work order create failed: ${error?.message}`).toBeNull();
  expect(data).toMatch(/^[0-9a-f-]{36}$/i);
  return data as string;
}

async function createRequestAsAdmin(admin: Client, org: OrgFixture, label: string): Promise<string> {
  const { data, error } = await admin
    .from("maintenance_requests")
    .insert({
      organization_id: org.orgId,
      property_id: org.propertyId,
      unit_id: org.unitAId,
      requester_member_id: org.memberA.memberId,
      category_id: org.categoryId,
      request_no: `MR-ADMIN-${label}-${randomUUID().slice(0, 6)}`,
      title: `Admin fixture request ${label}`,
      description: `Administrative fixture for entitlement gate ${label}.`,
      priority: "NORMAL",
      status: "SUBMITTED",
    })
    .select("id")
    .single();
  expect(error, `admin request fixture failed: ${error?.message}`).toBeNull();
  return data!.id;
}

async function countRows(admin: Client, table: "dues" | "expenses" | "journal_entries" | "payments" | "supplier_invoices", orgId: string) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  expect(error, `${table} count failed: ${error?.message}`).toBeNull();
  return count ?? 0;
}

describe.sequential("maintenance work orders runtime RLS gate", () => {
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
      await admin.from("work_order_updates").delete().eq("organization_id", orgId);
      await admin.from("work_orders").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_attachments").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_updates").delete().eq("organization_id", orgId);
      await admin.from("maintenance_requests").delete().eq("organization_id", orgId);
      await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
      await admin.from("suppliers").delete().eq("organization_id", orgId);
      await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
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

  it("installs work order tables, RLS, SELECT-only table grants, and intended RPC grants", () => {
    const rlsRows = runLocalDbQuery(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('work_orders', 'work_order_updates')
      order by c.relname;
    `).split(/\r?\n/);
    expect(rlsRows).toEqual(["work_order_updates|t", "work_orders|t"]);

    const tableGrants = runLocalDbQuery(`
      select c.relname, r.role_name,
             has_table_privilege(r.role_name, c.oid, 'SELECT') as can_select,
             has_table_privilege(r.role_name, c.oid, 'INSERT') as can_insert,
             has_table_privilege(r.role_name, c.oid, 'UPDATE') as can_update,
             has_table_privilege(r.role_name, c.oid, 'DELETE') as can_delete
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(role_name)
      where n.nspname = 'public' and c.relname in ('work_orders', 'work_order_updates')
      order by c.relname, r.role_name;
    `).split(/\r?\n/);
    expect(tableGrants).toEqual([
      "work_order_updates|anon|f|f|f|f",
      "work_order_updates|authenticated|t|f|f|f",
      "work_orders|anon|f|f|f|f",
      "work_orders|authenticated|t|f|f|f",
    ]);

    const functionGrants = runLocalDbQuery(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname like '%work_order%'
      order by p.proname;
    `).split(/\r?\n/);
    expect(functionGrants).toEqual([
      "add_work_order_cost|f|t",
      "add_work_order_update|f|t",
      "assert_work_order_cost_currency|f|f",
      "assert_work_order_status_transition|f|f",
      "assign_work_order|f|t",
      "audit_work_order_action|f|f",
      "audit_work_order_cost_action|f|f",
      "cancel_work_order|f|t",
      "charge_work_order_cost_to_owner|f|t",
      "complete_work_order|f|t",
      "create_work_order|f|t",
      "insert_work_order_update|f|f",
      "notify_work_order_lifecycle|f|f",
      "post_work_order_cost_as_expense|f|t",
      "post_work_order_cost_as_supplier_invoice|f|t",
      "resume_work_order|f|t",
      "schedule_work_order|f|t",
      "start_work_order|f|t",
      "transition_work_order|f|f",
      "update_unposted_work_order_cost|f|t",
      "validate_work_order_assignee|f|f",
      "void_unposted_work_order_cost|f|t",
      "wait_work_order|f|t",
      "work_order_cost_member_can_read_due|f|t",
      "work_order_cost_staff_can_charge_owner|f|t",
      "work_order_cost_staff_can_manage|f|t",
      "work_order_cost_staff_can_post|f|t",
      "work_order_cost_staff_can_read|f|t",
      "work_order_member_can_read|f|t",
      "work_order_sla_breached|f|t",
      "work_order_staff_can_assign|f|t",
      "work_order_staff_can_complete|f|t",
      "work_order_staff_can_manage|f|t",
      "work_order_staff_can_read|f|t",
    ]);
  });

  it("lets staff create, assign, schedule, progress, and complete a work order without accounting side effects", async () => {
    const beforeAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };

    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "happy-path");
    const workOrderId = await createWorkOrder(orgA.staffManager.client, requestId, orgA.staffManager.userId, "happy-path");

    const schedule = await orgA.staffManager.client.rpc("schedule_work_order", {
      p_work_order_id: workOrderId,
      p_scheduled_start_at: new Date(Date.now() + 60_000).toISOString(),
      p_scheduled_end_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_sla_due_at: new Date(Date.now() + 7_200_000).toISOString(),
      p_note: "Scheduled.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(schedule.error, `schedule failed: ${schedule.error?.message}`).toBeNull();

    const start = await orgA.staffManager.client.rpc("start_work_order", {
      p_work_order_id: workOrderId,
      p_note: "Work started.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(start.error, `start failed: ${start.error?.message}`).toBeNull();

    const wait = await orgA.staffManager.client.rpc("wait_work_order", {
      p_work_order_id: workOrderId,
      p_note: "Waiting for access.",
      p_visibility: "STAFF_ONLY",
    });
    expect(wait.error, `wait failed: ${wait.error?.message}`).toBeNull();

    const resume = await orgA.staffManager.client.rpc("resume_work_order", {
      p_work_order_id: workOrderId,
      p_note: "Access restored.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(resume.error, `resume failed: ${resume.error?.message}`).toBeNull();

    const complete = await orgA.staffManager.client.rpc("complete_work_order", {
      p_work_order_id: workOrderId,
      p_completion_summary: "Repaired AC drain line.",
      p_member_visible_summary: "The AC drain issue has been repaired.",
      p_note: "Completed.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(complete.error, `complete failed: ${complete.error?.message}`).toBeNull();

    const { data: row, error: rowError } = await admin.from("work_orders").select("status, completed_at").eq("id", workOrderId).single();
    expect(rowError, `work order lookup failed: ${rowError?.message}`).toBeNull();
    expect(row!.status).toBe("COMPLETED");
    expect(row!.completed_at).toBeTruthy();

    const { data: requestRow, error: requestError } = await admin.from("maintenance_requests").select("status").eq("id", requestId).single();
    expect(requestError, `request lookup failed: ${requestError?.message}`).toBeNull();
    expect(requestRow!.status).toBe("COMPLETED");

    const afterAccounting = {
      dues: await countRows(admin, "dues", orgA.orgId),
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journalEntries: await countRows(admin, "journal_entries", orgA.orgId),
      payments: await countRows(admin, "payments", orgA.orgId),
      supplierInvoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };
    expect(afterAccounting).toEqual(beforeAccounting);
  });

  it("enforces member visibility, staff-only update hiding, direct write denial, and cross-tenant isolation", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "visibility");
    const workOrderId = await createWorkOrder(orgA.staffManager.client, requestId, orgA.staffManager.userId, "visibility");

    const staffOnly = await orgA.staffManager.client.rpc("add_work_order_update", {
      p_work_order_id: workOrderId,
      p_note: "Internal diagnosis only.",
      p_visibility: "STAFF_ONLY",
    });
    expect(staffOnly.error, `staff-only update failed: ${staffOnly.error?.message}`).toBeNull();

    const memberVisible = await orgA.staffManager.client.rpc("add_work_order_update", {
      p_work_order_id: workOrderId,
      p_note: "We are preparing the visit.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(memberVisible.error, `member-visible update failed: ${memberVisible.error?.message}`).toBeNull();

    const { data: ownerRows, error: ownerError } = await orgA.memberA.client.from("work_orders").select("id").eq("id", workOrderId);
    expect(ownerError, `owner work order read failed: ${ownerError?.message}`).toBeNull();
    expect(ownerRows).toEqual([{ id: workOrderId }]);

    const { data: ownerUpdates, error: ownerUpdatesError } = await orgA.memberA.client
      .from("work_order_updates")
      .select("note, visibility")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: true });
    expect(ownerUpdatesError, `owner updates read failed: ${ownerUpdatesError?.message}`).toBeNull();
    expect(ownerUpdates).toEqual([{ note: "We are preparing the visit.", visibility: "MEMBER_VISIBLE" }]);

    const { data: bystanderRows, error: bystanderError } = await orgA.memberB.client.from("work_orders").select("id").eq("id", workOrderId);
    expect(bystanderError, `bystander read failed: ${bystanderError?.message}`).toBeNull();
    expect(bystanderRows).toEqual([]);

    const { data: crossTenantRows, error: crossTenantError } = await orgB.staffManager.client.from("work_orders").select("id").eq("id", workOrderId);
    expect(crossTenantError, `cross-tenant staff read failed: ${crossTenantError?.message}`).toBeNull();
    expect(crossTenantRows).toEqual([]);

    const directInsert = await orgA.staffManager.client.from("work_orders").insert({
      organization_id: orgA.orgId,
      property_id: orgA.propertyId,
      unit_id: orgA.unitAId,
      maintenance_request_id: requestId,
      work_order_no: `WO-FORGED-${randomUUID().slice(0, 8)}`,
      status: "DRAFT",
      created_by: orgA.staffManager.userId,
      updated_by: orgA.staffManager.userId,
    }).select("id");
    expectSecurityRejection(directInsert.error, "authenticated direct work_orders insert must be rejected");

    const directUpdate = await orgA.staffManager.client.from("work_orders").update({ status: "COMPLETED" }).eq("id", workOrderId).select("id");
    expectRejectedOrNoop(directUpdate, "authenticated direct work_orders update must be rejected");
  });

  it("rejects invalid transitions, view-only mutation, cross-tenant mutation, disabled entitlement, and bad assignment", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "denials");
    const workOrderId = await createWorkOrder(orgA.staffManager.client, requestId, orgA.staffManager.userId, "denials");

    const invalidComplete = await orgA.staffManager.client.rpc("complete_work_order", {
      p_work_order_id: workOrderId,
      p_completion_summary: "Cannot complete before start.",
      p_member_visible_summary: null,
      p_note: null,
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(invalidComplete.error, "cannot complete ASSIGNED directly").not.toBeNull();
    expect(invalidComplete.error!.message).toMatch(/invalid_work_order_transition/i);

    const viewOnly = await orgA.staffViewer.client.rpc("start_work_order", {
      p_work_order_id: workOrderId,
      p_note: "Viewer cannot start.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(viewOnly.error, "view-only staff cannot mutate work orders");

    const crossTenant = await orgB.staffManager.client.rpc("start_work_order", {
      p_work_order_id: workOrderId,
      p_note: "Cross tenant cannot start.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expectSecurityRejection(crossTenant.error, "cross-tenant staff cannot mutate work orders");

    const badAssignment = await orgA.staffManager.client.rpc("assign_work_order", {
      p_work_order_id: workOrderId,
      p_assigned_user_id: orgB.staffManager.userId,
      p_supplier_id: null,
      p_note: "Foreign staff.",
      p_visibility: "STAFF_ONLY",
    });
    expect(badAssignment.error, "foreign staff assignment must be rejected").not.toBeNull();
    expect(badAssignment.error!.message).toMatch(/invalid_work_order_assignee/i);

    const waitingRequestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "waiting-start-denial");
    const waitingWorkOrderId = await createWorkOrder(orgA.staffManager.client, waitingRequestId, orgA.staffManager.userId, "waiting-start-denial");
    expect((await orgA.staffManager.client.rpc("start_work_order", { p_work_order_id: waitingWorkOrderId, p_note: null, p_visibility: "MEMBER_VISIBLE" })).error).toBeNull();
    expect((await orgA.staffManager.client.rpc("wait_work_order", { p_work_order_id: waitingWorkOrderId, p_note: null, p_visibility: "MEMBER_VISIBLE" })).error).toBeNull();
    const startFromWaiting = await orgA.staffManager.client.rpc("start_work_order", {
      p_work_order_id: waitingWorkOrderId,
      p_note: "Start should not resume a waiting order.",
      p_visibility: "MEMBER_VISIBLE",
    });
    expect(startFromWaiting.error, "start must not resume WAITING").not.toBeNull();
    expect(startFromWaiting.error!.message).toMatch(/invalid_work_order_transition/i);

    const disabledRequestId = await createRequestAsAdmin(admin, disabledOrg, "disabled");
    const disabledCreate = await disabledOrg.staffManager.client.rpc("create_work_order", {
      p_maintenance_request_id: disabledRequestId,
      p_assigned_user_id: disabledOrg.staffManager.userId,
      p_supplier_id: null,
      p_scheduled_start_at: null,
      p_scheduled_end_at: null,
      p_sla_due_at: null,
      p_note: "Disabled entitlement.",
      p_visibility: "STAFF_ONLY",
    });
    expectSecurityRejection(disabledCreate.error, "disabled maintenance entitlement cannot create work orders");
  });

  it("supports supplier assignment and exposes derived SLA breach", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "supplier");
    const { data: workOrderId, error } = await orgA.staffManager.client.rpc("create_work_order", {
      p_maintenance_request_id: requestId,
      p_assigned_user_id: null,
      p_supplier_id: orgA.supplierId,
      p_scheduled_start_at: new Date(Date.now() - 7_200_000).toISOString(),
      p_scheduled_end_at: new Date(Date.now() - 3_600_000).toISOString(),
      p_sla_due_at: new Date(Date.now() - 60_000).toISOString(),
      p_note: "Supplier scheduled.",
      p_visibility: "STAFF_ONLY",
    });
    expect(error, `supplier work order create failed: ${error?.message}`).toBeNull();

    const rows = runLocalDbQuery(`
      select public.work_order_sla_breached(wo)
      from public.work_orders wo
      where wo.id = '${workOrderId}';
    `);
    expect(rows).toBe("t");
  });
});
