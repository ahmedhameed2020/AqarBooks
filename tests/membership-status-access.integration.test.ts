/**
 * Phase 1.1 — membership status vs. data access (LOCAL ONLY, real user sessions).
 *
 * is_org_member() used to admit `invited` memberships, so every read policy built on it
 * (chart of accounts, fiscal periods, journal lines, members, units, ...) was open to a user
 * who had only been invited. It now requires `active` (or platform admin). The invitation
 * path itself must keep working: an invited user can still see their own membership row and
 * the organization shell (what onboarding/org-context read), and becomes fully usable the
 * moment an administrator activates them through the real updateUserStatusAction.
 *
 * Fixtures use the local service key; every access assertion is made through a signed-in
 * session (never service_role).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { localSupabase, password, sql } from "./helpers/gate-release";
import { createOpenFiscalYear } from "./helpers/fiscal-calendar";

vi.setConfig({ hookTimeout: 180_000, testTimeout: 60_000 });

const env = localSupabase();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts);

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
const { updateUserStatusAction } = await import("@/lib/actions/users");

const year = new Date().getFullYear();
const orgA = randomUUID();
const orgB = randomUUID();
type U = { id: string; client: SupabaseClient };
const u = {} as Record<"staff" | "invited" | "suspended" | "lateInvited" | "ownerA" | "staffB" | "stranger", U>;
const acct: Record<string, string> = {};

async function makeUser(label: string): Promise<U> {
  const email = `msa-${label}-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const client = createClient(env.API_URL, env.ANON_KEY, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: created.data.user.id, client };
}

beforeAll(async () => {
  for (const [id, n] of [[orgA, "A"], [orgB, "B"]] as const) {
    sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${id}','MSA ${n}','${id}','EGP','ACTIVE')`);
    expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: id })).error).toBeNull();
  }
  for (const k of Object.keys({ staff: 1, invited: 1, suspended: 1, lateInvited: 1, ownerA: 1, staffB: 1, stranger: 1 }) as (keyof typeof u)[]) u[k] = await makeUser(k);

  const reader = (org: string, name: string) => {
    const id = randomUUID();
    sql(`insert into public.roles(id,organization_id,key,name_ar,name_en) values('${id}','${org}','${name}','${name}','${name}');
      insert into public.role_permissions(role_id,permission_id) select '${id}',id from public.permissions where key in ('finance.reports.read','finance.audit.read','finance.dues.read')`);
    return id;
  };
  const readerA = reader(orgA, "MSA_READER"), readerB = reader(orgB, "MSA_READER");
  const ownerRole = sql(`select id from public.roles where organization_id='${orgA}' and key='TENANT_OWNER'`);
  const join = (org: string, user: string, status: string, role: string) =>
    sql(`insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${user}','${status}');
      insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${user}','${role}')`);
  join(orgA, u.staff.id, "active", readerA);
  join(orgA, u.invited.id, "invited", readerA);
  join(orgA, u.suspended.id, "suspended", readerA);
  join(orgA, u.lateInvited.id, "invited", readerA);
  join(orgA, u.ownerA.id, "active", ownerRole);
  join(orgB, u.staffB.id, "active", readerB);

  // org A data
  for (const [code, cat, nb] of [["1100", "ASSET", "DEBIT"], ["4100", "REVENUE", "CREDIT"]]) {
    const id = randomUUID(); acct[code] = id;
    sql(`insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active) values('${id}','${orgA}','${code}','${code}','${code}','${cat}','${nb}',false,true)`);
  }
  // Fiscal calendar through the product RPCs as org A's TENANT_OWNER session (the guard refuses direct writes).
  await createOpenFiscalYear(admin, u.ownerA.client, { orgId: orgA, name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` });
  // The seeded entry is dated ${year}-02-01: the period under test is the monthly period containing it.
  const { data: febPeriod, error: febErr } = await admin.from("fiscal_periods").select("id")
    .eq("organization_id", orgA).lte("start_date", `${year}-02-01`).gte("end_date", `${year}-02-01`).single();
  expect(febErr, febErr?.message).toBeNull();
  const per = febPeriod!.id as string;
  const prop = randomUUID(), unit = randomUUID(), member = randomUUID();
  sql(`insert into public.properties(id,organization_id,name,code) values('${prop}','${orgA}','MSA property','${prop}');
    insert into public.units(id,organization_id,property_id,code) values('${unit}','${orgA}','${prop}','MSA-1');
    insert into public.members(id,organization_id,full_name) values('${member}','${orgA}','MSA member')`);
  const entry = sql(`select public.create_journal_entry_internal('${orgA}'::uuid,null,'${per}'::uuid,'${year}-02-01'::date,'msa','JOURNAL_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id','${acct["1100"]}','debit',100,'credit',0),jsonb_build_object('account_id','${acct["4100"]}','debit',0,'credit',100)),'msa-${orgA}')`);
  sql(`select public.post_journal_entry_internal('${entry}'::uuid)`);
  // org B has rows too, so a leak across tenants would be visible to org A users
  sql(`insert into public.chart_of_accounts(organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active) values('${orgB}','9999','B','B','ASSET','DEBIT',false,true)`);
});

const countRows = async (c: SupabaseClient, table: string) => {
  const { count, error } = await c.from(table).select("*", { count: "exact", head: true });
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return count ?? 0;
};

const TABLES = ["chart_of_accounts", "fiscal_years", "fiscal_periods", "journal_entry_lines", "members", "units", "properties"];
const VIEWS = ["members_with_financials", "units_with_financials", "resorts"];

describe("direct table and view reads", () => {
  it("an active, permitted member reads their organization's rows (and only theirs)", async () => {
    for (const t of [...TABLES, ...VIEWS]) expect(await countRows(u.staff.client, t), t).toBeGreaterThan(0);
    const { data } = await u.staff.client.from("chart_of_accounts").select("organization_id");
    expect(new Set(data!.map((r) => r.organization_id))).toEqual(new Set([orgA]));
  });
  for (const who of ["invited", "suspended", "stranger"] as const) {
    it(`${who} sees no financial/property rows in any affected table or view`, async () => {
      for (const t of [...TABLES, ...VIEWS]) expect(await countRows(u[who].client, t), `${who} → ${t}`).toBe(0);
    });
  }
  it("an active member of ANOTHER organization sees none of org A's rows", async () => {
    const { data } = await u.staffB.client.from("chart_of_accounts").select("organization_id");
    expect(data!.every((r) => r.organization_id === orgB)).toBe(true);
    for (const t of ["fiscal_years", "journal_entry_lines", "members", "units", "properties"]) expect(await countRows(u.staffB.client, t), t).toBe(0);
  });
});

describe("RPCs behind is_org_member / has_permission", () => {
  const calls: [string, Record<string, unknown>][] = [
    ["get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }],
    ["get_account_ledger", { p_organization_id: orgA, p_account_id: "", p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }],
    ["get_cash_position", { p_organization_id: orgA, p_as_of_date: `${year}-12-31` }],
    ["get_cash_flow_statement", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }],
    ["get_unrecognized_dues_summary", { p_organization_id: orgA }],
    ["verify_financial_audit_chain", { p_organization_id: orgA }],
    ["list_projects", { p_organization_id: orgA }],
  ];
  for (const [fn, args] of calls) {
    it(`${fn}: active member succeeds; invited, suspended, outsiders and org-B staff are refused`, async () => {
      const a = { ...args, ...(fn === "get_account_ledger" ? { p_account_id: acct["1100"] } : {}) };
      const ok = await u.staff.client.rpc(fn, a);
      expect(ok.error, `${fn}: ${ok.error?.message}`).toBeNull();
      for (const who of ["invited", "suspended", "stranger", "staffB"] as const) {
        const res = await u[who].client.rpc(fn, a);
        expect(res.error?.code, `${fn} as ${who}`).toBe("42501");
      }
    });
  }
});

describe("invitation path is preserved", () => {
  it("an invited user can still read their own membership row and the organization shell", async () => {
    const { data: own } = await u.invited.client.from("organization_memberships").select("status,organization_id").eq("user_id", u.invited.id);
    expect(own).toEqual([{ status: "invited", organization_id: orgA }]);
    const { data: org } = await u.invited.client.from("organizations").select("id").eq("id", orgA);
    expect(org).toHaveLength(1);
    const { data: roles } = await u.invited.client.from("user_role_assignments").select("role_id").eq("user_id", u.invited.id);
    expect(roles).toHaveLength(1);
  });
  it("an invited user cannot see other members' membership rows or other organizations", async () => {
    const { data } = await u.invited.client.from("organization_memberships").select("user_id");
    expect(data!.map((r) => r.user_id)).toEqual([u.invited.id]);
    const { data: orgs } = await u.invited.client.from("organizations").select("id");
    expect(orgs!.map((o) => o.id)).toEqual([orgA]);
  });
  it("a suspended user can see their own membership (to be told so) but not the organization", async () => {
    const { data } = await u.suspended.client.from("organization_memberships").select("status").eq("user_id", u.suspended.id);
    expect(data).toEqual([{ status: "suspended" }]);
    const { data: orgs } = await u.suspended.client.from("organizations").select("id");
    expect(orgs).toEqual([]);
  });
  it("activation through the real updateUserStatusAction grants access immediately; suspension removes it", async () => {
    expect(await countRows(u.lateInvited.client, "chart_of_accounts")).toBe(0);
    currentUserId = u.ownerA.id;
    const activation = await updateUserStatusAction(orgA, u.lateInvited.id, "active");
    expect(activation, "activation result").toEqual({ ok: true });
    expect(await countRows(u.lateInvited.client, "chart_of_accounts")).toBeGreaterThan(0);
    expect((await u.lateInvited.client.rpc("get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` })).error).toBeNull();
    expect((await updateUserStatusAction(orgA, u.lateInvited.id, "suspended")).ok).toBe(true);
    expect(await countRows(u.lateInvited.client, "chart_of_accounts")).toBe(0);
    expect((await u.lateInvited.client.rpc("get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` })).error?.code).toBe("42501");
    currentUserId = null;
  });
});

describe("catalog invariants (guard against drift)", () => {
  it("is_org_member requires an active membership; is_org_participant is used by exactly the three shell policies", async () => {
    const def = sql(`select pg_get_functiondef('public.is_org_member(uuid,uuid)'::regprocedure)`);
    expect(def).toContain("om.status = 'active'");
    expect(def).not.toContain("<> 'suspended'");
    const users = sql(`select string_agg(tablename||'.'||policyname, ',' order by tablename) from pg_policies where schemaname in ('public','storage') and (qual ~ 'is_org_participant' or with_check ~ 'is_org_participant')`);
    expect(users).toBe("organizations.organizations_select_member,tenant_branding.tenant_branding_select_member");
    const memberships = sql(`select qual from pg_policies where policyname='org_memberships_select_member'`);
    expect(memberships).toContain("user_id = auth.uid()");
  });
});
