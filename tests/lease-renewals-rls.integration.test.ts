import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;
type LooseClient = ReturnType<typeof createClient>;
type LocalEnv = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
type Actor = { userId: string; email: string; client: LooseClient };
type MemberActor = Actor & { memberId: string };
type Fixture = {
  orgId: string;
  propertyId: string;
  unitId: string;
  leaseId: string;
  tenant: MemberActor;
  owner: MemberActor;
  formerOwner: MemberActor;
  manager: Actor;
  scopedManager: Actor;
  viewer: Actor;
};

const PASSWORD = "Lease_Renewal_RLS_2026!";

function localEnv(): LocalEnv {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  if (!env.API_URL?.startsWith("http://127.0.0.1:") && !env.API_URL?.startsWith("http://localhost:")) {
    throw new Error("Lease renewal RLS gate must run against local Supabase.");
  }
  return { API_URL: env.API_URL, ANON_KEY: env.ANON_KEY, SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY };
}

function dbQuery(sql: string) {
  return execFileSync(
    "docker",
    ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "|", "-c", sql],
    { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

async function signedIn(env: LocalEnv, email: string): Promise<LooseClient> {
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return client;
}

async function authUser(admin: Client, label: string) {
  const email = `renewal-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(error).toBeNull();
  return { userId: data.user!.id, email };
}

async function memberActor(admin: Client, env: LocalEnv, orgId: string, label: string): Promise<MemberActor> {
  const actor = await authUser(admin, label);
  const { data, error } = await admin.from("members").insert({
    organization_id: orgId, full_name: `Renewal ${label}`, email: actor.email, user_id: actor.userId,
  }).select("id").single();
  expect(error).toBeNull();
  return { ...actor, memberId: data!.id, client: await signedIn(env, actor.email) };
}

async function staffActor(
  admin: Client,
  env: LocalEnv,
  orgId: string,
  roleKey: "PROPERTY_MANAGER" | "VIEWER",
  label: string,
  propertyId?: string,
): Promise<Actor> {
  const actor = await authUser(admin, label);
  expect((await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: actor.userId, status: "active" })).error).toBeNull();
  const { data: role, error } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
  expect(error).toBeNull();
  expect((await admin.from("user_role_assignments").insert({
    user_id: actor.userId,
    role_id: role!.id,
    organization_id: orgId,
    property_id: propertyId ?? null,
  })).error).toBeNull();
  return { ...actor, client: await signedIn(env, actor.email) };
}

async function fixture(admin: Client, env: LocalEnv, label: string, planKey: "PROFESSIONAL" | "STARTER"): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin.from("organizations").insert({
    name: `Renewal ${label}`, slug: `renewal-${label.toLowerCase()}-${suffix}`, default_currency: "EGP", status: "ACTIVE",
  }).select("id").single();
  expect(orgError).toBeNull();
  expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id })).error).toBeNull();
  const { data: plan } = await admin.from("plans").select("id").eq("key", planKey).single();
  expect((await admin.from("subscriptions").insert({ organization_id: org!.id, plan_id: plan!.id, status: "ACTIVE" })).error).toBeNull();

  const { data: property, error: propertyError } = await admin.from("properties").insert({
    organization_id: org!.id, name: `Renewal Property ${label}`, code: `RN-${suffix}`, timezone: "Africa/Cairo", property_type: "resort",
  }).select("id").single();
  expect(propertyError).toBeNull();
  const { data: unit, error: unitError } = await admin.from("units").insert({
    organization_id: org!.id, property_id: property!.id, code: `RN-${suffix}`,
  }).select("id").single();
  expect(unitError).toBeNull();

  const tenant = await memberActor(admin, env, org!.id, `${label}-tenant`);
  const owner = await memberActor(admin, env, org!.id, `${label}-owner`);
  const formerOwner = await memberActor(admin, env, org!.id, `${label}-former-owner`);
  expect((await admin.from("unit_ownerships").insert([
    { organization_id: org!.id, unit_id: unit!.id, member_id: owner.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: org!.id, unit_id: unit!.id, member_id: formerOwner.memberId, share_percentage: 100, start_date: "2018-01-01", end_date: "2019-01-01" },
  ])).error).toBeNull();

  const { data: receivable, error: receivableError } = await admin.from("chart_of_accounts").insert({
    organization_id: org!.id, code: `110-${suffix}`, name_ar: "ذمم إيجار", name_en: "Rent receivable", category: "ASSET", normal_balance: "DEBIT",
  }).select("id").single();
  expect(receivableError).toBeNull();
  const { data: revenue, error: revenueError } = await admin.from("chart_of_accounts").insert({
    organization_id: org!.id, code: `410-${suffix}`, name_ar: "إيراد إيجار", name_en: "Rent revenue", category: "REVENUE", normal_balance: "CREDIT",
  }).select("id").single();
  expect(revenueError).toBeNull();
  const { data: dueType, error: dueTypeError } = await admin.from("due_types").insert({
    organization_id: org!.id, name_ar: "إيجار", name_en: "Rent", default_revenue_account_id: revenue!.id,
  }).select("id").single();
  expect(dueTypeError).toBeNull();
  const db = admin as unknown as LooseClient;
  const { data: lease, error: leaseError } = await db.from("unit_leases").insert({
    organization_id: org!.id,
    property_id: property!.id,
    unit_id: unit!.id,
    tenant_member_id: tenant.memberId,
    due_type_id: dueType!.id,
    receivable_account_id: receivable!.id,
    status: "ACTIVE",
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
    rent_amount: 12000,
    rent_frequency: "MONTHLY",
    security_deposit_amount: 1000,
    billing_recipient: "TENANT",
  }).select("id").single();
  expect(leaseError, leaseError?.message).toBeNull();

  return {
    orgId: org!.id,
    propertyId: property!.id,
    unitId: unit!.id,
    leaseId: lease!.id,
    tenant,
    owner,
    formerOwner,
    manager: await staffActor(admin, env, org!.id, "PROPERTY_MANAGER", `${label}-manager`),
    scopedManager: await staffActor(admin, env, org!.id, "PROPERTY_MANAGER", `${label}-scoped-manager`, property!.id),
    viewer: await staffActor(admin, env, org!.id, "VIEWER", `${label}-viewer`),
  };
}

const requestArgs = (leaseId: string) => ({
  p_lease_id: leaseId,
  p_proposed_starts_on: "2027-01-01",
  p_proposed_ends_on: "2027-12-31",
  p_proposed_rent_amount: 12500,
  p_proposed_rent_frequency: "MONTHLY",
  p_note: "Please renew",
});

describe.sequential("lease renewal runtime Supabase/PostgreSQL RLS gate", () => {
  let env: LocalEnv;
  let admin: Client;
  let enabled: Fixture;
  let other: Fixture;
  let conflict: Fixture;
  let starter: Fixture;
  let requestId: string;
  const orgIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    env = localEnv();
    admin = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    enabled = await fixture(admin, env, "Enabled", "PROFESSIONAL");
    other = await fixture(admin, env, "Other", "PROFESSIONAL");
    conflict = await fixture(admin, env, "Conflict", "PROFESSIONAL");
    starter = await fixture(admin, env, "Starter", "STARTER");
    for (const f of [enabled, other, conflict, starter]) {
      orgIds.push(f.orgId);
      userIds.push(f.tenant.userId, f.owner.userId, f.formerOwner.userId, f.manager.userId, f.scopedManager.userId, f.viewer.userId);
    }
  }, 120_000);

  afterAll(async () => {
    const db = admin as unknown as LooseClient;
    for (const orgId of orgIds) {
      await db.from("lease_expiry_dispatches").delete().eq("organization_id", orgId);
      await db.from("lease_renewal_transitions").delete().eq("organization_id", orgId);
      await db.from("lease_renewal_requests").delete().eq("organization_id", orgId);
      await db.from("lease_rent_generation_runs").delete().eq("organization_id", orgId);
      await db.from("dues").delete().eq("organization_id", orgId);
      await db.from("unit_leases").delete().eq("organization_id", orgId);
      await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
      await admin.from("due_types").delete().eq("organization_id", orgId);
      await admin.from("chart_of_accounts").delete().eq("organization_id", orgId);
      await admin.from("members").delete().eq("organization_id", orgId);
      await admin.from("units").delete().eq("organization_id", orgId);
      await admin.from("properties").delete().eq("organization_id", orgId);
      await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
      await admin.from("organization_memberships").delete().eq("organization_id", orgId);
      await admin.from("subscriptions").delete().eq("organization_id", orgId);
      await admin.from("roles").delete().eq("organization_id", orgId);
      await admin.from("organizations").delete().eq("id", orgId);
    }
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }, 120_000);

  it("installs RLS, SELECT-only request history, internal dispatches, and narrow RPC grants", () => {
    expect(dbQuery(`select
      has_table_privilege('authenticated','public.lease_renewal_requests','select'),
      has_table_privilege('authenticated','public.lease_renewal_requests','insert'),
      has_table_privilege('authenticated','public.lease_renewal_transitions','select'),
      has_table_privilege('authenticated','public.lease_renewal_transitions','update'),
      has_table_privilege('authenticated','public.lease_expiry_dispatches','select'),
      has_function_privilege('anon','public.request_lease_renewal(uuid,date,date,numeric,text,text)','execute'),
      has_function_privilege('authenticated','public.request_lease_renewal(uuid,date,date,numeric,text,text)','execute'),
      has_function_privilege('authenticated','public.decide_lease_renewal(uuid,text,text)','execute'),
      has_function_privilege('authenticated','public.get_owned_unit_lease_renewal_status(uuid)','execute'),
      has_function_privilege('anon','public.promote_scheduled_lease_renewals(date)','execute'),
      has_function_privilege('authenticated','public.promote_scheduled_lease_renewals(date)','execute'),
      has_function_privilege('service_role','public.promote_scheduled_lease_renewals(date)','execute')`))
      .toBe("t|f|t|f|f|f|t|t|t|f|f|t");
  });

  it("lets the lease tenant create one idempotent request and records append-only history", async () => {
    const created = await enabled.tenant.client.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(created.error, created.error?.message).toBeNull();
    requestId = created.data as string;
    const replay = await enabled.tenant.client.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(replay.error, replay.error?.message).toBeNull();
    expect(replay.data).toBe(requestId);
    const requests = await enabled.tenant.client.from("lease_renewal_requests").select("id,status").eq("id", requestId);
    expect(requests.data).toEqual([{ id: requestId, status: "REQUESTED" }]);
    const transitions = await enabled.tenant.client.from("lease_renewal_transitions").select("from_status,to_status").eq("renewal_request_id", requestId);
    expect(transitions.data).toEqual([{ from_status: null, to_status: "REQUESTED" }]);
    const transitionId = dbQuery(`select id from public.lease_renewal_transitions where renewal_request_id = '${requestId}'::uuid`);
    const appendOnly = await (admin as unknown as LooseClient).from("lease_renewal_transitions").update({ reason: "rewritten" }).eq("id", transitionId);
    expect(appendOnly.error?.message).toContain("LEASE_RENEWAL_TRANSITIONS_APPEND_ONLY");
    const directInsert = await enabled.tenant.client.from("lease_renewal_requests").insert({ organization_id: enabled.orgId });
    expect(directInsert.error).not.toBeNull();
    expect(dbQuery(`select count(*) from public.dues where source_id = '${enabled.leaseId}'::uuid`)).toBe("0");
  });

  it("gives current owners only the narrow status projection and excludes former owners", async () => {
    expect((await enabled.owner.client.from("lease_renewal_requests").select("id").eq("id", requestId)).data).toEqual([]);
    const projection = await enabled.owner.client.rpc("get_owned_unit_lease_renewal_status", { p_unit_id: enabled.unitId });
    expect(projection.error, projection.error?.message).toBeNull();
    expect(projection.data).toEqual([expect.objectContaining({ renewal_request_id: requestId, status: "REQUESTED" })]);
    const former = await enabled.formerOwner.client.rpc("get_owned_unit_lease_renewal_status", { p_unit_id: enabled.unitId });
    expect(former.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    const ownerCreate = await enabled.owner.client.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(ownerCreate.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
  });

  it("lets view staff read but only manage staff create and decide", async () => {
    const staffCreated = await other.manager.client.rpc("request_lease_renewal", requestArgs(other.leaseId));
    expect(staffCreated.error, staffCreated.error?.message).toBeNull();
    expect((await other.manager.client.from("lease_renewal_requests").select("requester_kind").eq("id", staffCreated.data).single()).data)
      .toEqual({ requester_kind: "STAFF" });
    expect((await enabled.viewer.client.from("lease_renewal_requests").select("id").eq("id", requestId)).data).toEqual([{ id: requestId }]);
    const viewerDecision = await enabled.viewer.client.rpc("decide_lease_renewal", { p_request_id: requestId, p_decision: "APPROVED", p_reason: null });
    expect(viewerDecision.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    const decision = await enabled.manager.client.rpc("decide_lease_renewal", { p_request_id: requestId, p_decision: "APPROVED", p_reason: "Terms reviewed" });
    expect(decision.error, decision.error?.message).toBeNull();
    const approvedRequest = await enabled.manager.client.from("lease_renewal_requests")
      .select("status,successor_lease_id").eq("id", requestId).single();
    expect(approvedRequest.data).toEqual({ status: "APPROVED", successor_lease_id: expect.any(String) });
    expect((await enabled.manager.client.from("lease_renewal_transitions").select("from_status,to_status").eq("renewal_request_id", requestId).order("created_at")).data)
      .toEqual([{ from_status: null, to_status: "REQUESTED" }, { from_status: "REQUESTED", to_status: "APPROVED" }]);
    expect(dbQuery(`select status, starts_on, ends_on, rent_amount, rent_frequency, renewed_from_lease_id
      from public.unit_leases where id = '${approvedRequest.data!.successor_lease_id}'::uuid`))
      .toBe(`SCHEDULED|2027-01-01|2027-12-31|12500.0000|MONTHLY|${enabled.leaseId}`);
    expect(dbQuery(`select count(*) from public.dues where source_id = '${approvedRequest.data!.successor_lease_id}'::uuid`)).toBe("0");

    const replay = await enabled.manager.client.rpc("decide_lease_renewal", {
      p_request_id: requestId, p_decision: "APPROVED", p_reason: "Replay",
    });
    expect(replay.error).toBeNull();
    expect(dbQuery(`select count(*) from public.unit_leases where renewed_from_lease_id = '${enabled.leaseId}'::uuid`)).toBe("1");

    const [raceA, raceB] = await Promise.all([
      other.manager.client.rpc("decide_lease_renewal", { p_request_id: staffCreated.data, p_decision: "APPROVED", p_reason: "Concurrent A" }),
      other.manager.client.rpc("decide_lease_renewal", { p_request_id: staffCreated.data, p_decision: "APPROVED", p_reason: "Concurrent B" }),
    ]);
    expect(raceA.error, raceA.error?.message).toBeNull();
    expect(raceB.error, raceB.error?.message).toBeNull();
    expect(dbQuery(`select count(*) from public.unit_leases where renewed_from_lease_id = '${other.leaseId}'::uuid`)).toBe("1");

    const earlyGeneration = await (admin as unknown as LooseClient).rpc("generate_lease_rent_dues", {
      p_organization_id: enabled.orgId,
      p_lease_id: approvedRequest.data!.successor_lease_id,
      p_period: "2027-01",
      p_issue_date: "2027-01-01",
    });
    expect(earlyGeneration.error?.message).toBe("LEASE_RENT_NOT_STARTED");
    expect(dbQuery(`select count(*) from public.dues where source_id = '${approvedRequest.data!.successor_lease_id}'::uuid`)).toBe("0");

    const conflictRequest = await conflict.tenant.client.rpc("request_lease_renewal", requestArgs(conflict.leaseId));
    expect(conflictRequest.error).toBeNull();
    const [approve, reject] = await Promise.all([
      conflict.manager.client.rpc("decide_lease_renewal", {
        p_request_id: conflictRequest.data, p_decision: "APPROVED", p_reason: "Approve race",
      }),
      conflict.manager.client.rpc("decide_lease_renewal", {
        p_request_id: conflictRequest.data, p_decision: "REJECTED", p_reason: "Reject race",
      }),
    ]);
    expect([approve.error, reject.error].filter((error) => error === null)).toHaveLength(1);
    expect([approve.error, reject.error].filter((error) => error?.message === "LEASE_RENEWAL_INVALID_STATE")).toHaveLength(1);
    const finalState = dbQuery(`select status from public.lease_renewal_requests where id = '${conflictRequest.data}'::uuid`);
    expect(["APPROVED", "REJECTED"]).toContain(finalState);
    expect(dbQuery(`select count(*) from public.lease_renewal_transitions where renewal_request_id = '${conflictRequest.data}'::uuid`)).toBe("2");
    expect(dbQuery(`select count(*) from public.unit_leases where renewed_from_lease_id = '${conflict.leaseId}'::uuid`))
      .toBe(finalState === "APPROVED" ? "1" : "0");
  });

  it("limits property-scoped staff while preserving organization-wide assignments", async () => {
    const sourceLease = await (admin as unknown as LooseClient)
      .from("unit_leases")
      .select("due_type_id,receivable_account_id,rent_amount,rent_frequency,security_deposit_amount,billing_recipient")
      .eq("id", enabled.leaseId)
      .single();
    expect(sourceLease.error).toBeNull();

    const suffix = randomUUID().slice(0, 8);
    const propertyB = await admin.from("properties").insert({
      organization_id: enabled.orgId,
      name: "Renewal Property B",
      code: `RN-B-${suffix}`,
      timezone: "Africa/Cairo",
      property_type: "resort",
    }).select("id").single();
    expect(propertyB.error).toBeNull();
    const unitB = await admin.from("units").insert({
      organization_id: enabled.orgId,
      property_id: propertyB.data!.id,
      code: `RN-B-${suffix}`,
    }).select("id").single();
    expect(unitB.error).toBeNull();
    const leaseB = await (admin as unknown as LooseClient).from("unit_leases").insert({
      organization_id: enabled.orgId,
      property_id: propertyB.data!.id,
      unit_id: unitB.data!.id,
      tenant_member_id: enabled.tenant.memberId,
      due_type_id: sourceLease.data!.due_type_id,
      receivable_account_id: sourceLease.data!.receivable_account_id,
      status: "ACTIVE",
      starts_on: "2026-01-01",
      ends_on: "2026-12-31",
      rent_amount: sourceLease.data!.rent_amount,
      rent_frequency: sourceLease.data!.rent_frequency,
      security_deposit_amount: sourceLease.data!.security_deposit_amount,
      billing_recipient: sourceLease.data!.billing_recipient,
    }).select("id").single();
    expect(leaseB.error).toBeNull();

    expect((await enabled.scopedManager.client.from("lease_renewal_requests").select("id").eq("id", requestId)).data)
      .toEqual([{ id: requestId }]);
    const inScopeCreate = await enabled.scopedManager.client.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(inScopeCreate.error).toBeNull();
    expect(inScopeCreate.data).toBe(requestId);
    const inScopeDecision = await enabled.scopedManager.client.rpc("decide_lease_renewal", {
      p_request_id: requestId, p_decision: "APPROVED", p_reason: null,
    });
    expect(inScopeDecision.error).toBeNull();

    const bookingB = await enabled.tenant.client.rpc("request_lease_renewal", requestArgs(leaseB.data!.id));
    expect(bookingB.error).toBeNull();
    expect((await enabled.scopedManager.client.from("lease_renewal_requests").select("id").eq("id", bookingB.data)).data).toEqual([]);

    const missingCreate = await enabled.scopedManager.client.rpc("request_lease_renewal", requestArgs(randomUUID()));
    const crossPropertyCreate = await enabled.scopedManager.client.rpc("request_lease_renewal", requestArgs(leaseB.data!.id));
    expect(missingCreate.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect(crossPropertyCreate.error?.message).toBe(missingCreate.error?.message);

    const missingDecision = await enabled.scopedManager.client.rpc("decide_lease_renewal", {
      p_request_id: randomUUID(), p_decision: "REJECTED", p_reason: "Out of scope",
    });
    const crossPropertyDecision = await enabled.scopedManager.client.rpc("decide_lease_renewal", {
      p_request_id: bookingB.data, p_decision: "REJECTED", p_reason: "Out of scope",
    });
    expect(missingDecision.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect(crossPropertyDecision.error?.message).toBe(missingDecision.error?.message);

    expect((await enabled.manager.client.from("lease_renewal_requests").select("id").eq("id", bookingB.data)).data)
      .toEqual([{ id: bookingB.data }]);

    const overlap = await (admin as unknown as LooseClient).from("unit_leases").insert({
      organization_id: enabled.orgId,
      property_id: propertyB.data!.id,
      unit_id: unitB.data!.id,
      tenant_member_id: enabled.tenant.memberId,
      due_type_id: sourceLease.data!.due_type_id,
      receivable_account_id: sourceLease.data!.receivable_account_id,
      status: "ACTIVE",
      starts_on: "2027-01-01",
      ends_on: "2027-12-31",
      rent_amount: sourceLease.data!.rent_amount,
      rent_frequency: sourceLease.data!.rent_frequency,
      security_deposit_amount: sourceLease.data!.security_deposit_amount,
      billing_recipient: sourceLease.data!.billing_recipient,
    }).select("id").single();
    expect(overlap.error).toBeNull();
    const blockedApproval = await enabled.manager.client.rpc("decide_lease_renewal", {
      p_request_id: bookingB.data, p_decision: "APPROVED", p_reason: "Overlap should roll back",
    });
    expect(blockedApproval.error?.message).toBe("LEASE_RENEWAL_INVALID_STATE");
    expect(dbQuery(`select status, successor_lease_id is null from public.lease_renewal_requests where id = '${bookingB.data}'::uuid`))
      .toBe("REQUESTED|t");
    expect(dbQuery(`select count(*) from public.lease_renewal_transitions where renewal_request_id = '${bookingB.data}'::uuid`)).toBe("1");
    expect((await (admin as unknown as LooseClient).from("unit_leases").delete().eq("id", overlap.data!.id)).error).toBeNull();

    const organizationWideDecision = await enabled.manager.client.rpc("decide_lease_renewal", {
      p_request_id: bookingB.data, p_decision: "REJECTED", p_reason: "Organization-wide review",
    });
    expect(organizationWideDecision.error).toBeNull();
  });

  it("keeps missing and cross-tenant resources indistinguishable", async () => {
    expect((await other.manager.client.from("lease_renewal_requests").select("id").eq("id", requestId)).data).toEqual([]);
    const missingDecision = await other.manager.client.rpc("decide_lease_renewal", { p_request_id: randomUUID(), p_decision: "REJECTED", p_reason: "No" });
    const crossDecision = await other.manager.client.rpc("decide_lease_renewal", { p_request_id: requestId, p_decision: "REJECTED", p_reason: "No" });
    expect(missingDecision.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect(crossDecision.error?.message).toBe(missingDecision.error?.message);
    const missingCreate = await other.tenant.client.rpc("request_lease_renewal", requestArgs(randomUUID()));
    const crossCreate = await other.tenant.client.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(missingCreate.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect(crossCreate.error?.message).toBe(missingCreate.error?.message);
  });

  it("enforces expiry-dispatch idempotency at the database boundary", async () => {
    const db = admin as unknown as LooseClient;
    const row = {
      organization_id: enabled.orgId,
      lease_id: enabled.leaseId,
      lease_ends_on: "2026-12-31",
      threshold_days: 90,
      recipient_user_id: enabled.tenant.userId,
      recipient_member_id: enabled.tenant.memberId,
    };
    expect((await db.from("lease_expiry_dispatches").insert(row)).error).toBeNull();
    expect((await db.from("lease_expiry_dispatches").insert(row)).error?.message).toMatch(/duplicate key|unique constraint/i);
  });

  it("blocks STARTER, anon, and suspended organizations at the database boundary", async () => {
    const starterResult = await starter.tenant.client.rpc("request_lease_renewal", requestArgs(starter.leaseId));
    expect(starterResult.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect((await starter.manager.client.from("lease_renewal_requests").select("id")).data).toEqual([]);

    const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const anonResult = await anon.rpc("request_lease_renewal", requestArgs(enabled.leaseId));
    expect(anonResult.error).not.toBeNull();

    expect((await admin.from("organizations").update({ status: "SUSPENDED" }).eq("id", other.orgId)).error).toBeNull();
    const suspended = await other.tenant.client.rpc("request_lease_renewal", requestArgs(other.leaseId));
    expect(suspended.error?.message).toBe("LEASE_RENEWAL_NOT_FOUND");
    expect((await other.manager.client.from("lease_renewal_requests").select("id")).data).toEqual([]);
  });

  it("promotes due scheduled successors once and ends their source leases", async () => {
    const successorId = dbQuery(`select successor_lease_id from public.lease_renewal_requests where id = '${requestId}'::uuid`);
    expect(dbQuery(`select status from public.unit_leases where id = '${successorId}'::uuid`)).toBe("SCHEDULED");

    const promoted = await (admin as unknown as LooseClient).rpc("promote_scheduled_lease_renewals", {
      p_as_of_date: "2027-01-01",
    });
    const replayed = await (admin as unknown as LooseClient).rpc("promote_scheduled_lease_renewals", {
      p_as_of_date: "2027-01-01",
    });
    expect((promoted.data as { promoted: number }).promoted).toBeGreaterThan(0);
    expect(replayed.data).toEqual({ promoted: 0 });
    expect(dbQuery(`select status from public.unit_leases where id = '${enabled.leaseId}'::uuid`)).toBe("ENDED");
    expect(dbQuery(`select status from public.unit_leases where id = '${successorId}'::uuid`)).toBe("ACTIVE");
  });
});
