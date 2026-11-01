/**
 * Phase 1 — financial-report authorization and tenant isolation (LOCAL ONLY).
 *
 * Fixtures (users, organizations, journals) are created with the LOCAL service key because
 * there is no other way to seed auth users. Every authorization assertion below is made
 * through a real signed-in (or anonymous) session -- never service_role -- so it exercises
 * auth.uid(), has_permission(), RLS and EXECUTE grants exactly as a browser user would.
 *
 * Refuses to run unless `supabase status` reports a 127.0.0.1 API (see helpers/gate-release).
 * Fixture rows use random UUIDs and are not deleted (journal rows are append-only).
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { localSupabase, password, sql } from "./helpers/gate-release";
import { createOpenFiscalYear } from "./helpers/fiscal-calendar";

// Fixture seeding runs docker psql calls; the default 10 s hook timeout is not enough.
vi.setConfig({ hookTimeout: 180_000, testTimeout: 60_000 });

const year = new Date().getFullYear();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

type Tb = { account_id: string; code: string; total_debit: string; total_credit: string; balance: string; normal_balance: string };

describe("get_trial_balance and finance helpers — authorization (user sessions)", () => {
  const env = localSupabase();
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, opts);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const acc = { a: {} as Record<string, string>, b: {} as Record<string, string> };
  const users = {} as Record<"accountantA" | "noPermA" | "noRoleA" | "suspendedA" | "invitedA" | "accountantB" | "stranger", { id: string; client: SupabaseClient }>;
  let anon: SupabaseClient;

  async function makeUser(label: string) {
    const email = `fra-${label}-${randomUUID()}@test.local`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`user ${label}: ${created.error?.message}`);
    const client = createClient(env.API_URL, env.ANON_KEY, opts);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    return { id: created.data.user.id, client };
  }

  async function seedLedger(org: string, key: "a" | "b", scale: number, owner: SupabaseClient) {
    const q = (code: string, cat: string, nb: string) => {
      const id = randomUUID();
      sql(`insert into public.chart_of_accounts(id,organization_id,code,name_ar,name_en,category,normal_balance,is_group,is_active)
        values('${id}','${org}','${code}','${code}','${code}','${cat}','${nb}',false,true)`);
      acc[key][code] = id;
    };
    q("1100", "ASSET", "DEBIT"); q("3100", "EQUITY", "CREDIT"); q("4100", "REVENUE", "CREDIT"); q("5100", "EXPENSE", "DEBIT");
    // Fiscal calendar through the product RPCs as the organization's TENANT_OWNER (the guard refuses direct writes).
    await createOpenFiscalYear(admin, owner, { orgId: org, name: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    await createOpenFiscalYear(admin, owner, { orgId: org, name: String(year - 1), startDate: `${year - 1}-01-01`, endDate: `${year - 1}-12-31` });
    // Each entry is posted into the monthly period that contains its date.
    const periodOn = (date: string) => sql(`select id from public.fiscal_periods where organization_id='${org}' and '${date}'::date between start_date and end_date`);
    const entry = (date: string, dr: string, cr: string, amount: number, post: boolean, tag: string) => {
      const id = sql(`select public.create_journal_entry_internal('${org}'::uuid,null,'${periodOn(date)}'::uuid,'${date}'::date,'${tag}','JOURNAL_VOUCHER',
        jsonb_build_array(jsonb_build_object('account_id','${acc[key][dr]}','debit',${amount * scale},'credit',0),jsonb_build_object('account_id','${acc[key][cr]}','debit',0,'credit',${amount * scale})),'fra-${org}-${tag}')`);
      if (post) sql(`select public.post_journal_entry_internal('${id}'::uuid)`);
    };
    entry(`${year}-01-01`, "1100", "3100", 1000, true, "opening-balance");   // opening balance, inside the period
    entry(`${year}-03-01`, "1100", "4100", 100, true, "posted-in-period");
    entry(`${year}-03-02`, "1100", "4100", 50, false, "draft-in-period");     // draft: must be excluded
    entry(`${year - 1}-06-01`, "1100", "4100", 70, true, "posted-prior-year"); // out of period: must be excluded
    entry(`${year}-04-01`, "5100", "1100", 30, true, "posted-expense");
  }

  beforeAll(async () => {
    anon = createClient(env.API_URL, env.ANON_KEY, opts);
    for (const k of Object.keys({ accountantA: 1, noPermA: 1, noRoleA: 1, suspendedA: 1, invitedA: 1, accountantB: 1, stranger: 1 }) as (keyof typeof users)[]) {
      users[k] = await makeUser(k);
    }
    for (const [org, name] of [[orgA, "A"], [orgB, "B"]] as const) {
      sql(`insert into public.organizations(id,name,slug,default_currency,status) values('${org}','FRA ${name}','${org}','EGP','ACTIVE')`);
      expect((await admin.rpc("clone_tenant_role_templates", { p_organization_id: org })).error).toBeNull();
    }
    const role = (org: string, k: string, perm: string) => {
      const id = randomUUID();
      sql(`insert into public.roles(id,organization_id,key,name_ar,name_en) values('${id}','${org}','${k}','${k}','${k}');
        insert into public.role_permissions(role_id,permission_id) select '${id}',id from public.permissions where key='${perm}'`);
      return id;
    };
    const readerA = role(orgA, "FRA_READER", "finance.reports.read");
    const otherA = role(orgA, "FRA_OTHER", "finance.dues.read");
    const readerB = role(orgB, "FRA_READER", "finance.reports.read");
    const member = (org: string, u: string, status: string, r?: string) =>
      sql(`insert into public.organization_memberships(organization_id,user_id,status) values('${org}','${u}','${status}');
        ${r ? `insert into public.user_role_assignments(organization_id,user_id,role_id) values('${org}','${u}','${r}');` : ""}`);
    member(orgA, users.accountantA.id, "active", readerA);
    member(orgA, users.noPermA.id, "active", otherA);
    member(orgA, users.noRoleA.id, "active");
    member(orgA, users.suspendedA.id, "suspended", readerA);
    member(orgA, users.invitedA.id, "invited", readerA);
    member(orgB, users.accountantB.id, "active", readerB);
    // Dedicated TENANT_OWNER per organization: the fiscal RPCs need finance.periods.manage on a signed-in session.
    const tenantOwner = (org: string) => sql(`select id from public.roles where organization_id='${org}' and key='TENANT_OWNER'`);
    const ownerA = await makeUser("fiscal-owner-a");
    const ownerB = await makeUser("fiscal-owner-b");
    member(orgA, ownerA.id, "active", tenantOwner(orgA));
    member(orgB, ownerB.id, "active", tenantOwner(orgB));
    await seedLedger(orgA, "a", 1, ownerA.client);
    await seedLedger(orgB, "b", 7, ownerB.client); // distinct magnitudes so a cross-tenant leak is detectable
  });

  const tb = (c: SupabaseClient, org: string | null, from = `${year}-01-01`, to = `${year}-12-31`) =>
    c.rpc("get_trial_balance", { p_organization_id: org, p_start_date: from, p_end_date: to });
  const denied = (res: { data: unknown; error: { code?: string; message: string } | null }) => {
    expect(res.error, "expected a permission error").not.toBeNull();
    expect(["42501"]).toContain(res.error!.code);
    expect(res.data).toBeNull();
  };
  const row = (rows: Tb[], id: string) => rows.find((r) => r.account_id === id)!;

  describe("authorized user", () => {
    it("reads own organization's trial balance with correct totals", async () => {
      const { data, error } = await tb(users.accountantA.client, orgA);
      expect(error, error?.message).toBeNull();
      const rows = data as Tb[];
      expect(rows).toHaveLength(4);
      // cash: opening 1000 + posted 100 debit; expense payment 30 credit. Draft 50 and prior-year 70 excluded.
      const cash = row(rows, acc.a["1100"]);
      expect([+cash.total_debit, +cash.total_credit, +cash.balance]).toEqual([1100, 30, 1070]);
      // credit-normal accounts report the balance in their normal direction
      const rev = row(rows, acc.a["4100"]);
      expect([+rev.total_debit, +rev.total_credit, +rev.balance, rev.normal_balance]).toEqual([0, 100, 100, "CREDIT"]);
      const equity = row(rows, acc.a["3100"]);
      expect([+equity.total_credit, +equity.balance]).toEqual([1000, 1000]);
      const exp = row(rows, acc.a["5100"]);
      expect([+exp.total_debit, +exp.balance]).toEqual([30, 30]);
      // double entry: debits equal credits across the whole report
      const dr = rows.reduce((s, r) => s + +r.total_debit, 0);
      const cr = rows.reduce((s, r) => s + +r.total_credit, 0);
      expect(dr).toBe(cr);
      // nothing from the other tenant
      expect(rows.every((r) => Object.values(acc.a).includes(r.account_id))).toBe(true);
    });

    it("honours the requested period (prior-year-only range sees only the prior-year posted entry)", async () => {
      const { data, error } = await tb(users.accountantA.client, orgA, `${year - 1}-01-01`, `${year - 1}-12-31`);
      expect(error, error?.message).toBeNull();
      const rows = data as Tb[];
      expect(+row(rows, acc.a["1100"]).total_debit).toBe(70);
      expect(+row(rows, acc.a["4100"]).total_credit).toBe(70);
      expect(+row(rows, acc.a["3100"]).total_credit).toBe(0);
    });

    it("excludes draft entries even when they are inside the period", async () => {
      const { data } = await tb(users.accountantA.client, orgA, `${year}-03-02`, `${year}-03-02`);
      expect((data as Tb[]).every((r) => +r.total_debit === 0 && +r.total_credit === 0)).toBe(true);
    });

    it("the other tenant's accountant sees only their own (scaled) figures", async () => {
      const { data, error } = await tb(users.accountantB.client, orgB);
      expect(error, error?.message).toBeNull();
      expect(+row(data as Tb[], acc.b["1100"]).total_debit).toBe(7700);
    });
  });

  describe("denied callers", () => {
    it("organization A user cannot read organization B", async () => denied(await tb(users.accountantA.client, orgB)));
    it("organization B user cannot read organization A", async () => denied(await tb(users.accountantB.client, orgA)));
    it("signed-in user with no membership anywhere is denied", async () => denied(await tb(users.stranger.client, orgA)));
    it("active member with a role lacking finance.reports.read is denied", async () => denied(await tb(users.noPermA.client, orgA)));
    it("active member with no role at all is denied", async () => denied(await tb(users.noRoleA.client, orgA)));
    it("suspended membership (even with the reports role) is denied", async () => denied(await tb(users.suspendedA.client, orgA)));
    it("invited (not yet active) membership is denied", async () => denied(await tb(users.invitedA.client, orgA)));
    it("null organization id is denied, not treated as 'all'", async () => denied(await tb(users.accountantA.client, null)));
    it("unregistered (anon) caller is denied", async () => denied(await tb(anon, orgA)));
    it("a random organization id is denied", async () => denied(await tb(users.accountantA.client, randomUUID())));
  });

  describe("unguarded finance helpers (13) are no longer client-callable", () => {
    const calls: [string, Record<string, unknown>][] = [
      ["due_outstanding", { p_due_id: randomUUID() }],
      ["creditable_remaining", { p_due_id: randomUUID() }],
      ["depreciable_remaining", { p_asset_id: randomUUID() }],
      ["depreciation_for_period", { p_asset_id: randomUUID() }],
      ["resolve_due_buyer", { p_due_id: randomUUID() }],
      ["project_wip_summary", { p_project_id: randomUUID() }],
      ["check_fx_readiness", { p_organization_id: orgA }],
      ["check_asset_disposal_readiness", { p_organization_id: orgA }],
      ["resolve_input_tax_account", { p_organization_id: orgA }],
      ["resolve_output_tax_account", { p_organization_id: orgA }],
      ["get_exchange_rate", { p_organization_id: orgA, p_foreign_currency: "USD", p_base_currency: "EGP", p_date: `${year}-01-01` }],
      ["convert_to_base", { p_organization_id: orgA, p_amount: 1, p_currency: "USD", p_date: `${year}-01-01` }],
      ["compute_input_tax_split", { p_organization_id: orgA, p_expense_account_id: randomUUID(), p_supplier_id: randomUUID(), p_invoice_number: "x", p_vat_amount: 1, p_decimals: 2 }],
    ];
    for (const [fn, args] of calls) {
      it(`${fn} is denied to a signed-in authorized accountant and to anon`, async () => {
        for (const client of [users.accountantA.client, anon]) {
          const res = await client.rpc(fn, args);
          expect(res.error?.code, `${fn}: ${res.error?.message}`).toBe("42501");
          expect(res.data).toBeNull();
        }
      });
    }
  });

  describe("financial_audit_logs row visibility", () => {
    beforeAll(() => {
      // Insert audit rows directly (fixture) so visibility can be asserted from user sessions.
      for (const org of [orgA, orgB]) {
        sql(`insert into public.financial_audit_logs(organization_id,action,entity_type,entity_id,metadata,event_hash)
          values('${org}','DUE_ISSUED','journal_entry','${randomUUID()}','{"fixture":"fra"}'::jsonb,'fixture-${randomUUID()}')`);
      }
    });
    it("finance reader sees own organization's rows only", async () => {
      const { data, error } = await users.accountantA.client.from("financial_audit_logs").select("organization_id");
      expect(error, error?.message).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((r) => r.organization_id === orgA)).toBe(true);
    });
    it("active member without finance permission sees none", async () => {
      const { data } = await users.noPermA.client.from("financial_audit_logs").select("id");
      expect(data).toEqual([]);
    });
    it("suspended and non-member users see none", async () => {
      for (const u of [users.suspendedA, users.stranger]) {
        const { data } = await u.client.from("financial_audit_logs").select("id");
        expect(data).toEqual([]);
      }
    });
  });
});
