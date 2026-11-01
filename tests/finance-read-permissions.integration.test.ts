/**
 * Phase 1.2 — financial READ permissions inside an organization (LOCAL ONLY, real user sessions).
 *
 * Sixteen finance tables used to be readable by every ACTIVE member. Each now has one
 * permission-keyed SELECT policy (plus the existing *_manage ALL policy). This suite signs in
 * as real personas built from the shipped role templates (ACCOUNTANT, COLLECTOR, CASHIER,
 * PROPERTY_MANAGER) and from custom gate-operator / technician roles, plus an owner (portal
 * member), an invited member, a suspended member and another organization's accountant.
 * Fixtures use the local service key; every access assertion is made through a user session.
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
const year = new Date().getFullYear();
const orgA = randomUUID();
const orgB = randomUUID();

type Persona = "accountant" | "collector" | "cashier" | "propertyManager" | "guard" | "technician" | "owner" | "invited" | "suspended" | "accountantB" | "collectorB";
const P = {} as Record<Persona, { id: string; client: SupabaseClient }>;
const ids = { collectorSession: "", cashierSession: "", aEntries: [] as string[], aCheques: [] as string[] };

const TABLES = [
  "chart_of_accounts", "fiscal_years", "fiscal_periods", "journal_entry_lines", "cost_centers", "budgets",
  "banks", "bank_accounts", "cashboxes", "cash_transactions", "cashier_sessions", "cheques",
  "cheque_status_history", "due_types", "expense_categories", "projects",
] as const;
type Table = (typeof TABLES)[number];

/** Who is expected to read each table (derived from the shipped templates and the matrix in
 * docs/audits/_parts/E-read-matrix.md). Anyone not listed must see zero rows. */
const CAN_READ: Record<Table, Persona[]> = {
  chart_of_accounts: ["accountant", "collector", "cashier", "propertyManager"],
  fiscal_years: ["accountant", "cashier"],
  fiscal_periods: ["accountant", "collector", "cashier", "propertyManager"],
  journal_entry_lines: ["accountant", "cashier"],
  cost_centers: ["accountant", "cashier"],
  budgets: ["accountant", "cashier"],
  banks: ["accountant"],
  bank_accounts: ["accountant"],
  cashboxes: ["accountant", "collector", "cashier"],
  cash_transactions: ["cashier"],
  cashier_sessions: ["cashier"], // collector additionally reads ONLY its own session (see below)
  cheques: ["accountant", "collector", "cashier", "propertyManager"],
  cheque_status_history: ["accountant", "collector", "cashier", "propertyManager"],
  due_types: ["accountant", "collector", "cashier", "propertyManager"],
  expense_categories: ["accountant", "propertyManager"],
  projects: ["accountant", "cashier"],
};
const ALL_PERSONAS: Persona[] = ["accountant", "collector", "cashier", "propertyManager", "guard", "technician", "owner", "invited", "suspended", "accountantB", "collectorB"];

async function makeUser(label: string) {
  const email = `frp-${label}-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const client = createClient(env.API_URL, env.ANON_KEY, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: created.data.user.id, client };
}

function seedOrg(org: string, tag: string, scale: number, per: string) {
  const q = (s: string) => sql(s);
  const acct = (code: string, cat: string, nb: string, extra = "") => {
    const id = randomUUID();
    q(`insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active${extra ? ",is_cash_equivalent" : ""})
       values('${id}','${org}','${code}','${tag}${code}','${tag}${code}','${cat}','${nb}',false,true${extra ? ",true" : ""})`);
    return id;
  };
  const cashAcc = acct("1100", "ASSET", "DEBIT", "cash");
  const bankGl = acct("1200", "ASSET", "DEBIT", "cash");
  const rev = acct("4100", "REVENUE", "CREDIT");
  const exp = acct("5100", "EXPENSE", "DEBIT");
  const prop = randomUUID(), bank = randomUUID(), ba = randomUUID(), box = randomUUID();
  q(`insert into public.properties(id,organization_id,name,code) values('${prop}','${org}','${tag} property','${prop}');
     insert into public.banks(id,organization_id,name_ar,name_en) values('${bank}','${org}','${tag}bank','${tag}bank');
     insert into public.bank_accounts(id,organization_id,property_id,bank_id,account_name,account_number,gl_account_id) values('${ba}','${org}','${prop}','${bank}','${tag} acct','SECRET-${scale}-ACCT-NO','${bankGl}');
     insert into public.cashboxes(id,organization_id,property_id,name,gl_account_id) values('${box}','${org}','${prop}','${tag} box','${cashAcc}');
     insert into public.cost_centers(organization_id,code,name_ar,name_en) values('${org}','CC','${tag}cc','${tag}cc');
     insert into public.budgets(organization_id,fiscal_period_id,account_id) values('${org}','${per}','${exp}');
     insert into public.due_types(organization_id,name_ar,name_en,default_revenue_account_id) values('${org}','${tag}dt','${tag}dt','${rev}');
     insert into public.expense_categories(organization_id,name_ar,name_en,default_expense_account_id) values('${org}','${tag}ec','${tag}ec','${exp}');
     insert into public.projects(organization_id,code,name_ar,name_en) values('${org}','PRJ','${tag}prj','${tag}prj');
     insert into public.cheques(organization_id,property_id,bank_account_id,direction,cheque_number,amount,cheque_date,due_date,status) values('${org}','${prop}','${ba}','INCOMING','CH-${tag}',${100 * scale},'${year}-03-01','${year}-04-01','RECEIVED');`);
  const cheque = q(`select id from public.cheques where organization_id='${org}' limit 1`);
  q(`insert into public.cheque_status_history(cheque_id,to_status) values('${cheque}','RECEIVED')`);
  const entry = q(`select public.create_journal_entry_internal('${org}'::uuid,null,'${per}'::uuid,'${year}-02-01'::date,'frp','JOURNAL_VOUCHER',
      jsonb_build_array(jsonb_build_object('account_id','${cashAcc}','debit',${scale},'credit',0),jsonb_build_object('account_id','${rev}','debit',0,'credit',${scale})),'frp-${org}')`);
  q(`select public.post_journal_entry_internal('${entry}'::uuid)`);
  return { box, prop };
}

beforeAll(async () => {
  for (const [id, n] of [[orgA, "A"], [orgB, "B"]] as const) {
    sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${id}','FRP ${n}','${id}','EGP','ACTIVE')`);
    expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: id })).error).toBeNull();
  }
  for (const k of ["accountant", "collector", "cashier", "propertyManager", "guard", "technician", "owner", "invited", "suspended", "accountantB", "collectorB"] as Persona[]) P[k] = await makeUser(k);

  const tpl = (org: string, key: string) => sql(`select id from public.roles where organization_id='${org}' and key='${key}'`);
  const custom = (org: string, key: string, perms: string[]) => {
    const id = randomUUID();
    sql(`insert into public.roles(id,organization_id,key,name_ar,name_en) values('${id}','${org}','${key}','${key}','${key}');
         insert into public.role_permissions(role_id,permission_id) select '${id}',id from public.permissions where key in (${perms.map((p) => `'${p}'`).join(",")})`);
    return id;
  };
  const join = (org: string, user: string, status: string, role?: string) =>
    sql(`insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${user}','${status}');
         ${role ? `insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${user}','${role}');` : ""}`);

  join(orgA, P.accountant.id, "active", tpl(orgA, "ACCOUNTANT"));
  join(orgA, P.collector.id, "active", tpl(orgA, "COLLECTOR"));
  join(orgA, P.cashier.id, "active", tpl(orgA, "CASHIER"));
  join(orgA, P.propertyManager.id, "active", tpl(orgA, "PROPERTY_MANAGER"));
  join(orgA, P.guard.id, "active", custom(orgA, "FRP_GATE", ["operations.gates.scan", "operations.visitors.view", "operations.access_events.view", "operations.gates.view"]));
  join(orgA, P.technician.id, "active", custom(orgA, "FRP_TECH", ["operations.work_orders.view", "operations.work_orders.complete", "operations.maintenance.view"]));
  join(orgA, P.invited.id, "invited", tpl(orgA, "ACCOUNTANT"));
  join(orgA, P.suspended.id, "suspended", tpl(orgA, "ACCOUNTANT"));
  join(orgB, P.accountantB.id, "active", tpl(orgB, "ACCOUNTANT"));
  join(orgB, P.collectorB.id, "active", tpl(orgB, "COLLECTOR"));

  // Fiscal calendar through the product RPCs, as a dedicated TENANT_OWNER per organization (the guard refuses
  // direct writes). These owners are kept outside P so the persona matrix below is unchanged.
  const fiscalPeriodFor = async (org: string, label: string) => {
    const fiscalOwner = await makeUser(`fiscal-${label}`);
    join(org, fiscalOwner.id, "active", tpl(org, "TENANT_OWNER"));
    await createOpenFiscalYear(admin, fiscalOwner.client, {
      orgId: org, name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`,
    });
    // The seeded entry is dated ${year}-02-01: the period under test is the monthly period containing it.
    const { data, error } = await admin.from("fiscal_periods").select("id")
      .eq("organization_id", org).lte("start_date", `${year}-02-01`).gte("end_date", `${year}-02-01`).single();
    expect(error, error?.message).toBeNull();
    return data!.id as string;
  };
  const perA = await fiscalPeriodFor(orgA, "a");
  const perB = await fiscalPeriodFor(orgB, "b");

  const a = seedOrg(orgA, "A", 1, perA);
  seedOrg(orgB, "B", 7, perB);

  // cashier sessions: one opened by the collector, one by the cashier (cashbox of org A)
  ids.collectorSession = randomUUID(); ids.cashierSession = randomUUID();
  sql(`insert into public.cashier_sessions(id,organization_id,property_id,cashbox_id,opened_by,status) values('${ids.collectorSession}','${orgA}','${a.prop}','${a.box}','${P.collector.id}','OPEN');
       insert into public.cashier_sessions(id,organization_id,property_id,cashbox_id,opened_by,status) values('${ids.cashierSession}','${orgA}','${a.prop}','${a.box}','${P.cashier.id}','CLOSED');
       insert into public.cash_transactions(organization_id,session_id,type,amount) values('${orgA}','${ids.cashierSession}','RECEIPT',10)`);

  ids.aEntries = sql(`select id from public.journal_entries where organization_id='${orgA}'`).split(String.fromCharCode(10)).filter(Boolean);
  ids.aCheques = sql(`select id from public.cheques where organization_id='${orgA}'`).split(String.fromCharCode(10)).filter(Boolean);

  // owner: a portal member of org A with an owned unit and a due (own-data policies, not org membership)
  const unit = randomUUID(), member = randomUUID(), dueType = sql(`select id from public.due_types where organization_id='${orgA}' limit 1`);
  const receivable = sql(`select id from public.chart_of_accounts where organization_id='${orgA}' and code='1100'`);
  sql(`insert into public.units(id,organization_id,property_id,code) values('${unit}','${orgA}','${a.prop}','FRP-1');
       insert into public.members(id,organization_id,full_name,user_id) values('${member}','${orgA}','FRP owner','${P.owner.id}');
       insert into public.unit_ownerships(organization_id,unit_id,member_id,share_percentage,start_date) values('${orgA}','${unit}','${member}',100,'2020-01-01');
       insert into public.dues(organization_id,property_id,unit_id,due_type_id,amount,issue_date,due_date,status,receivable_account_id,description)
         values('${orgA}','${a.prop}','${unit}','${dueType}',500,'${year}-01-01','${year}-02-01','DRAFT','${receivable}','FRP due')`);
}, 240_000);

const rows = async (c: SupabaseClient, table: string) => {
  const { count, error } = await c.from(table).select("*", { count: "exact", head: true });
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return count ?? 0;
};
/** Rows of ORGANIZATION A visible to this session (child tables are matched through their parent ids). */
const rowsOfOrgA = async (c: SupabaseClient, table: string) => {
  let q = c.from(table).select("*", { count: "exact", head: true });
  if (table === "journal_entry_lines") q = q.in("journal_entry_id", ids.aEntries);
  else if (table === "cheque_status_history") q = q.in("cheque_id", ids.aCheques);
  else q = q.eq("organization_id", orgA);
  const { count, error } = await q;
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return count ?? 0;
};
const FOREIGN: Persona[] = ["accountantB", "collectorB"];

describe("table reads by persona (real sessions)", () => {
  for (const table of TABLES) {
    it(`${table}: readable only by ${CAN_READ[table].join(", ")}`, async () => {
      for (const who of ALL_PERSONAS) {
        if (FOREIGN.includes(who)) {
          expect(await rowsOfOrgA(P[who].client, table), `${who} must see no org-A row of ${table}`).toBe(0);
          continue;
        }
        const n = await rows(P[who].client, table);
        if (CAN_READ[table].includes(who)) expect(n, `${who} should read ${table}`).toBeGreaterThan(0);
        else if (table === "cashier_sessions" && who === "collector") expect(n, "collector reads its own session only").toBe(1);
        else expect(n, `${who} must not read ${table}`).toBe(0);
      }
    });
  }

  it("positive control: the other organization's accountant still reads their OWN rows", async () => {
    for (const table of ["chart_of_accounts", "fiscal_periods", "banks", "bank_accounts", "cashboxes", "cheques", "budgets", "projects"] as const) {
      expect(await rows(P.accountantB.client, table), `accountantB → own ${table}`).toBeGreaterThan(0);
    }
  });

  it("a tenant never sees another tenant's rows, whatever the persona", async () => {
    for (const [client, own] of [[P.accountant.client, "A"], [P.accountantB.client, "B"]] as const) {
      for (const table of ["chart_of_accounts", "bank_accounts", "banks", "cashboxes", "cheques", "budgets"] as const) {
        const { data } = await client.from(table).select("*").limit(50);
        const text = JSON.stringify(data);
        expect(text.includes(own === "A" ? "SECRET-7-ACCT-NO" : "SECRET-1-ACCT-NO"), `${own} saw the other org's ${table}`).toBe(false);
      }
    }
  });

  it("bank account numbers are not exposed to roles that only hold finance.reports.read / payments.read", async () => {
    for (const who of ["cashier", "collector", "propertyManager"] as Persona[]) {
      const { data } = await P[who].client.from("bank_accounts").select("account_number");
      expect(data, who).toEqual([]);
    }
    const { data } = await P.accountant.client.from("bank_accounts").select("account_number");
    expect(data!.map((r) => r.account_number)).toEqual(["SECRET-1-ACCT-NO"]);
  });
});

describe("collection cycle (collector sees what it needs, no more)", () => {
  it("collector reads the cashbox GL account, the open period, asset accounts, due types and its own open session", async () => {
    const box = await P.collector.client.from("cashboxes").select("id,gl_account_id");
    expect(box.data).toHaveLength(1);
    expect(box.data![0].gl_account_id).toBeTruthy();
    const period = await P.collector.client.from("fiscal_periods").select("id").eq("status", "OPEN");
    expect(period.data!.length).toBeGreaterThan(0);
    const accounts = await P.collector.client.from("chart_of_accounts").select("id").eq("category", "ASSET");
    expect(accounts.data!.length).toBeGreaterThan(0);
    expect(await rows(P.collector.client, "due_types")).toBeGreaterThan(0);
    const own = await P.collector.client.from("cashier_sessions").select("id,opened_by").eq("status", "OPEN");
    expect(own.data).toEqual([{ id: ids.collectorSession, opened_by: P.collector.id }]);
  });
  it("collector cannot read another user's cashier session, cash movements, banks, bank accounts, budgets, projects or the ledger lines", async () => {
    const others = await P.collector.client.from("cashier_sessions").select("id").eq("id", ids.cashierSession);
    expect(others.data).toEqual([]);
    for (const t of ["cash_transactions", "banks", "bank_accounts", "budgets", "projects", "journal_entry_lines", "fiscal_years", "cost_centers", "expense_categories"]) {
      expect(await rows(P.collector.client, t), t).toBe(0);
    }
    const tb = await P.collector.client.rpc("get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` });
    expect(tb.error?.code).toBe("42501");
  });
  it("a collector of another organization cannot read org A's session even though the role is identical", async () => {
    const { data } = await P.collectorB.client.from("cashier_sessions").select("id").eq("id", ids.collectorSession);
    expect(data).toEqual([]);
  });
});

describe("guard and technician (non-finance operational roles)", () => {
  for (const who of ["guard", "technician"] as Persona[]) {
    it(`${who} reads no finance table and no finance RPC`, async () => {
      for (const t of TABLES) expect(await rows(P[who].client, t), `${who} → ${t}`).toBe(0);
      for (const [fn, args] of [
        ["get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }],
        ["list_projects", { p_organization_id: orgA }],
        ["get_cash_position", { p_organization_id: orgA, p_as_of_date: `${year}-12-31` }],
      ] as const) {
        expect((await P[who].client.rpc(fn, args)).error?.code, `${who} ${fn}`).toBe("42501");
      }
    });
    it(`${who} still reads the operational data it needs (units, properties, members)`, async () => {
      expect(await rows(P[who].client, "properties")).toBeGreaterThan(0);
      expect(await rows(P[who].client, "units")).toBeGreaterThan(0);
    });
  }
});

describe("owner (portal member, not an organization member)", () => {
  it("reads only their own dues and unit, and none of the finance reference tables", async () => {
    const dues = await P.owner.client.from("dues").select("description,amount");
    expect(dues.data).toEqual([{ description: "FRP due", amount: 500 }]);
    expect(await rows(P.owner.client, "units")).toBe(1);
    for (const t of TABLES) expect(await rows(P.owner.client, t), `owner → ${t}`).toBe(0);
    expect(await rows(P.owner.client, "members")).toBe(1);
  });
  it("owner is refused every finance RPC", async () => {
    for (const [fn, args] of [
      ["get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }],
      ["list_projects", { p_organization_id: orgA }],
    ] as const) expect((await P.owner.client.rpc(fn, args)).error?.code).toBe("42501");
  });
});

describe("invited, suspended and other-organization users", () => {
  for (const who of ["invited", "suspended", "accountantB"] as Persona[]) {
    it(`${who} reads nothing of organization A`, async () => {
      for (const t of TABLES) expect(await rowsOfOrgA(P[who].client, t), `${who} → ${t}`).toBe(0);
      expect((await P[who].client.rpc("list_projects", { p_organization_id: orgA })).error?.code).toBe("42501");
    });
  }
});

describe("allowed personas still work through the RPCs", () => {
  it("accountant: list_projects, trial balance", async () => {
    expect((await P.accountant.client.rpc("list_projects", { p_organization_id: orgA })).error).toBeNull();
    expect((await P.accountant.client.rpc("get_trial_balance", { p_organization_id: orgA, p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` })).error).toBeNull();
  });
  it("property manager is refused list_projects (project budgets are finance data)", async () => {
    expect((await P.propertyManager.client.rpc("list_projects", { p_organization_id: orgA })).error?.code).toBe("42501");
  });
});

describe("policy structure: multiple policies cannot reopen membership-only access", () => {
  it("every one of the 16 tables has only its *_manage policy and one permission-keyed SELECT policy (no is_org_member read)", () => {
    const list = TABLES.map((t) => `'${t}'`).join(",");
    const rowsOut = sql(`select tablename||'|'||policyname||'|'||cmd||'|'||coalesce(regexp_replace(qual,'[[:space:]]+',' ','g'),'') from pg_policies where schemaname='public' and tablename in (${list}) and cmd in ('SELECT','ALL') order by 1`).split("\n");
    const byTable = new Map<string, string[]>();
    for (const r of rowsOut) {
      const [t, name, cmd, ...q] = r.split("|");
      const qual = q.join("|");
      byTable.set(t, [...(byTable.get(t) ?? []), name]);
      expect(name, `${t}: legacy membership policy still present`).not.toMatch(/_select_member$/);
      // chart_of_accounts, fiscal_periods, fiscal_years, journal_entries, journal_entry_lines and dues were moved to the set-based form (migrations 20261017100900 .. 101200): same keys, the permission
      // lookup is done once per statement through orgs_with_permission_keys() instead of per row through has_any_permission(). Equivalence is proven in
      // rls-set-based-policies-equivalence / rls-fiscal-years-equivalence; the other tables keep the per-row helper.
      if (name.endsWith("_select_permission")) {
        const setBased = ["chart_of_accounts", "fiscal_periods", "fiscal_years", "journal_entries", "journal_entry_lines", "dues"].includes(t);
        expect(qual, `${t}`).toMatch(setBased ? /orgs_with_permission_keys/ : /has_any_permission/);
      }
      if (cmd === "SELECT" && t !== "cashier_sessions") expect(qual, `${t}.${name} must not be membership-only`).not.toMatch(/is_org_member/);
      if (t === "cashier_sessions" && cmd === "SELECT") expect(qual).toMatch(/opened_by = auth\.uid\(\)/);
    }
    for (const t of TABLES) {
      const names = byTable.get(t) ?? [];
      expect(names.filter((n) => n.endsWith("_select_permission")), t).toHaveLength(1);
      expect(names.every((n) => n.endsWith("_select_permission") || n.endsWith("_manage")), `${t}: ${names.join(",")}`).toBe(true);
    }
  });
  it("has_any_permission takes no user id and is not executable by anon", () => {
    expect(sql(`select pg_get_function_identity_arguments('public.has_any_permission(uuid,text[])'::regprocedure)`)).toBe("p_organization_id uuid, p_permission_keys text[]");
    expect(sql(`select has_function_privilege('anon','public.has_any_permission(uuid,text[])','execute')`)).toBe("f");
  });
});
