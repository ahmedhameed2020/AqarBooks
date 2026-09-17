import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;
type LooseClient = ReturnType<typeof createClient>;
type Env = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
type Actor = { userId: string; email: string; client: LooseClient };
type MemberActor = Actor & { memberId: string };

const PASSWORD = "Lease_Expiry_Alerts_2026!";
const AS_OF = "2027-01-01";

function localEnv(): Env {
  const output = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) values[match[1]] = match[2];
  }
  if (!values.API_URL?.match(/^http:\/\/(127\.0\.0\.1|localhost):/)) {
    throw new Error("Lease expiry runtime gate must use local Supabase.");
  }
  return { API_URL: values.API_URL, ANON_KEY: values.ANON_KEY, SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY };
}

async function signIn(env: Env, email: string) {
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error).toBeNull();
  return client;
}

async function actor(admin: Client, env: Env, label: string): Promise<Actor> {
  const email = `expiry-${label}-${randomUUID()}@aqarbooks-test.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  return { userId: created.data.user!.id, email, client: await signIn(env, email) };
}

async function member(admin: Client, env: Env, orgId: string, label: string): Promise<MemberActor> {
  const user = await actor(admin, env, label);
  const row = await admin.from("members").insert({
    organization_id: orgId, full_name: `Expiry ${label}`, email: user.email, user_id: user.userId,
  }).select("id").single();
  expect(row.error).toBeNull();
  return { ...user, memberId: row.data!.id };
}

async function assignStaff(
  admin: Client,
  env: Env,
  orgId: string,
  propertyId: string | null,
  label: string,
) {
  const user = await actor(admin, env, label);
  expect((await admin.from("organization_memberships").insert({
    organization_id: orgId, user_id: user.userId, status: "active",
  })).error).toBeNull();
  const role = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", "PROPERTY_MANAGER").single();
  expect(role.error).toBeNull();
  expect((await admin.from("user_role_assignments").insert({
    organization_id: orgId, user_id: user.userId, role_id: role.data!.id, property_id: propertyId,
  })).error).toBeNull();
  return user;
}

describe.sequential("lease expiry alerts runtime gate", () => {
  let env: Env;
  let admin: Client;
  let orgId: string;
  let propertyA: string;
  let propertyB: string;
  let tenant: MemberActor;
  let owner: MemberActor;
  let formerOwner: MemberActor;
  let staffA: Actor;
  let staffB: Actor;
  let orgStaff: Actor;
  let otherTenant: MemberActor;
  let dueTypeId: string;
  let receivableId: string;
  const leaseIds: Record<number, string> = {};
  const userIds: string[] = [];
  const orgIds: string[] = [];

  async function createLease(days: number, propertyId = propertyA) {
    const suffix = randomUUID().slice(0, 8);
    const unit = await admin.from("units").insert({ organization_id: orgId, property_id: propertyId, code: `EXP-${suffix}` }).select("id").single();
    expect(unit.error).toBeNull();
    if (propertyId === propertyA) {
      expect((await admin.from("unit_ownerships").insert([
        { organization_id: orgId, unit_id: unit.data!.id, member_id: owner.memberId, share_percentage: 100, start_date: "2025-01-01" },
        { organization_id: orgId, unit_id: unit.data!.id, member_id: formerOwner.memberId, share_percentage: 100, start_date: "2020-01-01", end_date: "2024-12-31" },
      ])).error).toBeNull();
    }
    const end = new Date(`${AS_OF}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days);
    const lease = await (admin as unknown as LooseClient).from("unit_leases").insert({
      organization_id: orgId, property_id: propertyId, unit_id: unit.data!.id,
      tenant_member_id: tenant.memberId, due_type_id: dueTypeId, receivable_account_id: receivableId,
      status: "ACTIVE", starts_on: "2026-01-01", ends_on: end.toISOString().slice(0, 10),
      rent_amount: 12000, rent_frequency: "MONTHLY", security_deposit_amount: 0, billing_recipient: "TENANT",
    }).select("id").single();
    expect(lease.error).toBeNull();
    leaseIds[days] = lease.data!.id;
    return lease.data!.id as string;
  }

  beforeAll(async () => {
    env = localEnv();
    admin = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const suffix = randomUUID().slice(0, 8);
    const org = await admin.from("organizations").insert({
      name: "Expiry Alerts", slug: `expiry-alerts-${suffix}`, default_currency: "EGP", status: "ACTIVE",
    }).select("id").single();
    expect(org.error).toBeNull();
    orgId = org.data!.id;
    orgIds.push(orgId);
    expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId })).error).toBeNull();
    const plan = await admin.from("plans").select("id").eq("key", "PROFESSIONAL").single();
    expect((await admin.from("subscriptions").insert({ organization_id: orgId, plan_id: plan.data!.id, status: "ACTIVE" })).error).toBeNull();
    const properties = await admin.from("properties").insert([
      { organization_id: orgId, name: "Property A", code: `EA-${suffix}`, timezone: "Africa/Cairo", property_type: "resort" },
      { organization_id: orgId, name: "Property B", code: `EB-${suffix}`, timezone: "Africa/Cairo", property_type: "resort" },
    ]).select("id,code");
    expect(properties.error).toBeNull();
    propertyA = properties.data!.find((p) => p.code.startsWith("EA-"))!.id;
    propertyB = properties.data!.find((p) => p.code.startsWith("EB-"))!.id;
    tenant = await member(admin, env, orgId, "tenant");
    owner = await member(admin, env, orgId, "owner");
    formerOwner = await member(admin, env, orgId, "former-owner");
    staffA = await assignStaff(admin, env, orgId, propertyA, "staff-a");
    staffB = await assignStaff(admin, env, orgId, propertyB, "staff-b");
    orgStaff = await assignStaff(admin, env, orgId, null, "org-staff");
    userIds.push(tenant.userId, owner.userId, formerOwner.userId, staffA.userId, staffB.userId, orgStaff.userId);

    const otherOrg = await admin.from("organizations").insert({
      name: "Other Expiry Org", slug: `other-expiry-${suffix}`, default_currency: "EGP", status: "ACTIVE",
    }).select("id").single();
    expect(otherOrg.error).toBeNull();
    orgIds.push(otherOrg.data!.id);
    otherTenant = await member(admin, env, otherOrg.data!.id, "other-tenant");
    userIds.push(otherTenant.userId);

    const receivable = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code: `110-${suffix}`, name_ar: "ذمم إيجار", name_en: "Rent receivable", category: "ASSET", normal_balance: "DEBIT",
    }).select("id").single();
    const revenue = await admin.from("chart_of_accounts").insert({
      organization_id: orgId, code: `410-${suffix}`, name_ar: "إيراد إيجار", name_en: "Rent revenue", category: "REVENUE", normal_balance: "CREDIT",
    }).select("id").single();
    expect(receivable.error).toBeNull();
    expect(revenue.error).toBeNull();
    receivableId = receivable.data!.id;
    const dueType = await admin.from("due_types").insert({
      organization_id: orgId, name_ar: "إيجار", name_en: "Rent", default_revenue_account_id: revenue.data!.id,
    }).select("id").single();
    expect(dueType.error).toBeNull();
    dueTypeId = dueType.data!.id;
    await Promise.all([createLease(90), createLease(60), createLease(30), createLease(91)]);
  }, 120_000);

  afterAll(async () => {
    const db = admin as unknown as LooseClient;
    for (const id of orgIds) {
      await db.from("notifications").delete().eq("organization_id", id);
      await db.from("lease_expiry_dispatches").delete().eq("organization_id", id);
      await db.from("unit_leases").delete().eq("organization_id", id);
      await admin.from("unit_ownerships").delete().eq("organization_id", id);
      await admin.from("units").delete().eq("organization_id", id);
      await admin.from("due_types").delete().eq("organization_id", id);
      await admin.from("chart_of_accounts").delete().eq("organization_id", id);
      await admin.from("members").delete().eq("organization_id", id);
      await admin.from("user_role_assignments").delete().eq("organization_id", id);
      await admin.from("organization_memberships").delete().eq("organization_id", id);
      await admin.from("properties").delete().eq("organization_id", id);
      await admin.from("subscriptions").delete().eq("organization_id", id);
      await admin.from("roles").delete().eq("organization_id", id);
      await admin.from("organizations").delete().eq("id", id);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 120_000);

  it("dispatches exactly at 90, 60, and 30 days with scoped recipients and safe content", async () => {
    const result = await (admin as unknown as LooseClient).rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF });
    expect(result.error, result.error?.message).toBeNull();
    const dispatches = await (admin as unknown as LooseClient).from("lease_expiry_dispatches")
      .select("lease_id,threshold_days,recipient_user_id").eq("organization_id", orgId);
    expect(dispatches.error).toBeNull();
    expect(new Set(dispatches.data!.map((d: { threshold_days: number }) => d.threshold_days))).toEqual(new Set([90, 60, 30]));
    expect(dispatches.data!.some((d: { lease_id: string }) => d.lease_id === leaseIds[91])).toBe(false);
    const lease90Recipients = dispatches.data!.filter((d: { lease_id: string }) => d.lease_id === leaseIds[90]).map((d: { recipient_user_id: string }) => d.recipient_user_id);
    expect(new Set(lease90Recipients)).toEqual(new Set([tenant.userId, owner.userId, staffA.userId, orgStaff.userId]));
    expect(lease90Recipients).not.toContain(formerOwner.userId);
    expect(lease90Recipients).not.toContain(staffB.userId);

    const notifications = await (admin as unknown as LooseClient).from("notifications")
      .select("type,source_type,title_ar,title_en,body_ar,body_en,recipient_user_id").eq("organization_id", orgId);
    expect(notifications.error).toBeNull();
    expect(notifications.data).toHaveLength(dispatches.data!.length);
    for (const notification of notifications.data!) {
      expect(notification.type).toBe("LEASE_EXPIRY_REMINDER");
      expect(notification.source_type).toBe("lease_expiry_dispatch");
      expect(JSON.stringify(notification)).not.toMatch(/12000|Expiry tenant|@aqarbooks-test|internal|reason/i);
    }
  });

  it("is idempotent across retries and genuinely concurrent runs", async () => {
    const db = admin as unknown as LooseClient;
    const before = await db.from("lease_expiry_dispatches").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    const replay = await db.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF });
    expect(replay.error).toBeNull();
    const afterReplay = await db.from("lease_expiry_dispatches").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(afterReplay.count).toBe(before.count);

    const racedDispatch = await db.from("lease_expiry_dispatches")
      .select("id,lease_id,lease_ends_on,threshold_days,recipient_user_id")
      .eq("lease_id", leaseIds[60])
      .eq("recipient_user_id", tenant.userId)
      .single();
    expect(racedDispatch.error).toBeNull();
    await db.from("notifications").delete().eq("source_id", racedDispatch.data!.id);
    await db.from("lease_expiry_dispatches").delete().eq("id", racedDispatch.data!.id);

    const [first, second] = await Promise.all([
      db.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF }),
      db.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF }),
    ]);
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    const after = await db.from("lease_expiry_dispatches").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(after.count).toBe(before.count);
    const racedRows = await db.from("lease_expiry_dispatches")
      .select("id", { count: "exact", head: true })
      .eq("lease_id", racedDispatch.data!.lease_id)
      .eq("lease_ends_on", racedDispatch.data!.lease_ends_on)
      .eq("threshold_days", racedDispatch.data!.threshold_days)
      .eq("recipient_user_id", racedDispatch.data!.recipient_user_id);
    expect(racedRows.count).toBe(1);
    const notifications = await db.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(notifications.count).toBe(after.count);
  });

  it("keeps recipient reads and missing or cross-tenant mutations private", async () => {
    expect((await tenant.client.from("notifications").select("id").eq("organization_id", orgId)).data!.length).toBeGreaterThan(0);
    expect((await staffB.client.from("notifications").select("id").eq("organization_id", orgId)).data).toEqual([]);
    const tenantNotification = await (admin as unknown as LooseClient).from("notifications").select("id").eq("recipient_user_id", tenant.userId).limit(1).single();
    const missing = await tenant.client.rpc("mark_notification_read", { p_notification_id: randomUUID() });
    const cross = await otherTenant.client.rpc("mark_notification_read", { p_notification_id: tenantNotification.data!.id });
    expect(missing.error?.message).toBe("NOTIFICATION_NOT_FOUND");
    expect(cross.error?.message).toBe(missing.error?.message);
    expect((await otherTenant.client.from("notifications").select("id").eq("organization_id", orgId)).data).toEqual([]);
  });

  it("skips STARTER and suspended organizations", async () => {
    const db = admin as unknown as LooseClient;
    await db.from("notifications").delete().eq("organization_id", orgId);
    await db.from("lease_expiry_dispatches").delete().eq("organization_id", orgId);
    const starter = await admin.from("plans").select("id").eq("key", "STARTER").single();
    const professional = await admin.from("plans").select("id").eq("key", "PROFESSIONAL").single();
    expect(starter.error).toBeNull();
    expect(professional.error).toBeNull();

    expect((await admin.from("subscriptions").update({ plan_id: starter.data!.id }).eq("organization_id", orgId)).error).toBeNull();
    expect((await db.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF })).error).toBeNull();
    expect((await db.from("lease_expiry_dispatches").select("id", { count: "exact", head: true }).eq("organization_id", orgId)).count).toBe(0);

    expect((await admin.from("subscriptions").update({ plan_id: professional.data!.id }).eq("organization_id", orgId)).error).toBeNull();
    expect((await admin.from("organizations").update({ status: "SUSPENDED" }).eq("id", orgId)).error).toBeNull();
    expect((await db.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF })).error).toBeNull();
    expect((await db.from("lease_expiry_dispatches").select("id", { count: "exact", head: true }).eq("organization_id", orgId)).count).toBe(0);
    expect((await admin.from("organizations").update({ status: "ACTIVE" }).eq("id", orgId)).error).toBeNull();
  });

  it("rejects anon and authenticated callers from invoking the sweep", async () => {
    const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    expect((await anon.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF })).error).not.toBeNull();
    expect((await tenant.client.rpc("run_lease_expiry_alerts", { p_as_of_date: AS_OF })).error).not.toBeNull();
  });
});
