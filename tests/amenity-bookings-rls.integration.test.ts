import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../lib/supabase/types";

type Client = SupabaseClient<Database>;
type LocalEnv = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
type Actor = { userId: string; email: string; client: Client };
type MemberActor = Actor & { memberId: string };
type Fixture = { orgId: string; propertyId: string; unitAId: string; unitBId: string; formerUnitId: string; memberA: MemberActor; memberB: MemberActor; manager: Actor; viewer: Actor };
const PASSWORD = "Amenity_RLS_Test_P@ssw0rd_2026!";

function localEnv(): LocalEnv {
  const output = execFileSync("supabase", ["status", "-o", "env"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match) env[match[1]] = match[2];
  }
  if (!env.API_URL?.startsWith("http://127.0.0.1:") && !env.API_URL?.startsWith("http://localhost:")) throw new Error("Amenity RLS gate must run against local Supabase.");
  return { API_URL: env.API_URL, ANON_KEY: env.ANON_KEY, SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY };
}

function dbQuery(sql: string) {
  return execFileSync("docker", ["exec", "supabase_db_aqarbooks", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "|", "-c", sql], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function expectRejected(error: { message: string } | null, context: string) {
  expect(error, context).not.toBeNull();
  if (["AMENITY_NOT_AUTHORIZED", "UNIT_NOT_AUTHORIZED", "AMENITY_BOOKING_NOT_AUTHORIZED"].includes(error!.message)) return;
  expect(error!.message).toMatch(/row-level security|permission denied|not authorized|not_authenticated|forbidden|not_entitled|not_found|unavailable|invalid/i);
}

async function signedIn(env: LocalEnv, email: string) {
  const client = createClient<Database>(env.API_URL, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return client;
}

async function authUser(admin: Client, label: string) {
  const email = `amenity-${label}-${randomUUID()}@aqarbooks-test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(error).toBeNull();
  return { userId: data.user!.id, email };
}

async function memberActor(admin: Client, env: LocalEnv, orgId: string, label: string): Promise<MemberActor> {
  const actor = await authUser(admin, label);
  const { data, error } = await admin.from("members").insert({ organization_id: orgId, full_name: `Amenity ${label}`, email: actor.email, user_id: actor.userId }).select("id").single();
  expect(error).toBeNull();
  return { ...actor, memberId: data!.id, client: await signedIn(env, actor.email) };
}

async function staffActor(admin: Client, env: LocalEnv, orgId: string, roleKey: "PROPERTY_MANAGER" | "VIEWER", label: string): Promise<Actor> {
  const actor = await authUser(admin, label);
  expect((await admin.from("organization_memberships").insert({ organization_id: orgId, user_id: actor.userId, status: "active" })).error).toBeNull();
  const { data: role, error } = await admin.from("roles").select("id").eq("organization_id", orgId).eq("key", roleKey).single();
  expect(error).toBeNull();
  expect((await admin.from("user_role_assignments").insert({ user_id: actor.userId, role_id: role!.id, organization_id: orgId })).error).toBeNull();
  return { ...actor, client: await signedIn(env, actor.email) };
}

async function fixture(admin: Client, env: LocalEnv, label: string, planKey: "PROFESSIONAL" | "STARTER"): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const { data: org, error: orgError } = await admin.from("organizations").insert({ name: `Amenity ${label}`, slug: `amenity-${label.toLowerCase()}-${suffix}`, default_currency: "EGP", status: "ACTIVE" }).select("id").single();
  expect(orgError).toBeNull();
  expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id })).error).toBeNull();
  const { data: plan } = await admin.from("plans").select("id").eq("key", planKey).single();
  expect((await admin.from("subscriptions").insert({ organization_id: org!.id, plan_id: plan!.id, status: "ACTIVE" })).error).toBeNull();
  const { data: property, error: propertyError } = await admin.from("properties").insert({ organization_id: org!.id, name: `Amenity Property ${label}`, code: `AM-${suffix}`, timezone: "Africa/Cairo", property_type: "resort" }).select("id").single();
  expect(propertyError).toBeNull();
  const [unitA, unitB, formerUnit] = await Promise.all([
    admin.from("units").insert({ organization_id: org!.id, property_id: property!.id, code: `A-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: org!.id, property_id: property!.id, code: `B-${suffix}` }).select("id").single(),
    admin.from("units").insert({ organization_id: org!.id, property_id: property!.id, code: `OLD-${suffix}` }).select("id").single(),
  ]);
  expect(unitA.error).toBeNull(); expect(unitB.error).toBeNull(); expect(formerUnit.error).toBeNull();
  const memberA = await memberActor(admin, env, org!.id, `${label}-a`);
  const memberB = await memberActor(admin, env, org!.id, `${label}-b`);
  expect((await admin.from("unit_ownerships").insert([
    { organization_id: org!.id, unit_id: unitA.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: org!.id, unit_id: unitB.data!.id, member_id: memberB.memberId, share_percentage: 100, start_date: "2020-01-01" },
    { organization_id: org!.id, unit_id: formerUnit.data!.id, member_id: memberA.memberId, share_percentage: 100, start_date: "2018-01-01", end_date: "2019-01-01" },
  ])).error).toBeNull();
  return { orgId: org!.id, propertyId: property!.id, unitAId: unitA.data!.id, unitBId: unitB.data!.id, formerUnitId: formerUnit.data!.id, memberA, memberB, manager: await staffActor(admin, env, org!.id, "PROPERTY_MANAGER", `${label}-manager`), viewer: await staffActor(admin, env, org!.id, "VIEWER", `${label}-viewer`) };
}

describe.sequential("amenity booking runtime Supabase/PostgreSQL RLS gate", () => {
  let env: LocalEnv; let admin: Client; let enabled: Fixture; let disabled: Fixture; let amenityId: string; let bookingId: string;
  const orgIds: string[] = []; const userIds: string[] = [];

  beforeAll(async () => {
    env = localEnv();
    admin = createClient<Database>(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    enabled = await fixture(admin, env, "Enabled", "PROFESSIONAL");
    disabled = await fixture(admin, env, "Disabled", "STARTER");
    for (const f of [enabled, disabled]) { orgIds.push(f.orgId); userIds.push(f.memberA.userId, f.memberB.userId, f.manager.userId, f.viewer.userId); }
  }, 120_000);

  afterAll(async () => {
    for (const orgId of orgIds) {
      await admin.from("notifications").delete().eq("organization_id", orgId);
      await admin.from("amenity_bookings").delete().eq("organization_id", orgId);
      await admin.from("amenities").delete().eq("organization_id", orgId);
      await admin.from("unit_ownerships").delete().eq("organization_id", orgId);
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

  it("installs SELECT-only tables and narrow RPC grants", () => {
    expect(dbQuery(`select has_table_privilege('authenticated','public.amenities','select'), has_table_privilege('authenticated','public.amenities','insert'), has_table_privilege('authenticated','public.amenity_bookings','select'), has_table_privilege('authenticated','public.amenity_bookings','insert'), has_function_privilege('anon','public.create_amenity_booking(uuid,uuid,timestamp without time zone,text)','execute'), has_function_privilege('authenticated','public.create_amenity_booking(uuid,uuid,timestamp without time zone,text)','execute'), has_function_privilege('authenticated','public.notify_amenity_booking_lifecycle()','execute')`)).toBe("t|f|t|f|f|t|f");
  });

  it("lets managers create amenities while owners can only read entitled property amenities", async () => {
    const created = await enabled.manager.client.rpc("create_amenity", { p_property_id: enabled.propertyId, p_name_ar: "حمام السباحة", p_name_en: "Swimming Pool", p_capacity: 20, p_slot_minutes: 60, p_opens_at: "08:00", p_closes_at: "22:00", p_max_advance_days: 30, p_requires_approval: true });
    expect(created.error, created.error?.message).toBeNull(); amenityId = created.data!;
    expect((await enabled.memberA.client.from("amenities").select("id").eq("id", amenityId)).data).toEqual([{ id: amenityId }]);
    const viewerCreate = await enabled.viewer.client.rpc("create_amenity", { p_property_id: enabled.propertyId, p_name_ar: "قاعة", p_name_en: "Hall", p_capacity: 10, p_slot_minutes: 60, p_opens_at: "08:00", p_closes_at: "22:00", p_max_advance_days: 30, p_requires_approval: false });
    expectRejected(viewerCreate.error, "view-only staff cannot create amenities");
    expect((await disabled.memberA.client.from("amenities").select("id")).data).toEqual([]);
  });

  it("enforces current unit ownership and serializes overlapping slots", async () => {
    const localStart = `${new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)}T10:00:00`;
    const created = await enabled.memberA.client.rpc("create_amenity_booking", { p_amenity_id: amenityId, p_unit_id: enabled.unitAId, p_local_starts_at: localStart, p_member_note: "Window seat" });
    expect(created.error, created.error?.message).toBeNull(); bookingId = created.data!;
    const otherUnit = await enabled.memberA.client.rpc("create_amenity_booking", { p_amenity_id: amenityId, p_unit_id: enabled.unitBId, p_local_starts_at: `${localStart.slice(0, 11)}12:00:00`, p_member_note: null });
    expectRejected(otherUnit.error, "owner cannot book using another owner's unit");
    const overlap = await enabled.memberB.client.rpc("create_amenity_booking", { p_amenity_id: amenityId, p_unit_id: enabled.unitBId, p_local_starts_at: localStart, p_member_note: null });
    expectRejected(overlap.error, "overlapping slot must be unavailable");
    const directInsert = await enabled.memberA.client.from("amenity_bookings").insert({ organization_id: enabled.orgId, property_id: enabled.propertyId, amenity_id: amenityId, unit_id: enabled.unitAId, member_id: enabled.memberA.memberId, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), created_by: enabled.memberA.userId });
    expectRejected(directInsert.error, "direct booking insert must be denied");
    expect((await enabled.memberB.client.from("amenity_bookings").select("id").eq("id", bookingId)).data).toEqual([]);
  });

  it("excludes ended ownerships from the current booking-unit query", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await enabled.memberA.client.from("unit_ownerships").select("unit_id").eq("organization_id", enabled.orgId).eq("member_id", enabled.memberA.memberId).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`);
    expect(result.error).toBeNull();
    expect(result.data?.map((row) => row.unit_id)).toContain(enabled.unitAId);
    expect(result.data?.map((row) => row.unit_id)).not.toContain(enabled.formerUnitId);
  });

  it("does not reveal whether amenity resources exist across authorization boundaries", async () => {
    const missingId = randomUUID();
    const amenityArgs = {
      p_name_ar: "مرفق مخفي",
      p_name_en: "Hidden amenity",
      p_capacity: 1,
      p_slot_minutes: 60,
      p_opens_at: "08:00",
      p_closes_at: "22:00",
      p_max_advance_days: 30,
      p_requires_approval: false,
    };
    const updateArgs = {
      p_name_ar: "مرفق",
      p_name_en: "Amenity",
      p_capacity: 1,
      p_slot_minutes: 60,
      p_opens_at: "08:00",
      p_closes_at: "22:00",
      p_max_advance_days: 30,
      p_requires_approval: false,
      p_is_active: true,
    };

    const createExisting = await disabled.manager.client.rpc("create_amenity", { p_property_id: enabled.propertyId, ...amenityArgs });
    const createMissing = await disabled.manager.client.rpc("create_amenity", { p_property_id: missingId, ...amenityArgs });
    expect(createExisting.error?.message).toBe("AMENITY_NOT_AUTHORIZED");
    expect(createMissing.error?.message).toBe(createExisting.error?.message);

    const updateExisting = await disabled.manager.client.rpc("update_amenity", { p_amenity_id: amenityId, ...updateArgs });
    const updateMissing = await disabled.manager.client.rpc("update_amenity", { p_amenity_id: missingId, ...updateArgs });
    expect(updateExisting.error?.message).toBe("AMENITY_NOT_AUTHORIZED");
    expect(updateMissing.error?.message).toBe(updateExisting.error?.message);

    const activeExisting = await disabled.manager.client.rpc("set_amenity_active", { p_amenity_id: amenityId, p_is_active: false });
    const activeMissing = await disabled.manager.client.rpc("set_amenity_active", { p_amenity_id: missingId, p_is_active: false });
    expect(activeExisting.error?.message).toBe("AMENITY_NOT_AUTHORIZED");
    expect(activeMissing.error?.message).toBe(activeExisting.error?.message);

    const bookingExisting = await disabled.memberA.client.rpc("create_amenity_booking", { p_amenity_id: amenityId, p_unit_id: disabled.unitAId, p_local_starts_at: "2030-01-01T10:00:00", p_member_note: null });
    const bookingMissing = await disabled.memberA.client.rpc("create_amenity_booking", { p_amenity_id: missingId, p_unit_id: disabled.unitAId, p_local_starts_at: "2030-01-01T10:00:00", p_member_note: null });
    expect(bookingExisting.error?.message).toBe("AMENITY_BOOKING_NOT_AUTHORIZED");
    expect(bookingMissing.error?.message).toBe(bookingExisting.error?.message);

    const decideExisting = await disabled.manager.client.rpc("decide_amenity_booking", { p_booking_id: bookingId, p_decision: "CONFIRMED", p_staff_note: null });
    const decideMissing = await disabled.manager.client.rpc("decide_amenity_booking", { p_booking_id: missingId, p_decision: "CONFIRMED", p_staff_note: null });
    expect(decideExisting.error?.message).toBe("AMENITY_BOOKING_NOT_AUTHORIZED");
    expect(decideMissing.error?.message).toBe(decideExisting.error?.message);
  });

  it("lets only managing staff decide and emits an owner-scoped lifecycle notification", async () => {
    expectRejected((await enabled.viewer.client.rpc("decide_amenity_booking", { p_booking_id: bookingId, p_decision: "CONFIRMED", p_staff_note: null })).error, "viewer cannot decide");
    const decided = await enabled.manager.client.rpc("decide_amenity_booking", { p_booking_id: bookingId, p_decision: "CONFIRMED", p_staff_note: "Approved" });
    expect(decided.error, decided.error?.message).toBeNull();
    expect((await enabled.memberA.client.from("amenity_bookings").select("status").eq("id", bookingId).single()).data?.status).toBe("CONFIRMED");
    const notifications = await enabled.memberA.client.from("notifications").select("type, source_id").eq("source_id", bookingId).eq("type", "AMENITY_BOOKING_CONFIRMED");
    expect(notifications.data).toEqual([{ type: "AMENITY_BOOKING_CONFIRMED", source_id: bookingId }]);
  });

  it("serializes amenity deactivation against booking creation", async () => {
    const suffix = randomUUID().slice(0, 8);
    const amenity = await enabled.manager.client.rpc("create_amenity", {
      p_property_id: enabled.propertyId,
      p_name_ar: `مرفق تزامن ${suffix}`,
      p_name_en: `Concurrency Amenity ${suffix}`,
      p_capacity: 1,
      p_slot_minutes: 60,
      p_opens_at: "08:00",
      p_closes_at: "22:00",
      p_max_advance_days: 30,
      p_requires_approval: false,
    });
    expect(amenity.error, amenity.error?.message).toBeNull();

    const localStart = `${new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10)}T10:00:00`;
    const bookingPromise = enabled.memberA.client.rpc("create_amenity_booking", {
      p_amenity_id: amenity.data!,
      p_unit_id: enabled.unitAId,
      p_local_starts_at: localStart,
      p_member_note: null,
    });
    const disablePromise = enabled.manager.client.rpc("set_amenity_active", {
      p_amenity_id: amenity.data!,
      p_is_active: false,
    });
    const [booking, disabledAmenity] = await Promise.all([bookingPromise, disablePromise]);

    expect(disabledAmenity.error, disabledAmenity.error?.message).toBeNull();
    if (booking.error) {
      expect(booking.error.message).toBe("AMENITY_BOOKING_NOT_AUTHORIZED");
    } else {
      expect(booking.data).toBeTruthy();
      expect(dbQuery(`select count(*) from public.amenity_bookings where id = '${booking.data}' and amenity_id = '${amenity.data}'`)).toBe("1");
    }

    const afterDisable = await enabled.memberA.client.rpc("create_amenity_booking", {
      p_amenity_id: amenity.data!,
      p_unit_id: enabled.unitAId,
      p_local_starts_at: `${localStart.slice(0, 11)}12:00:00`,
      p_member_note: null,
    });
    expect(afterDisable.error?.message).toBe("AMENITY_BOOKING_NOT_AUTHORIZED");
  });

  it("blocks owner cancellation while the organization is inactive", async () => {
    dbQuery(`update public.organizations set status = 'SUSPENDED' where id = '${enabled.orgId}'`);
    try {
      const result = await enabled.memberA.client.rpc("cancel_own_amenity_booking", {
        p_booking_id: bookingId,
      });
      expect(result.error?.message).toBe("AMENITY_BOOKING_NOT_FOUND");
      expect(dbQuery(`select status from public.amenity_bookings where id = '${bookingId}'`)).toBe("CONFIRMED");
    } finally {
      dbQuery(`update public.organizations set status = 'ACTIVE' where id = '${enabled.orgId}'`);
    }
  });

  it("blocks STARTER organizations at the RPC boundary", async () => {
    const result = await disabled.manager.client.rpc("create_amenity", { p_property_id: disabled.propertyId, p_name_ar: "مرفق", p_name_en: "Amenity", p_capacity: 1, p_slot_minutes: 60, p_opens_at: "08:00", p_closes_at: "22:00", p_max_advance_days: 30, p_requires_approval: false });
    expectRejected(result.error, "starter plan must not create amenities");
  });
});
