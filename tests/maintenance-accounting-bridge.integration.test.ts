import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;

const TEST_PASSWORD = "Maintenance_PR3_RLS_Test_P@ssw0rd_2026!";

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
  expenseCategoryId: string;
  expenseAccountId: string;
  paymentAccountId: string;
  payableAccountId: string;
  revenueAccountId: string;
  receivableAccountId: string;
  dueTypeId: string;
  fiscalPeriodId: string;
  memberA: MemberActor;
  memberB: MemberActor;
  propertyManager: Actor;
  accountant: Actor;
  viewer: Actor;
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
    throw new Error("Maintenance accounting bridge gate must run against local Supabase.");
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
  expect(error!.message).toMatch(/row-level security|permission denied|not authorized|not_authenticated|forbidden|unauthorized|not_entitled|permission/i);
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
  const email = `maintenance-pr3-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  expect(error, `auth user create failed for ${label}: ${error?.message}`).toBeNull();
  return { userId: data.user!.id, email };
}

async function createStaffActor(admin: Client, local: LocalSupabaseEnv, orgId: string, roleKey: "PROPERTY_MANAGER" | "ACCOUNTANT" | "VIEWER", label: string): Promise<Actor> {
  const actor = await createAuthUser(admin, label);
  const { error: membershipError } = await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: actor.userId, status: "active" });
  expect(membershipError, `staff membership failed: ${membershipError?.message}`).toBeNull();

  const { data: role, error: roleError } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
  expect(roleError, `role lookup failed for ${roleKey}: ${roleError?.message}`).toBeNull();

  const { error: assignmentError } = await admin.from("user_role_assignments").insert({ user_id: actor.userId, role_id: role!.id, organization_id: orgId });
  expect(assignmentError, `role assignment failed for ${roleKey}: ${assignmentError?.message}`).toBeNull();

  return { ...actor, client: await createSignedInClient(local, actor.email) };
}

async function createMemberActor(admin: Client, local: LocalSupabaseEnv, orgId: string, label: string): Promise<MemberActor> {
  const actor = await createAuthUser(admin, label);
  const { data: member, error } = await admin
    .from("members")
    .insert({ organization_id: orgId, full_name: `Maintenance PR3 Member ${label}`, email: actor.email, user_id: actor.userId })
    .select("id")
    .single();
  expect(error, `member insert failed: ${error?.message}`).toBeNull();
  return { ...actor, memberId: member!.id, client: await createSignedInClient(local, actor.email) };
}

async function createAccount(admin: Client, orgId: string, suffix: string, code: string, category: "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE", normal: "DEBIT" | "CREDIT") {
  const { data, error } = await admin
    .from("chart_of_accounts")
    .insert({
      organization_id: orgId,
      code: `${code}-${suffix}`,
      name_ar: `حساب اختبار ${code}`,
      name_en: `Test Account ${code}`,
      category,
      normal_balance: normal,
      is_cash_equivalent: code.startsWith("CASH"),
      cash_flow_section: code.startsWith("CASH") ? "OPERATING" : null,
    })
    .select("id")
    .single();
  expect(error, `account ${code} insert failed: ${error?.message}`).toBeNull();
  return data!.id;
}

async function createOrgFixture(admin: Client, local: LocalSupabaseEnv, label: string, planKey: "PROFESSIONAL" | "STARTER"): Promise<OrgFixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `Maintenance PR3 ${label}`, slug: `maintenance-pr3-${label.toLowerCase()}-${suffix}`, default_currency: "EGP", status: "ACTIVE" })
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
    .insert({ organization_id: orgId, name: `Maintenance Property ${label}`, code: `MPR3-${label}-${suffix}`, timezone: "Africa/Cairo", property_type: "building" })
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

  const expenseAccountId = await createAccount(admin, orgId, suffix, "EXP-MAINT", "EXPENSE", "DEBIT");
  const paymentAccountId = await createAccount(admin, orgId, suffix, "CASH-MAINT", "ASSET", "DEBIT");
  const payableAccountId = await createAccount(admin, orgId, suffix, "AP-MAINT", "LIABILITY", "CREDIT");
  const revenueAccountId = await createAccount(admin, orgId, suffix, "REV-MAINT", "REVENUE", "CREDIT");
  const receivableAccountId = await createAccount(admin, orgId, suffix, "AR-MAINT", "ASSET", "DEBIT");

  const { data: expenseCategory, error: expenseCategoryError } = await admin
    .from("expense_categories")
    .insert({ organization_id: orgId, name_ar: "صيانة اختبار", name_en: "Maintenance Test", default_expense_account_id: expenseAccountId })
    .select("id")
    .single();
  expect(expenseCategoryError, `expense category insert failed: ${expenseCategoryError?.message}`).toBeNull();

  const { data: dueType, error: dueTypeError } = await admin
    .from("due_types")
    .insert({ organization_id: orgId, name_ar: "تحميل صيانة", name_en: "Maintenance Charge", default_revenue_account_id: revenueAccountId })
    .select("id")
    .single();
  expect(dueTypeError, `due type insert failed: ${dueTypeError?.message}`).toBeNull();

  const { data: supplier, error: supplierError } = await admin
    .from("suppliers")
    .insert({ organization_id: orgId, name: `Maintenance Supplier ${label}`, payable_account_id: payableAccountId, is_active: true })
    .select("id")
    .single();
  expect(supplierError, `supplier insert failed: ${supplierError?.message}`).toBeNull();

  const { data: fiscalYear, error: fiscalYearError } = await admin
    .from("fiscal_years")
    .insert({ organization_id: orgId, name: `FY ${label}`, start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN" })
    .select("id")
    .single();
  expect(fiscalYearError, `fiscal year insert failed: ${fiscalYearError?.message}`).toBeNull();

  const { data: fiscalPeriod, error: fiscalPeriodError } = await admin
    .from("fiscal_periods")
    .insert({ organization_id: orgId, fiscal_year_id: fiscalYear!.id, period_number: 1, name: `P1 ${label}`, start_date: "2026-01-01", end_date: "2026-12-31", status: "OPEN" })
    .select("id")
    .single();
  expect(fiscalPeriodError, `fiscal period insert failed: ${fiscalPeriodError?.message}`).toBeNull();

  const { data: categories, error: categoryError } = await admin.from("maintenance_categories").select("id").eq("organization_id", orgId).limit(1);
  expect(categoryError, `maintenance category lookup failed: ${categoryError?.message}`).toBeNull();
  expect(categories).toHaveLength(1);

  return {
    orgId,
    propertyId: property!.id,
    unitAId: unitA.data!.id,
    unitBId: unitB.data!.id,
    categoryId: categories![0].id,
    supplierId: supplier!.id,
    expenseCategoryId: expenseCategory!.id,
    expenseAccountId,
    paymentAccountId,
    payableAccountId,
    revenueAccountId,
    receivableAccountId,
    dueTypeId: dueType!.id,
    fiscalPeriodId: fiscalPeriod!.id,
    memberA,
    memberB,
    propertyManager: await createStaffActor(admin, local, orgId, "PROPERTY_MANAGER", `${label}-pm`),
    accountant: await createStaffActor(admin, local, orgId, "ACCOUNTANT", `${label}-acct`),
    viewer: await createStaffActor(admin, local, orgId, "VIEWER", `${label}-viewer`),
  };
}

async function createRequest(client: Client, unitId: string, categoryId: string, label: string): Promise<string> {
  const { data, error } = await client.rpc("create_maintenance_request", {
    p_unit_id: unitId,
    p_category_id: categoryId,
    p_title: `Maintenance PR3 request ${label}`,
    p_description: `Request ready for accounting bridge runtime testing ${label}.`,
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
  return data as string;
}

async function createCost(org: OrgFixture, label: string, costType: "LABOR" | "SUPPLIER" | "MATERIAL" | "OTHER" = "LABOR"): Promise<string> {
  const requestId = await createRequest(org.memberA.client, org.unitAId, org.categoryId, label);
  const workOrderId = await createWorkOrder(org.propertyManager.client, requestId, org.propertyManager.userId, label);
  const { data, error } = await org.propertyManager.client.rpc("add_work_order_cost", {
    p_work_order_id: workOrderId,
    p_cost_type: costType,
    p_description: `Cost ${label}`,
    p_quantity: 2,
    p_unit_cost: 75,
    p_currency: "EGP",
    p_supplier_id: costType === "SUPPLIER" ? org.supplierId : null,
    p_source_reference: `PR3-${label}-${randomUUID()}`,
  });
  expect(error, `cost create failed: ${error?.message}`).toBeNull();
  return data as string;
}

async function countRows(admin: Client, table: "dues" | "expenses" | "journal_entries" | "payments" | "supplier_invoices", orgId: string) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  expect(error, `${table} count failed: ${error?.message}`).toBeNull();
  return count ?? 0;
}

describe.sequential("maintenance accounting bridge runtime gate", () => {
  let local: LocalSupabaseEnv;
  let admin: Client;
  let orgA: OrgFixture;
  let orgB: OrgFixture;
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    local = readLocalSupabaseEnv();
    admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    orgA = await createOrgFixture(admin, local, "A", "PROFESSIONAL");
    orgB = await createOrgFixture(admin, local, "B", "PROFESSIONAL");
    createdOrgIds.push(orgA.orgId, orgB.orgId);
    createdUserIds.push(
      orgA.memberA.userId,
      orgA.memberB.userId,
      orgA.propertyManager.userId,
      orgA.accountant.userId,
      orgA.viewer.userId,
      orgB.memberA.userId,
      orgB.memberB.userId,
      orgB.propertyManager.userId,
      orgB.accountant.userId,
      orgB.viewer.userId,
    );
  }, 120_000);

  afterAll(async () => {
    for (const orgId of createdOrgIds) {
      await admin.from("work_order_costs").delete().eq("organization_id", orgId);
      await admin.from("work_order_updates").delete().eq("organization_id", orgId);
      await admin.from("work_orders").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_attachments").delete().eq("organization_id", orgId);
      await admin.from("maintenance_request_updates").delete().eq("organization_id", orgId);
      await admin.from("maintenance_requests").delete().eq("organization_id", orgId);
      await admin.from("payment_allocations").delete().eq("organization_id", orgId);
      await admin.from("payments").delete().eq("organization_id", orgId);
      await admin.from("dues").delete().eq("organization_id", orgId);
      await admin.from("expenses").delete().eq("organization_id", orgId);
      await admin.from("supplier_invoices").delete().eq("organization_id", orgId);
      await admin.from("journal_entry_lines").delete().eq("organization_id", orgId);
      await admin.from("journal_entries").delete().eq("organization_id", orgId);
      await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
      await admin.from("suppliers").delete().eq("organization_id", orgId);
      await admin.from("expense_categories").delete().eq("organization_id", orgId);
      await admin.from("due_types").delete().eq("organization_id", orgId);
      await admin.from("fiscal_periods").delete().eq("organization_id", orgId);
      await admin.from("fiscal_years").delete().eq("organization_id", orgId);
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

  it("installs table RLS, SELECT-only authenticated grants, and narrow RPC grants", () => {
    expect(runLocalDbQuery(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'work_order_costs';
    `)).toBe("work_order_costs|t");

    expect(runLocalDbQuery(`
      select r.role_name,
             has_table_privilege(r.role_name, 'public.work_order_costs', 'SELECT') as can_select,
             has_table_privilege(r.role_name, 'public.work_order_costs', 'INSERT') as can_insert,
             has_table_privilege(r.role_name, 'public.work_order_costs', 'UPDATE') as can_update,
             has_table_privilege(r.role_name, 'public.work_order_costs', 'DELETE') as can_delete
      from (values ('anon'), ('authenticated')) as r(role_name)
      order by r.role_name;
    `).split(/\r?\n/)).toEqual([
      "anon|f|f|f|f",
      "authenticated|t|f|f|f",
    ]);

    const grants = runLocalDbQuery(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.proname like '%work_order_cost%' or p.proname like '%maintenance%owner%')
      order by p.proname;
    `).split(/\r?\n/);

    expect(grants).toContain("add_work_order_cost|f|t");
    expect(grants).toContain("post_work_order_cost_as_expense|f|t");
    expect(grants).toContain("post_work_order_cost_as_supplier_invoice|f|t");
    expect(grants).toContain("charge_work_order_cost_to_owner|f|t");
    expect(grants).toContain("assert_work_order_cost_currency|f|f");
    expect(grants).toContain("audit_work_order_cost_action|f|f");
  });

  it("lets operations staff add unposted costs while blocking members, viewers, direct writes, and cross-tenant actors", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "cost-acl");
    const workOrderId = await createWorkOrder(orgA.propertyManager.client, requestId, orgA.propertyManager.userId, "cost-acl");

    const cost = await orgA.propertyManager.client.rpc("add_work_order_cost", {
      p_work_order_id: workOrderId,
      p_cost_type: "LABOR",
      p_description: "Two hours of labor",
      p_quantity: 2,
      p_unit_cost: 80,
      p_currency: "EGP",
      p_supplier_id: null,
      p_source_reference: "ACL-" + randomUUID(),
    });
    expect(cost.error, `cost add failed: ${cost.error?.message}`).toBeNull();

    const { data: costRows, error: costReadError } = await orgA.propertyManager.client.from("work_order_costs").select("id, total_cost, financial_status").eq("id", cost.data as string);
    expect(costReadError, `cost read failed: ${costReadError?.message}`).toBeNull();
    expect(costRows).toEqual([{ id: cost.data, total_cost: 160, financial_status: "UNPOSTED" }]);

    const memberRead = await orgA.memberA.client.from("work_order_costs").select("id").eq("id", cost.data as string);
    expect(memberRead.error, `member cost read should be empty, not error: ${memberRead.error?.message}`).toBeNull();
    expect(memberRead.data).toEqual([]);

    const viewerAdd = await orgA.viewer.client.rpc("add_work_order_cost", {
      p_work_order_id: workOrderId,
      p_cost_type: "LABOR",
      p_description: "Viewer should fail",
      p_quantity: 1,
      p_unit_cost: 1,
      p_currency: "EGP",
      p_supplier_id: null,
      p_source_reference: null,
    });
    expectSecurityRejection(viewerAdd.error, "view-only staff cannot add costs");

    const crossTenant = await orgB.propertyManager.client.rpc("add_work_order_cost", {
      p_work_order_id: workOrderId,
      p_cost_type: "LABOR",
      p_description: "Cross tenant should fail",
      p_quantity: 1,
      p_unit_cost: 1,
      p_currency: "EGP",
      p_supplier_id: null,
      p_source_reference: null,
    });
    expectSecurityRejection(crossTenant.error, "cross-tenant staff cannot add costs");

    const directInsert = await orgA.propertyManager.client.from("work_order_costs").insert({
      organization_id: orgA.orgId,
      work_order_id: workOrderId,
      cost_type: "LABOR",
      description: "Direct insert",
      quantity: 1,
      unit_cost: 1,
      total_cost: 1,
      currency: "EGP",
      created_by: orgA.propertyManager.userId,
      updated_by: orgA.propertyManager.userId,
    }).select("id");
    expectSecurityRejection(directInsert.error, "direct authenticated insert must be rejected");
  });

  it("posts an operational cost as a canonical paid expense exactly once", async () => {
    const costId = await createCost(orgA, "expense-post", "LABOR");
    const before = {
      expenses: await countRows(admin, "expenses", orgA.orgId),
      journals: await countRows(admin, "journal_entries", orgA.orgId),
      dues: await countRows(admin, "dues", orgA.orgId),
      invoices: await countRows(admin, "supplier_invoices", orgA.orgId),
    };

    const first = await orgA.accountant.client.rpc("post_work_order_cost_as_expense", {
      p_cost_id: costId,
      p_expense_category_id: orgA.expenseCategoryId,
      p_payment_account_id: orgA.paymentAccountId,
      p_fiscal_period_id: orgA.fiscalPeriodId,
      p_expense_date: "2026-09-15",
      p_cashier_session_id: null,
    });
    expect(first.error, `expense post failed: ${first.error?.message}`).toBeNull();

    const second = await orgA.accountant.client.rpc("post_work_order_cost_as_expense", {
      p_cost_id: costId,
      p_expense_category_id: orgA.expenseCategoryId,
      p_payment_account_id: orgA.paymentAccountId,
      p_fiscal_period_id: orgA.fiscalPeriodId,
      p_expense_date: "2026-09-15",
      p_cashier_session_id: null,
    });
    expect(second.error, `expense repost failed: ${second.error?.message}`).toBeNull();
    expect(second.data).toBe(first.data);

    expect(await countRows(admin, "expenses", orgA.orgId)).toBe(before.expenses + 1);
    expect(await countRows(admin, "journal_entries", orgA.orgId)).toBe(before.journals + 1);
    expect(await countRows(admin, "dues", orgA.orgId)).toBe(before.dues);
    expect(await countRows(admin, "supplier_invoices", orgA.orgId)).toBe(before.invoices);
  });

  it("posts supplier costs as canonical supplier invoices exactly once", async () => {
    const costId = await createCost(orgA, "supplier-invoice-post", "SUPPLIER");
    const before = await countRows(admin, "supplier_invoices", orgA.orgId);
    const invoiceNumber = "MPR3-" + randomUUID().slice(0, 8);

    const first = await orgA.accountant.client.rpc("post_work_order_cost_as_supplier_invoice", {
      p_cost_id: costId,
      p_invoice_number: invoiceNumber,
      p_expense_account_id: orgA.expenseAccountId,
      p_fiscal_period_id: orgA.fiscalPeriodId,
      p_invoice_date: "2026-09-15",
      p_due_date: "2026-09-30",
      p_discount_amount: 0,
      p_vat_rate: 0,
      p_vat_account_id: null,
      p_wht_rate: 0,
      p_wht_account_id: null,
    });
    expect(first.error, `supplier invoice post failed: ${first.error?.message}`).toBeNull();

    const second = await orgA.accountant.client.rpc("post_work_order_cost_as_supplier_invoice", {
      p_cost_id: costId,
      p_invoice_number: invoiceNumber,
      p_expense_account_id: orgA.expenseAccountId,
      p_fiscal_period_id: orgA.fiscalPeriodId,
      p_invoice_date: "2026-09-15",
      p_due_date: "2026-09-30",
      p_discount_amount: 0,
      p_vat_rate: 0,
      p_vat_account_id: null,
      p_wht_rate: 0,
      p_wht_account_id: null,
    });
    expect(second.error, `supplier invoice repost failed: ${second.error?.message}`).toBeNull();
    expect(second.data).toBe(first.data);
    expect(await countRows(admin, "supplier_invoices", orgA.orgId)).toBe(before + 1);
  });

  it("creates explicit owner charges as canonical dues without exposing internal cost rows to members", async () => {
    const costId = await createCost(orgA, "owner-charge", "OTHER");
    const due = await orgA.accountant.client.rpc("charge_work_order_cost_to_owner", {
      p_cost_id: costId,
      p_due_type_id: orgA.dueTypeId,
      p_receivable_account_id: orgA.receivableAccountId,
      p_amount: 125,
      p_issue_date: "2026-09-15",
      p_due_date: "2026-09-30",
      p_description: "Owner-approved maintenance charge",
    });
    expect(due.error, `owner charge failed: ${due.error?.message}`).toBeNull();

    const replay = await orgA.accountant.client.rpc("charge_work_order_cost_to_owner", {
      p_cost_id: costId,
      p_due_type_id: orgA.dueTypeId,
      p_receivable_account_id: orgA.receivableAccountId,
      p_amount: 125,
      p_issue_date: "2026-09-15",
      p_due_date: "2026-09-30",
      p_description: "Owner-approved maintenance charge",
    });
    expect(replay.error, `owner charge replay failed: ${replay.error?.message}`).toBeNull();
    expect(replay.data).toBe(due.data);

    const ownerDue = await orgA.memberA.client.from("dues").select("id, amount, source_type").eq("id", due.data as string);
    expect(ownerDue.error, `owner due read failed: ${ownerDue.error?.message}`).toBeNull();
    expect(ownerDue.data).toEqual([{ id: due.data, amount: 125, source_type: "MAINTENANCE_WORK_ORDER_COST" }]);

    const bystanderDue = await orgA.memberB.client.from("dues").select("id").eq("id", due.data as string);
    expect(bystanderDue.error, `bystander due read should be empty: ${bystanderDue.error?.message}`).toBeNull();
    expect(bystanderDue.data).toEqual([]);

    const ownerCost = await orgA.memberA.client.from("work_order_costs").select("id").eq("id", costId);
    expect(ownerCost.error, `owner internal cost read should be empty: ${ownerCost.error?.message}`).toBeNull();
    expect(ownerCost.data).toEqual([]);
  });

  it("rejects supplier spoofing, unsupported currencies, posted edits, and posted voids", async () => {
    const requestId = await createRequest(orgA.memberA.client, orgA.unitAId, orgA.categoryId, "negative");
    const workOrderId = await createWorkOrder(orgA.propertyManager.client, requestId, orgA.propertyManager.userId, "negative");

    const foreignSupplier = await orgA.propertyManager.client.rpc("add_work_order_cost", {
      p_work_order_id: workOrderId,
      p_cost_type: "SUPPLIER",
      p_description: "Foreign supplier",
      p_quantity: 1,
      p_unit_cost: 10,
      p_currency: "EGP",
      p_supplier_id: orgB.supplierId,
      p_source_reference: null,
    });
    expect(foreignSupplier.error, "foreign supplier must be rejected").not.toBeNull();
    expect(foreignSupplier.error!.message).toMatch(/invalid_work_order_cost_supplier/i);

    const badCurrency = await orgA.propertyManager.client.rpc("add_work_order_cost", {
      p_work_order_id: workOrderId,
      p_cost_type: "LABOR",
      p_description: "USD unsupported in PR3",
      p_quantity: 1,
      p_unit_cost: 10,
      p_currency: "USD",
      p_supplier_id: null,
      p_source_reference: null,
    });
    expect(badCurrency.error, "foreign currency must be rejected in PR3").not.toBeNull();
    expect(badCurrency.error!.message).toMatch(/unsupported_cost_currency/i);

    const costId = await createCost(orgA, "immutability", "LABOR");
    const post = await orgA.accountant.client.rpc("post_work_order_cost_as_expense", {
      p_cost_id: costId,
      p_expense_category_id: orgA.expenseCategoryId,
      p_payment_account_id: orgA.paymentAccountId,
      p_fiscal_period_id: orgA.fiscalPeriodId,
      p_expense_date: "2026-09-15",
      p_cashier_session_id: null,
    });
    expect(post.error, `post before immutability checks failed: ${post.error?.message}`).toBeNull();

    const edit = await orgA.propertyManager.client.rpc("update_unposted_work_order_cost", {
      p_cost_id: costId,
      p_cost_type: "LABOR",
      p_description: "Edit posted",
      p_quantity: 1,
      p_unit_cost: 1,
      p_currency: "EGP",
      p_supplier_id: null,
      p_source_reference: null,
    });
    expect(edit.error, "posted cost edit must be rejected").not.toBeNull();
    expect(edit.error!.message).toMatch(/work_order_cost_immutable/i);

    const voided = await orgA.propertyManager.client.rpc("void_unposted_work_order_cost", {
      p_cost_id: costId,
      p_reason: "Should not void posted",
    });
    expect(voided.error, "posted cost void must be rejected").not.toBeNull();
    expect(voided.error!.message).toMatch(/work_order_cost_immutable/i);
  });
});
