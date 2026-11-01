/**
 * Phase 2b — the ten owner-portal functions that are EXECUTE-able by `authenticated`
 * (migration 20261004120000_owner_portal_access.sql), exercised with real signed-in sessions.
 *
 * Contract being verified (derived from the function bodies, then proven here):
 *   STAFF functions (8)  get_member_portal_access, request_member_activation, revoke_member_activation,
 *                        begin_member_temp_access, finish_member_temp_access   -> members.portal.invite
 *                        suspend_member_portal, reactivate_member_portal, begin_member_signout -> members.portal.manage
 *     Allowed: an ACTIVE member of the member's OWN organization whose role holds the key.
 *     Refused with 42501 and the SAME error whether the member exists or not: staff of another organization, an
 *     owner (member) of the same organization, another owner, an authenticated user with no membership, a
 *     suspended or invited staff membership, staff without the key, anonymous.
 *   SELF-SERVICE (2)     my_portal_access, complete_portal_first_login
 *     They act on the caller's own member row only (members.user_id = auth.uid()); another owner's data is never
 *     returned or changed; an unlinked user gets "not linked"; anonymous is refused.
 *
 * LOCAL ONLY: run through the clean stack (see docs/runbooks/accounting-demo-local.md).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

vi.setConfig({ hookTimeout: 300_000, testTimeout: 120_000 });

type Client = SupabaseClient;
let A: JourneyFixture;
let B: JourneyFixture;
const admin = adminClient();
let accountantA: Client, auditorA: Client, ownerStaffA: Client, accountantB: Client;
let owner1: { id: string; email: string; client: Client };
let owner2: { id: string; email: string; client: Client };
let stranger: Client; // authenticated, no membership, no member row
let suspendedStaff: Client, invitedStaff: Client, inviteOnlyStaff: Client, manageOnlyStaff: Client;
let anon: Client;
let m1: string, m2: string, m3: string, mB: string;
// per-run client numbers (unique column; the clean stack keeps data between runs)
const run = Math.floor(Math.random() * 90000) + 100000;
const CID1 = `MB-${run}1`;
const CID2 = `MB-${run}2`;

const FORBIDDEN = "42501";
const forbidden = (res: { data: unknown; error: { code?: string; message: string } | null }, why: string) => {
  expect(res.error, `${why}: expected a refusal`).not.toBeNull();
  expect(res.error!.code, `${why}: ${res.error!.message}`).toBe(FORBIDDEN);
  expect(res.data, why).toBeNull();
};
const ok = (res: { data: unknown; error: { code?: string; message: string } | null }, why: string) => {
  expect(res.error, `${why}: ${res.error?.message}`).toBeNull();
};

async function mkUser(label: string) {
  const email = `${label}-${A.tag}@portal.test`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`${label}: ${created.error?.message}`);
  const c = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (login.error) throw login.error;
  return { id: created.data.user.id, email, client: c as Client };
}
async function staffWithKeys(org: JourneyFixture, label: string, keys: string[], status = "active") {
  const u = await mkUser(label);
  const role = randomUUID();
  await admin.from("roles").insert({ id: role, organization_id: org.orgId, key: `PT_${label}`.toUpperCase(), name_ar: label, name_en: label, is_system: false });
  const perms = await admin.from("permissions").select("id").in("key", keys);
  await admin.from("role_permissions").insert((perms.data ?? []).map((p) => ({ role_id: role, permission_id: p.id })));
  await admin.from("organization_memberships").insert({ organization_id: org.orgId, user_id: u.id, status });
  await admin.from("user_role_assignments").insert({ organization_id: org.orgId, user_id: u.id, role_id: role });
  return u.client;
}
async function mkMember(org: JourneyFixture, name: string, userId?: string, withUnit = true) {
  const id = randomUUID();
  const ins = await admin.from("members").insert({ id, organization_id: org.orgId, full_name: name, phone: "+201000000999", ...(userId ? { user_id: userId } : {}) });
  if (ins.error) throw new Error(ins.error.message);
  if (withUnit) {
    const unit = randomUUID();
    await admin.from("units").insert({ id: unit, organization_id: org.orgId, property_id: org.propertyId, code: `P-${id.slice(0, 4)}` });
    const own = await admin.from("unit_ownerships").insert({ organization_id: org.orgId, unit_id: unit, member_id: id, share_percentage: 100, is_primary_contact: true, start_date: "2020-01-01" });
    if (own.error) throw new Error(own.error.message);
  }
  return id;
}
const portalRow = (member: string, org: string, extra: string) =>
  sql(`insert into public.member_portal_access (organization_id, member_id, ${extra.split("|")[0]}) values ('${org}','${member}', ${extra.split("|")[1]})`);

beforeAll(async () => {
  A = await createJourneyFixture("portal-a", { approveReceivable: false });
  B = await createJourneyFixture("portal-b", { approveReceivable: false });
  accountantA = await signedInClient(A.accountant.email);
  auditorA = await signedInClient(A.auditor.email);
  ownerStaffA = await signedInClient(A.owner.email);
  accountantB = await signedInClient(B.accountant.email);
  anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } }) as Client;

  owner1 = await mkUser("owner1");
  owner2 = await mkUser("owner2");
  stranger = (await mkUser("stranger")).client;
  suspendedStaff = await staffWithKeys(A, "suspended", ["members.portal.invite", "members.portal.manage"], "suspended");
  invitedStaff = await staffWithKeys(A, "invited", ["members.portal.invite", "members.portal.manage"], "invited");
  inviteOnlyStaff = await staffWithKeys(A, "inviteonly", ["members.portal.invite"]);
  manageOnlyStaff = await staffWithKeys(A, "manageonly", ["members.portal.manage"]);

  m1 = await mkMember(A, "Owner One", owner1.id);
  m2 = await mkMember(A, "Owner Two", owner2.id);
  m3 = await mkMember(A, "Owner Three (not provisioned)");
  mB = await mkMember(B, "Owner of Org B");

  // portal rows for the two linked owners; fingerprints are of the CURRENT password hashes
  portalRow(m1, A.orgId, `status, login_method, client_id, auth_user_id, auth_origin, must_change_password, temp_password_expires_at, confirmed_phone|'pending','client_id','${CID1}','${owner1.id}','provisioned', true, now() + interval '48 hours','+201000000111'`);
  portalRow(m2, A.orgId, `status, login_method, client_id, auth_user_id, auth_origin, must_change_password, temp_password_expires_at, confirmed_phone, activated_at|'active','client_id','${CID2}','${owner2.id}','provisioned', false, null,'+201000000222', now()`);
  for (const [m, u] of [[m1, owner1.id], [m2, owner2.id]] as const) {
    sql(`update public.member_portal_access set temp_pw_fingerprint = encode(extensions.digest(coalesce((select encrypted_password from auth.users where id='${u}'),''),'sha256'),'hex') where member_id='${m}'`);
  }
});

describe("STAFF functions are gated by the member's own organization and the permission key", () => {
  const invite: Array<[string, (c: Client, m: string) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>]> = [
    ["get_member_portal_access", (c, m) => c.rpc("get_member_portal_access", { p_member_id: m })],
    ["request_member_activation", (c, m) => c.rpc("request_member_activation", { p_member_id: m })],
    ["revoke_member_activation", (c, m) => c.rpc("revoke_member_activation", { p_member_id: m })],
    ["begin_member_temp_access", (c, m) => c.rpc("begin_member_temp_access", { p_member_id: m })],
    ["finish_member_temp_access", (c, m) => c.rpc("finish_member_temp_access", { p_member_id: m, p_auth_user_id: randomUUID(), p_valid_hours: 24 })],
  ];
  const manage: typeof invite = [
    ["suspend_member_portal", (c, m) => c.rpc("suspend_member_portal", { p_member_id: m, p_reason: "authz test" })],
    ["reactivate_member_portal", (c, m) => c.rpc("reactivate_member_portal", { p_member_id: m })],
    ["begin_member_signout", (c, m) => c.rpc("begin_member_signout", { p_member_id: m })],
  ];

  for (const [name, call] of [...invite, ...manage]) {
    it(`${name}: refused (42501) for every caller that is not authorized staff of the member's organization`, async () => {
      forbidden(await call(accountantB, m1), "staff of ANOTHER organization");
      forbidden(await call(owner1.client, m1), "the owner of that very member");
      forbidden(await call(owner2.client, m1), "another owner of the same organization");
      forbidden(await call(stranger, m1), "authenticated user with no membership");
      forbidden(await call(suspendedStaff, m1), "staff whose membership is suspended");
      forbidden(await call(invitedStaff, m1), "staff whose membership is only invited");
      forbidden(await call(auditorA, m1), "staff without any portal key (auditor)");
      forbidden(await call(anon, m1), "anonymous");
      // no existence oracle: an unknown member id gives the identical refusal
      const unknown = await call(accountantA, randomUUID());
      forbidden(unknown, "unknown member id");
      expect(unknown.error!.message).toMatch(/FORBIDDEN_PORTAL_ACCESS/);
      // and a member of another organization is refused to this organization's staff
      forbidden(await call(accountantA, mB), "staff of org A on a member of org B");
    });
  }

  it("invite-only staff cannot use the manage functions, manage-only staff cannot use the invite functions", async () => {
    for (const [, call] of manage) forbidden(await call(inviteOnlyStaff, m1), "invite-only on manage function");
    for (const [, call] of invite) forbidden(await call(manageOnlyStaff, m1), "manage-only on invite function");
  });

  it("authorized staff of the member's organization are allowed (and see only that organization's member)", async () => {
    const state = await accountantA.rpc("get_member_portal_access", { p_member_id: m1 });
    ok(state, "accountant reads state");
    expect(state.data).toMatchObject({ status: "pending", client_id: CID1, can_manage: true });
    expect((await ownerStaffA.rpc("get_member_portal_access", { p_member_id: m2 })).data).toMatchObject({ client_id: CID2 });
    expect((await inviteOnlyStaff.rpc("get_member_portal_access", { p_member_id: m1 })).data).toMatchObject({ can_manage: false });
    // manage functions
    const suspended = await accountantA.rpc("suspend_member_portal", { p_member_id: m2, p_reason: "authz test" });
    ok(suspended, "suspend");
    expect((suspended.data as Array<{ auth_user_id: string }>)[0].auth_user_id).toBe(owner2.id);
    ok(await manageOnlyStaff.rpc("begin_member_signout", { p_member_id: m2 }), "signout");
    ok(await manageOnlyStaff.rpc("reactivate_member_portal", { p_member_id: m2 }), "reactivate");
    expect((await adminClient().from("member_portal_access").select("status").eq("member_id", m2).single()).data?.status).toBe("active");
  });

  it("temporary access: the identity attached must be the alias reserved for THIS member's client number", async () => {
    const begin = await inviteOnlyStaff.rpc("begin_member_temp_access", { p_member_id: m3 });
    ok(begin, "begin");
    const row = (begin.data as Array<{ client_id: string; alias_email: string; organization_id: string }>)[0];
    expect(row.organization_id).toBe(A.orgId);
    // another organization's staff cannot finish it, the member's own owner cannot, nor a different auth user
    forbidden(await accountantB.rpc("finish_member_temp_access", { p_member_id: m3, p_auth_user_id: owner1.id, p_valid_hours: 24 }), "other org finishing");
    const wrongUser = await accountantA.rpc("finish_member_temp_access", { p_member_id: m3, p_auth_user_id: owner1.id, p_valid_hours: 24 });
    expect(wrongUser.error?.message).toMatch(/AUTH_USER_MISMATCH/);
    const alias = await admin.auth.admin.createUser({ email: row.alias_email, password: PASSWORD, email_confirm: true });
    if (alias.error) throw new Error(alias.error.message);
    const done = await accountantA.rpc("finish_member_temp_access", { p_member_id: m3, p_auth_user_id: alias.data.user!.id, p_valid_hours: 9999 });
    ok(done, "finish");
    const hours = (new Date(done.data as string).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(160); // 9999 is clamped to 168
    expect(hours).toBeLessThanOrEqual(168.01);
    expect((await admin.from("members").select("user_id").eq("id", m3).single()).data?.user_id).toBe(alias.data.user!.id);
  });
});

describe("SELF-SERVICE functions only ever touch the caller's own member row", () => {
  it("my_portal_access returns the caller's own state and nobody else's", async () => {
    const mine = await owner1.client.rpc("my_portal_access");
    ok(mine, "owner1");
    expect(mine.data).toMatchObject({ linked: true, client_id: CID1, must_change_password: true, has_staff_access: false });
    expect(JSON.stringify(mine.data)).toContain("0111");
    expect(JSON.stringify(mine.data)).not.toContain("0222");
    const theirs = await owner2.client.rpc("my_portal_access");
    expect(theirs.data).toMatchObject({ linked: true, client_id: CID2 });
    expect(JSON.stringify(theirs.data)).not.toContain(CID1);
    expect((await stranger.rpc("my_portal_access")).data).toMatchObject({ linked: false, status: "none", client_id: null });
    expect((await accountantA.rpc("my_portal_access")).data).toMatchObject({ linked: false, has_staff_access: true });
    expect((await anon.rpc("my_portal_access")).error).not.toBeNull();
  });

  it("complete_portal_first_login: refused until the password really changed, then completes ONLY the caller's own row", async () => {
    const phone = "+201000000333";
    expect((await anon.rpc("complete_portal_first_login", { p_phone: phone })).error).not.toBeNull();
    expect((await stranger.rpc("complete_portal_first_login", { p_phone: phone })).data).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    expect((await owner2.client.rpc("complete_portal_first_login", { p_phone: phone })).data).toMatchObject({ ok: false, reason: "NOT_REQUIRED" });
    expect((await owner1.client.rpc("complete_portal_first_login", { p_phone: "12" })).data).toMatchObject({ ok: false, reason: "INVALID_PHONE" });
    expect((await owner1.client.rpc("complete_portal_first_login", { p_phone: phone })).data).toMatchObject({ ok: false, reason: "PASSWORD_NOT_CHANGED" });

    const changed = await owner1.client.auth.updateUser({ password: `${PASSWORD}-changed` });
    expect(changed.error, changed.error?.message).toBeNull();
    const before2 = await admin.from("member_portal_access").select("status,confirmed_phone,must_change_password").eq("member_id", m2).single();
    expect((await owner1.client.rpc("complete_portal_first_login", { p_phone: phone })).data).toMatchObject({ ok: true });
    const m1Row = await admin.from("member_portal_access").select("status,confirmed_phone,must_change_password").eq("member_id", m1).single();
    expect(m1Row.data).toMatchObject({ status: "active", confirmed_phone: phone, must_change_password: false });
    const after2 = await admin.from("member_portal_access").select("status,confirmed_phone,must_change_password").eq("member_id", m2).single();
    expect(after2.data).toEqual(before2.data); // the other owner's row is untouched
  });

  it("a suspended owner and an expired temporary password are refused", async () => {
    sql(`update public.member_portal_access set status='suspended' where member_id='${m2}'`);
    sql(`update public.member_portal_access set must_change_password=true, temp_password_expires_at = now() - interval '1 hour' where member_id='${m2}'`);
    expect((await owner2.client.rpc("complete_portal_first_login", { p_phone: "+201000000444" })).data).toMatchObject({ ok: false, reason: "SUSPENDED" });
    sql(`update public.member_portal_access set status='pending' where member_id='${m2}'`);
    expect((await owner2.client.rpc("complete_portal_first_login", { p_phone: "+201000000444" })).data).toMatchObject({ ok: false, reason: "TEMP_EXPIRED" });
  });
});

describe("tables behind the functions are not reachable directly", () => {
  it("authenticated and anonymous sessions cannot read or write the portal tables", async () => {
    for (const c of [owner1.client, accountantA, anon, stranger]) {
      for (const table of ["member_portal_access", "member_activation_tokens"]) {
        const r = await c.from(table).select("*").limit(1);
        expect(r.error, `${table} select`).not.toBeNull();
        const w = await c.from(table).update({ status: "active" }).eq("member_id", m1);
        expect(w.error, `${table} update`).not.toBeNull();
      }
    }
  });
});
