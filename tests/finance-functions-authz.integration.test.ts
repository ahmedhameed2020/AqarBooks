/**
 * Phase 1.2 — remaining finance functions flagged in the Phase 1.1 report (LOCAL ONLY, user sessions).
 *
 *  post_fx_difference                 posted a journal entry through the unguarded internals for ANY
 *                                     organization id; now requires finance.entries.create.
 *  post_supplier_invoice_in_currency  posting was already guarded by the inner post_supplier_invoice;
 *                                     its pre-reads (org lookup, exchange-rate probe) ran first and
 *                                     disclosed data to non-members. Now authorizes first.
 *  run_due_schedules                  cron batch entry point; no longer client-callable.
 *
 * The decision for each was taken from the function bodies, their callers and a structural sweep of
 * SECURITY DEFINER functions that reach the posting internals (only post_fx_difference lacked a check),
 * then proved here by behaviour rather than by text.
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
type U = { id: string; client: SupabaseClient };
const u = {} as Record<"accountantA" | "collectorA" | "accountantB" | "invitedA" | "suspendedA", U>;
let anon: SupabaseClient;
const fx = { prop: "", period: "", counter: "", gain: "", loss: "" };

async function makeUser(label: string): Promise<U> {
  const email = `ffa-${label}-${randomUUID()}@test.local`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const client = createClient(env.API_URL, env.ANON_KEY, opts);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: created.data.user.id, client };
}

beforeAll(async () => {
  anon = createClient(env.API_URL, env.ANON_KEY, opts);
  for (const [id, n] of [[orgA, "A"], [orgB, "B"]] as const) {
    sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${id}','FFA ${n}','${id}','EGP','ACTIVE')`);
    expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: id })).error).toBeNull();
  }
  for (const k of Object.keys({ accountantA: 1, collectorA: 1, accountantB: 1, invitedA: 1, suspendedA: 1 }) as (keyof typeof u)[]) u[k] = await makeUser(k);
  const tpl = (org: string, key: string) => sql(`select id from public.roles where organization_id='${org}' and key='${key}'`);
  const join = (org: string, user: string, status: string, role: string) =>
    sql(`insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${user}','${status}');
         insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${user}','${role}')`);
  join(orgA, u.accountantA.id, "active", tpl(orgA, "ACCOUNTANT"));
  join(orgA, u.collectorA.id, "active", tpl(orgA, "COLLECTOR"));
  join(orgA, u.invitedA.id, "invited", tpl(orgA, "ACCOUNTANT"));
  join(orgA, u.suspendedA.id, "suspended", tpl(orgA, "ACCOUNTANT"));
  join(orgB, u.accountantB.id, "active", tpl(orgB, "ACCOUNTANT"));

  const acct = (code: string, cat: string, nb: string) => {
    const id = randomUUID();
    sql(`insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active) values('${id}','${orgA}','${code}','${code}','${code}','${cat}','${nb}',false,true)`);
    return id;
  };
  fx.counter = acct("2100", "LIABILITY", "CREDIT");
  fx.gain = acct("4900", "REVENUE", "CREDIT");
  fx.loss = acct("5900", "EXPENSE", "DEBIT");
  fx.prop = randomUUID();
  sql(`update public.organizations set fx_gain_account_id='${fx.gain}', fx_loss_account_id='${fx.loss}' where id='${orgA}';
       insert into public.properties(id,organization_id,name,code) values('${fx.prop}','${orgA}','FFA','${fx.prop}')`);

  // Fiscal calendar through the product RPCs as a signed-in TENANT_OWNER (the guard refuses direct writes).
  // The entries are dated ${year}-02-01, so the period under test is the monthly period containing that date.
  const owner = await makeUser("owner");
  join(orgA, owner.id, "active", tpl(orgA, "TENANT_OWNER"));
  await createOpenFiscalYear(admin, owner.client, {
    orgId: orgA, name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31`,
  });
  const { data: febPeriod, error: febErr } = await admin.from("fiscal_periods").select("id")
    .eq("organization_id", orgA).lte("start_date", `${year}-02-01`).gte("end_date", `${year}-02-01`).single();
  expect(febErr, febErr?.message).toBeNull();
  fx.period = febPeriod!.id as string;
});

const entriesOfA = () => Number(sql(`select count(*) from public.journal_entries where organization_id='${orgA}'`));
const args = (key: string, diff = 25) => ({
  p_organization_id: orgA, p_property_id: fx.prop, p_fiscal_period_id: fx.period, p_entry_date: `${year}-02-01`,
  p_difference: diff, p_counter_account_id: fx.counter, p_description: "ffa fx", p_idempotency_key: key,
});

describe("post_fx_difference", () => {
  it("is refused for another organization's accountant, a collector, an invited and a suspended member, and anon — and posts nothing", async () => {
    const before = entriesOfA();
    for (const [who, client] of [["accountantB", u.accountantB.client], ["collectorA", u.collectorA.client], ["invitedA", u.invitedA.client], ["suspendedA", u.suspendedA.client], ["anon", anon]] as const) {
      const res = await client.rpc("post_fx_difference", args(`ffa-denied-${who}-${randomUUID()}`));
      expect(res.error?.code, `${who}: ${res.error?.message}`).toBe("42501");
      expect(res.data).toBeNull();
    }
    expect(entriesOfA(), "no journal entry may be created by a refused caller").toBe(before);
  });

  it("works for an authorized accountant of the organization: balanced, POSTED, in the right organization", async () => {
    const before = entriesOfA();
    const res = await u.accountantA.client.rpc("post_fx_difference", args(`ffa-ok-${randomUUID()}`));
    expect(res.error, res.error?.message).toBeNull();
    expect(res.data).toBeTruthy();
    expect(entriesOfA()).toBe(before + 1);
    const entry = sql(`select status||'|'||organization_id from public.journal_entries where id='${res.data}'`);
    expect(entry).toBe(`POSTED|${orgA}`);
    const sums = sql(`select sum(debit)||'|'||sum(credit) from public.journal_entry_lines where journal_entry_id='${res.data}'`);
    expect(sums).toBe("25.0000|25.0000");
  });

  it("the path that legitimately reaches it (settle_supplier_invoice_fx_difference) keeps its own permission check", () => {
    const def = sql(`select pg_get_functiondef(p.oid) from pg_proc p where p.proname='settle_supplier_invoice_fx_difference'`);
    expect(def).toContain("finance.entries.create");
    expect(def).toContain("post_fx_difference");
  });
});

describe("post_supplier_invoice_in_currency", () => {
  const call = (client: SupabaseClient, org: string, currency: string) =>
    client.rpc("post_supplier_invoice_in_currency", {
      p_organization_id: org, p_resort_id: fx.prop, p_supplier_id: randomUUID(), p_purchase_order_id: null,
      p_invoice_number: "FFA-1", p_expense_account_id: fx.loss, p_net_amount: 100, p_discount_amount: 0,
      p_vat_rate: 0, p_vat_account_id: null, p_wht_rate: 0, p_wht_account_id: null,
      p_invoice_date: `${year}-02-01`, p_due_date: `${year}-03-01`, p_fiscal_period_id: fx.period,
      p_currency: currency, p_exchange_rate: null,
    });

  it("answers a non-member identically whether or not the organization exists or holds an exchange rate (no probe)", async () => {
    const real = await call(u.accountantB.client, orgA, "USD");
    const ghost = await call(u.accountantB.client, randomUUID(), "USD");
    const sameCcy = await call(u.accountantB.client, orgA, "EGP");
    for (const [name, res] of [["real org, foreign currency", real], ["nonexistent org", ghost], ["real org, base currency", sameCcy]] as const) {
      expect(res.error?.code, `${name}: ${res.error?.message}`).toBe("42501");
      expect(res.error?.message, name).toContain("FORBIDDEN_FINANCE_PERMISSION");
    }
  });
  it("refuses a collector, an invited member and anon before reading anything", async () => {
    for (const [who, client] of [["collectorA", u.collectorA.client], ["invitedA", u.invitedA.client], ["anon", anon]] as const) {
      const res = await call(client, orgA, "USD");
      expect(res.error?.code, `${who}: ${res.error?.message}`).toBe("42501");
    }
    expect(Number(sql(`select count(*) from public.supplier_invoices where organization_id='${orgA}'`))).toBe(0);
  });
  it("an authorized accountant passes the guard and then meets the real business rule (missing rate / supplier)", async () => {
    const res = await call(u.accountantA.client, orgA, "USD");
    expect(res.error?.code).not.toBe("42501");
    expect(res.error?.message).toMatch(/EXCHANGE_RATE_MISSING/);
  });
});

describe("run_due_schedules", () => {
  it("is not callable by signed-in users or anon, and the server key keeps it (grant only; not executed here)", async () => {
    for (const [who, client] of [["accountantA", u.accountantA.client], ["accountantB", u.accountantB.client], ["anon", anon]] as const) {
      const res = await client.rpc("run_due_schedules");
      expect(res.error?.code, `${who}: ${res.error?.message}`).toBe("42501");
    }
    expect(sql(`select has_function_privilege('authenticated','public.run_due_schedules()','execute')`)).toBe("f");
    expect(sql(`select has_function_privilege('anon','public.run_due_schedules()','execute')`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role','public.run_due_schedules()','execute')`)).toBe("t");
  });
  it("nothing in the application calls it (cron/privileged scheduler only)", () => {
    // A signed-in caller was never intended: the batch spans every organization.
    const callers = sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname<>'run_due_schedules' and pg_get_functiondef(oid) ~ 'run_due_schedules'`);
    expect(callers).toBe("0");
  });
});

describe("structural sweep: no client-callable SECURITY DEFINER function reaches the posting internals without an identity/permission check", () => {
  it("lists none", () => {
    const offenders = sql(`select string_agg(p.proname, ',' order by p.proname) from pg_proc p
      where p.pronamespace='public'::regnamespace and p.prokind='f' and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'execute')
        and pg_get_functiondef(p.oid) ~ 'create_journal_entry_internal|post_journal_entry_internal|post_payment_internal'
        and p.proname not in ('create_journal_entry_internal','post_journal_entry_internal','post_payment_internal')
        and pg_get_functiondef(p.oid) !~* 'has_permission|has_financial_permission|is_platform_admin|auth\\.uid\\(\\)'`);
    expect(offenders).toBe("");
  });
});
