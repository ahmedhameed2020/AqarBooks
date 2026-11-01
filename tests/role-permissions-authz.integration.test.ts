/**
 * Phase 1.1 — role-permission replacement authorization (LOCAL ONLY).
 *
 * Two layers are exercised separately, because holding the service key must never stand in
 * for checking who is asking:
 *
 *  1. The REAL server action (lib/actions/roles.ts -> updateRolePermissionsAction) running
 *     against the local database with the acting user injected the same way the session
 *     does (getCurrentUser). It is driven as: authorized owner, authorized non-owner manager,
 *     a user without tenant.roles.manage, another organization's owner, a suspended and an
 *     invited member, and a signed-in non-member.
 *  2. The database function replace_role_permissions_atomic itself, called with the service
 *     key (its only grantee) but each time naming an actor -- proving the DB re-verifies the
 *     requester independently of the application.
 *
 * Every denial must leave the role's permission set and the audit trail untouched.
 * The service key is used for fixtures and for the function's own caller; it is never what
 * grants the permission.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { localSupabase } from "./helpers/gate-release";

vi.setConfig({ hookTimeout: 180_000, testTimeout: 60_000 });

const env = localSupabase();
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// --- application seams: only identity/cache/demo are stubbed; authorization + DB are real ---
let currentUserId: string | null = null;
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn(), getPathname: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => { throw new Error("session client must not be used"); }) }));
vi.mock("@/lib/demo/guard", () => ({ denyIfDemo: vi.fn(async () => null) }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => (currentUserId ? { id: currentUserId } : null)),
  isPlatformAdmin: vi.fn(async () => false),
}));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient: create } = await import("@supabase/supabase-js");
  const { localSupabase: local } = await import("./helpers/gate-release");
  const e = local();
  return { createAdminClient: () => create(e.API_URL, e.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) };
});

const { updateRolePermissionsAction } = await import("@/lib/actions/roles");

type Actor = { id: string };
const orgA = randomUUID();
const orgB = randomUUID();
const actors = {} as Record<"owner" | "manager" | "plain" | "suspended" | "invited" | "ownerB" | "stranger", Actor>;
const key = { reports: "finance.reports.read", dues: "finance.dues.read", manage: "tenant.roles.manage" };
const perm: Record<string, string> = {};
let target = "";          // custom, non-system role in org A
let ownerRoleA = "";      // TENANT_OWNER of org A
let targetOfB = "";       // custom role in org B

const grantsOf = async (roleId: string) => {
  const { data } = await admin.from("role_permissions").select("permission_id").eq("role_id", roleId);
  return (data ?? []).map((r) => r.permission_id).sort();
};
const auditCount = async (roleId: string) => {
  const { count } = await admin.from("platform_audit_logs").select("id", { count: "exact", head: true })
    .eq("entity_id", roleId).eq("action", "role.permissions_updated");
  return count ?? 0;
};
const setGrants = async (roleId: string, ids: string[]) => {
  await admin.from("role_permissions").delete().eq("role_id", roleId);
  if (ids.length) await admin.from("role_permissions").insert(ids.map((permission_id) => ({ role_id: roleId, permission_id })));
};
const dbReplace = (actor: string | null, org: string, role: string, ids: string[]) =>
  admin.rpc("replace_role_permissions_atomic", { p_organization_id: org, p_role_id: role, p_permission_ids: ids, p_actor_user_id: actor as string });

beforeAll(async () => {
  for (const [id, name] of [[orgA, "A"], [orgB, "B"]] as const) {
    const { error } = await admin.from("organizations").insert({ id, name: `RPA ${name}`, slug: id, default_currency: "EGP", status: "ACTIVE" });
    expect(error, error?.message).toBeNull();
    const clone = await admin.rpc("clone_tenant_role_templates", { p_organization_id: id });
    expect(clone.error, clone.error?.message).toBeNull();
  }
  const { data: perms } = await admin.from("permissions").select("id,key").in("key", Object.values(key));
  for (const p of perms ?? []) perm[p.key] = p.id;
  expect(Object.keys(perm)).toHaveLength(3);

  const mkUser = async (label: string) => {
    const created = await admin.auth.admin.createUser({ email: `rpa-${label}-${randomUUID()}@test.local`, password: "Rpa_Test_P@ssw0rd_2026!", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    return { id: created.data.user.id };
  };
  for (const k of Object.keys({ owner: 1, manager: 1, plain: 1, suspended: 1, invited: 1, ownerB: 1, stranger: 1 }) as (keyof typeof actors)[]) actors[k] = await mkUser(k);

  const role = async (org: string, k: string, permIds: string[]) => {
    const { data, error } = await admin.from("roles").insert({ organization_id: org, key: k, name_ar: k, name_en: k, is_system: false }).select("id").single();
    expect(error, error?.message).toBeNull();
    await setGrants(data!.id, permIds);
    return data!.id as string;
  };
  const managerRole = await role(orgA, "RPA_MANAGER", [perm[key.manage], perm[key.reports]]);
  const plainRole = await role(orgA, "RPA_PLAIN", [perm[key.reports]]);
  target = await role(orgA, "RPA_TARGET", [perm[key.reports]]);
  targetOfB = await role(orgB, "RPA_TARGET_B", [perm[key.reports]]);
  const own = async (org: string) => (await admin.from("roles").select("id").eq("organization_id", org).eq("key", "TENANT_OWNER").single()).data!.id as string;
  ownerRoleA = await own(orgA);
  const ownerRoleB = await own(orgB);

  const join = async (org: string, user: string, status: string, roleId: string) => {
    expect((await admin.from("organization_memberships").insert({ organization_id: org, user_id: user, status })).error).toBeNull();
    expect((await admin.from("user_role_assignments").insert({ organization_id: org, user_id: user, role_id: roleId })).error).toBeNull();
  };
  await join(orgA, actors.owner.id, "active", ownerRoleA);
  await join(orgA, actors.manager.id, "active", managerRole);
  await join(orgA, actors.plain.id, "active", plainRole);
  await join(orgA, actors.suspended.id, "suspended", managerRole);
  await join(orgA, actors.invited.id, "invited", managerRole);
  await join(orgB, actors.ownerB.id, "active", ownerRoleB);
});

describe("application path: updateRolePermissionsAction", () => {
  const attempt = async (as: string | null, org: string, role: string, ids: string[]) => {
    currentUserId = as;
    const before = { grants: await grantsOf(role), audit: await auditCount(role) };
    const res = await updateRolePermissionsAction(org, role, ids);
    return { res, before, after: { grants: await grantsOf(role), audit: await auditCount(role) } };
  };
  const expectUnchanged = (r: Awaited<ReturnType<typeof attempt>>) => {
    expect(r.res.ok).toBe(false);
    expect(r.after.grants).toEqual(r.before.grants);
    expect(r.after.audit).toBe(r.before.audit);
  };

  it("denies an unauthenticated caller", async () => expectUnchanged(await attempt(null, orgA, target, [perm[key.dues]])));
  it("denies a user without tenant.roles.manage", async () => expectUnchanged(await attempt(actors.plain.id, orgA, target, [perm[key.dues]])));
  it("denies another organization's owner targeting org A", async () => expectUnchanged(await attempt(actors.ownerB.id, orgA, target, [perm[key.dues]])));
  it("denies another organization's owner who names their own org but org A's role", async () => expectUnchanged(await attempt(actors.ownerB.id, orgB, target, [perm[key.dues]])));
  it("denies a suspended member who holds the manage permission", async () => expectUnchanged(await attempt(actors.suspended.id, orgA, target, [perm[key.dues]])));
  it("denies an invited (not yet active) member who holds the manage permission", async () => expectUnchanged(await attempt(actors.invited.id, orgA, target, [perm[key.dues]])));
  it("denies a signed-in user with no membership anywhere", async () => expectUnchanged(await attempt(actors.stranger.id, orgA, target, [perm[key.dues]])));

  it("denies a non-owner manager granting a permission they do not hold (no amplification)", async () => {
    const r = await attempt(actors.manager.id, orgA, target, [perm[key.dues]]);
    expectUnchanged(r);
    expect(r.res.ok === false && r.res.error).toBe("permission_amplification_denied");
  });
  it("denies a non-owner manager modifying the TENANT_OWNER role", async () => expectUnchanged(await attempt(actors.manager.id, orgA, ownerRoleA, [perm[key.reports]])));
  it("denies clearing the TENANT_OWNER permissions even for an owner", async () => expectUnchanged(await attempt(actors.owner.id, orgA, ownerRoleA, [])));

  it("allows a non-owner manager to set permissions they hold, atomically, with an audit row", async () => {
    const r = await attempt(actors.manager.id, orgA, target, [perm[key.reports], perm[key.manage]]);
    expect(r.res.ok).toBe(true);
    expect(r.after.grants).toEqual([perm[key.reports], perm[key.manage]].sort());
    expect(r.after.audit).toBe(r.before.audit + 1);
  });
  it("allows the organization owner to grant any tenant-assignable permission", async () => {
    const r = await attempt(actors.owner.id, orgA, target, [perm[key.dues]]);
    expect(r.res.ok).toBe(true);
    expect(r.after.grants).toEqual([perm[key.dues]]);
  });
});

describe("database function: replace_role_permissions_atomic re-verifies the requester", () => {
  // The caller below is the service key (the function's only grantee). Each case still
  // names an actor, and the database must refuse the unauthorized ones by itself.
  const denied = async (actor: string | null, org: string, role: string, ids: string[], code = "42501") => {
    await setGrants(role, [perm[key.reports]]);
    const before = await grantsOf(role);
    const res = await dbReplace(actor, org, role, ids);
    expect(res.error, "expected the database to refuse").not.toBeNull();
    expect(res.error!.code).toBe(code);
    expect(await grantsOf(role)).toEqual(before);
  };
  it("refuses a missing actor", () => denied(null, orgA, target, [perm[key.dues]]));
  it("refuses an actor without tenant.roles.manage", () => denied(actors.plain.id, orgA, target, [perm[key.dues]]));
  it("refuses another organization's owner", () => denied(actors.ownerB.id, orgA, target, [perm[key.dues]]));
  it("refuses a suspended actor", () => denied(actors.suspended.id, orgA, target, [perm[key.dues]]));
  it("refuses an invited actor", () => denied(actors.invited.id, orgA, target, [perm[key.dues]]));
  it("refuses a non-member actor", () => denied(actors.stranger.id, orgA, target, [perm[key.dues]]));
  it("refuses an actor who is authorized elsewhere but names org A's role under org B", () => denied(actors.ownerB.id, orgB, target, [perm[key.dues]]));
  it("refuses amplification by a non-owner manager", () => denied(actors.manager.id, orgA, target, [perm[key.dues]]));
  it("refuses a non-owner touching the TENANT_OWNER role", async () => {
    const before = await grantsOf(ownerRoleA);
    const res = await dbReplace(actors.manager.id, orgA, ownerRoleA, [perm[key.reports]]);
    expect(res.error?.code).toBe("42501");
    expect(await grantsOf(ownerRoleA)).toEqual(before);
  });
  it("refuses platform permissions and unknown ids even from the owner, leaving the role intact", async () => {
    const { data: platformPerm } = await admin.from("permissions").select("id").like("key", "platform.%").limit(1).single();
    await denied(actors.owner.id, orgA, target, [platformPerm!.id]);
    await denied(actors.owner.id, orgA, target, ["00000000-0000-0000-0000-000000000000"]);
  });
  it("is not callable by signed-in or anonymous clients at all", async () => {
    const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const res = await anon.rpc("replace_role_permissions_atomic", { p_organization_id: orgA, p_role_id: target, p_permission_ids: [], p_actor_user_id: actors.owner.id });
    expect(res.error?.code).toBe("42501");
    const created = await admin.auth.admin.createUser({ email: `rpa-auth-${randomUUID()}@test.local`, password: "Rpa_Test_P@ssw0rd_2026!", email_confirm: true });
    const signedIn: SupabaseClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    await signedIn.auth.signInWithPassword({ email: created.data.user!.email!, password: "Rpa_Test_P@ssw0rd_2026!" });
    const res2 = await signedIn.rpc("replace_role_permissions_atomic", { p_organization_id: orgA, p_role_id: target, p_permission_ids: [], p_actor_user_id: actors.owner.id });
    expect(res2.error?.code).toBe("42501");
  });
  it("still works for a legitimately authorized actor (owner) and is all-or-nothing on failure", async () => {
    await setGrants(target, [perm[key.reports]]);
    const ok = await dbReplace(actors.owner.id, orgA, target, [perm[key.dues]]);
    expect(ok.error, ok.error?.message).toBeNull();
    expect(await grantsOf(target)).toEqual([perm[key.dues]]);
    const bad = await dbReplace(actors.owner.id, orgA, target, [perm[key.reports], "00000000-0000-0000-0000-000000000000"]);
    expect(bad.error).not.toBeNull();
    expect(await grantsOf(target)).toEqual([perm[key.dues]]);
    expect(await grantsOf(targetOfB)).toEqual([perm[key.reports]]); // other tenant's role never touched
  });
});
