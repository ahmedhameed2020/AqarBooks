import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { addBankAccount, adminClient, createJourneyFixture, localEnv, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Deposit account of a receipt (migration 20261018100000): the account must be ASSET, active, a leaf, and the GL account of an ACTIVE cash box or
 * bank account of the SAME organization. Not a block on one code: 1130 is refused because it is linked to nothing, any unlinked asset account is
 * refused the same way, and an account that IS linked is accepted whatever its code.
 * Real sessions (RLS, RPC grants), real fixture organizations, isolated stack only. Direct RPC calls: the screen's list is only a convenience.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };
const err = (r: Rpc) => `${r.error?.code ?? ""}:${r.error?.message ?? ""}`;
const DATE = "2026-08-10";
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`);

let fx: JourneyFixture;      // starts with NO cash box and NO bank account (the legacy case)
let other: JourneyFixture;   // has the standard till on 1110
let owner: Client, accountant: Client, auditor: Client, otherAccountant: Client;
let due = "";
let bankGl = "";

/** every table a receipt writes to, as one string: a refused call must leave it unchanged */
const snap = (orgId: string) => q(`select (select count(*) from public.payments where organization_id='${orgId}')||'/'||
  (select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}')||'/'||
  (select count(*) from public.journal_entries where organization_id='${orgId}')||'/'||
  (select count(*) from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${orgId}')||'/'||
  (select count(*) from public.platform_audit_logs where organization_id='${orgId}')`);

const advance = (c: Client, f: JourneyFixture, account: string | null, o: { amount?: number; method?: string; key?: string } = {}) =>
  c.rpc("record_advance_payment", {
    p_organization_id: f.orgId, p_resort_id: f.propertyId, p_member_id: f.member.id, p_unit_id: f.unit.id, p_amount: o.amount ?? 100,
    p_method: o.method ?? "CASH", p_payment_date: DATE, p_deposit_account_id: account, p_fiscal_period_id: periodOf(f.orgId, DATE),
    p_allocations: [], p_idempotency_key: o.key ?? randomUUID(),
  }) as PromiseLike<Rpc>;
const pay = (c: Client, f: JourneyFixture, account: string | null, o: { amount?: number; method?: string; key?: string } = {}) =>
  c.rpc("record_payment", {
    p_organization_id: f.orgId, p_resort_id: f.propertyId, p_member_id: f.member.id, p_unit_id: f.unit.id, p_amount: o.amount ?? 100,
    p_method: o.method ?? "CASH", p_payment_date: DATE, p_deposit_account_id: account, p_fiscal_period_id: periodOf(f.orgId, DATE),
    p_allocations: [{ due_id: due, amount: o.amount ?? 100 }], p_idempotency_key: o.key ?? randomUUID(),
  }) as PromiseLike<Rpc>;
type Caller = (c: Client, f: JourneyFixture, account: string | null, o?: { amount?: number; method?: string; key?: string }) => PromiseLike<Rpc>;

/** must be refused with DEPOSIT_ACCOUNT_INVALID and leave NO trace */
async function refused(call: Caller, account: string | null, label: string) {
  const before = await snap(fx.orgId);
  const r = await call(accountant, fx, account);
  expect(r.error, `${label}: expected a refusal`).not.toBeNull();
  expect(err(r), label).toMatch(/22023.*DEPOSIT_ACCOUNT_INVALID|DEPOSIT_ACCOUNT_INVALID/);
  expect(await snap(fx.orgId), `${label}: a refused call left a trace`).toBe(before);
}
const acct = (code: string) => fx.accounts[code];
const codes = (rows: unknown) => ((rows ?? []) as { code: string; source: string }[]).map((r) => `${r.code}:${r.source}`).join(",");

beforeAll(async () => {
  fx = await createJourneyFixture("dep-a", { linkCashAccount: false });
  other = await createJourneyFixture("dep-b");
  const admin = adminClient();
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  auditor = await signedInClient(fx.auditor.email);
  otherAccountant = await signedInClient(other.accountant.email);
  ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: acct("2250") }));
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  const issued = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: acct("1130"), p_amount: 5000, p_issue_date: "2026-08-01", p_due_date: "2026-08-01", p_description: "DEP-D1" });
  expect(issued.error, issued.error?.message).toBeNull();
  due = q(`select id from public.dues where organization_id='${fx.orgId}' and description='DEP-D1'`).split("\n")[0];
  expect(admin).toBeTruthy();
}, 600_000);

describe.sequential("1. legacy organization: the cash account was never linked to a cash box", () => {
  it("the receipts screen's list is empty", async () => {
    const r = ok<unknown[]>(await accountant.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId }));
    expect(r).toEqual([]);
  });
  it("record_payment and record_advance_payment to the standard cash account 1110 are refused (linking is the remedy; nothing is linked automatically)", async () => {
    await refused(pay, acct("1110"), "record_payment 1110 (unlinked)");
    await refused(advance, acct("1110"), "record_advance_payment 1110 (unlinked)");
    expect(q(`select count(*) from public.cashboxes where organization_id='${fx.orgId}'`)).toBe("0");
  });
});

describe.sequential("2. linked accounts are accepted, whatever their code", () => {
  it("after the till is linked to 1110, the list offers exactly 1110 and both receipts are accepted", async () => {
    await adminClient().from("cashboxes").insert({ organization_id: fx.orgId, property_id: fx.propertyId, name: "Main till", gl_account_id: acct("1110") });
    expect(codes(ok(await accountant.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId })))).toBe("1110:CASHBOX");
    const a = ok<{ payment_id: string }>(await advance(accountant, fx, acct("1110")));
    expect(a.payment_id).toMatch(/^[0-9a-f-]{36}$/);
    ok(await pay(accountant, fx, acct("1110")));
    expect(q(`select a.code from public.payments p join public.journal_entry_lines l on l.journal_entry_id=p.journal_entry_id and l.debit>0 join public.chart_of_accounts a on a.id=l.account_id where p.id='${a.payment_id}'`)).toBe("1110");
  });
  it("a bank account's GL account is accepted too (1120), listed as BANK", async () => {
    const bank = await addBankAccount(fx);
    expect(bank.bankAccountId).toBeTruthy();
    bankGl = acct("1120");
    expect(codes(ok(await accountant.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId })))).toBe("1110:CASHBOX,1120:BANK");
    ok(await advance(accountant, fx, bankGl, { method: "BANK_TRANSFER" }));
  });
  it("the rule is the link, not the code: an unrelated leaf asset account (1140) becomes valid once a cash box points at it, and invalid again when that box is deactivated", async () => {
    // 1140 is an ordinary asset account in the standard chart (not cash-like): the accounts manager reclassifies it as petty cash, then links it
    q(`update public.chart_of_accounts set is_cash_equivalent=true where id='${acct("1140")}'`);
    const box = await adminClient().from("cashboxes").insert({ organization_id: fx.orgId, property_id: fx.propertyId, name: "Petty cash", gl_account_id: acct("1140") }).select("id").single();
    expect(box.error).toBeNull();
    ok(await advance(accountant, fx, acct("1140")));
    expect(q(`update public.cashboxes set is_active=false where id='${box.data!.id}' returning 1`).split("\n")[0]).toBe("1");
    await refused(advance, acct("1140"), "1140 after its cash box was deactivated");
    await refused(pay, acct("1140"), "1140 after its cash box was deactivated (record_payment)");
  });
});

describe.sequential("3. direct invalid requests are refused by the server, with no trace (screen filtering is irrelevant)", () => {
  for (const [name, call] of [["record_payment", pay], ["record_advance_payment", advance]] as [string, Caller][]) {
    it(`${name}: the receivables control account 1130 (linked to nothing)`, async () => { await refused(call, acct("1130"), `${name} 1130`); });
    it(`${name}: another unlinked leaf asset account (1210)`, async () => { await refused(call, acct("1210"), `${name} 1210`); });
    it(`${name}: a group account (1100), a liability account (2250), a random id, null`, async () => {
      await refused(call, acct("1100"), `${name} group`);
      await refused(call, acct("2250"), `${name} liability`);
      await refused(call, randomUUID(), `${name} random id`);
      await refused(call, null, `${name} null`);
    });
    it(`${name}: a valid account of ANOTHER organization`, async () => { await refused(call, other.accounts["1110"], `${name} foreign 1110`); });
    it(`${name}: a LEGACY cash box on a liability / inactive / group account does not make it valid`, async () => {
      for (const [code, mutate] of [["1130", ""], ["1140", ""], ["2250", ""], ["1220", "update public.chart_of_accounts set is_active=false where id='ID'"], ["1200", ""]] as const) {
        const id = acct(code);
        if (q(`select count(*) from public.cashboxes where organization_id='${fx.orgId}' and gl_account_id='${id}'`) === "0") {
          // a LEGACY bad link: rows written before the link triggers existed (or by a superuser); the triggers are bypassed for this one statement
          q(`set session_replication_role = replica; insert into public.cashboxes(organization_id, property_id, name, gl_account_id) values ('${fx.orgId}','${fx.propertyId}','bad-${code}','${id}')`);
        }
        if (mutate) q(mutate.replace("ID", id));
        await refused(call, id, `${name} cash box on ${code}`);
      }
    });
  }
  it("the same refusals hold for a receipt-only user and nothing leaks: the error names no organization data", async () => {
    const r = await accountant.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 1, p_method: "CASH", p_payment_date: DATE, p_deposit_account_id: acct("1130"), p_fiscal_period_id: periodOf(fx.orgId, DATE), p_allocations: [], p_idempotency_key: randomUUID() });
    expect(err(r)).not.toMatch(new RegExp(fx.orgId));
  });
});

describe.sequential("4. the screen's list and the server rule are the same relation; who may call what", () => {
  it("list_deposit_accounts equals the set of accounts deposit_account_is_valid accepts", async () => {
    const list = (ok<{ code: string }[]>(await accountant.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId }))).map((r) => r.code).sort().join(",");
    const accepted = q(`select coalesce(string_agg(code, ',' order by code), '') from public.chart_of_accounts where organization_id='${fx.orgId}' and public.deposit_account_is_valid(organization_id, id)`);
    expect(accepted).toBe("1110,1120");
    expect(list).toBe(accepted);
  });
  it("a user without the receipt permission, a member of another organization and anon get nothing; the validity function is not callable by users", async () => {
    expect(ok<unknown[]>(await auditor.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId }))).toEqual([]);
    expect(ok<unknown[]>(await otherAccountant.rpc("list_deposit_accounts", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId }))).toEqual([]);
    expect(codes(ok(await otherAccountant.rpc("list_deposit_accounts", { p_organization_id: other.orgId, p_resort_id: other.propertyId })))).toBe("1110:CASHBOX");
    const env = localEnv();
    const anon = createClient(env.url, env.anon, { auth: { persistSession: false } });
    expect((await anon.rpc("list_deposit_accounts", { p_organization_id: fx.orgId })).error?.code).toBe("42501");
    const direct = await accountant.rpc("deposit_account_is_valid", { p_organization_id: fx.orgId, p_account_id: acct("1110") });
    expect(direct.error?.code, "authenticated users must not be able to probe accounts of an organization").toBe("42501");
  });
});

describe.sequential("5. a retry of an already-posted receipt is not re-validated", () => {
  it("the same idempotency key returns the stored receipt after the cash box was deactivated, and posts nothing", async () => {
    const key = randomUUID();
    const first = ok<{ payment_id: string }>(await advance(accountant, fx, acct("1110"), { key }));
    q(`update public.cashboxes set is_active=false where organization_id='${fx.orgId}' and gl_account_id='${acct("1110")}'`);
    try {
      const before = await snap(fx.orgId);
      const again = ok<{ payment_id: string; replay: boolean }>(await advance(accountant, fx, acct("1110"), { key }));
      expect([again.payment_id, again.replay]).toEqual([first.payment_id, true]);
      expect(await snap(fx.orgId)).toBe(before);
      await refused(advance, acct("1110"), "a NEW receipt to the deactivated till");
    } finally {
      q(`update public.cashboxes set is_active=true where organization_id='${fx.orgId}' and gl_account_id='${acct("1110")}'`);
    }
  });
});

describe("6. the migration itself", () => {
  const text = readFileSync("supabase/migrations/20261018100000_deposit_account_cash_or_bank.sql", "utf8").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  it("changes functions and two triggers only: no DML, no column / constraint / index change, no backfill, so no stored receipt or account is touched", () => {
    // the only DDL on tables are the two link triggers (DROP TRIGGER IF EXISTS of our own trigger, then CREATE TRIGGER); no column, constraint, index or row changes
    // the audit function writes a row when a flag changes (at trigger time, not at migration time): cut it out before looking for migration-time DML
    const auditFn = /CREATE OR REPLACE FUNCTION public\.log_coa_cash_equivalent_change\(\)[\s\S]*?\$\$;/;
    expect(text, "the audit function is part of the migration").toMatch(auditFn);
    const withoutOwnTriggerDrops = text.replace(auditFn, "").replace(/DROP TRIGGER IF EXISTS trg_(cashboxes|bank_accounts)_validate_gl_account ON public\.(cashboxes|bank_accounts);/g, "").replace(/DROP TRIGGER IF EXISTS trg_coa_cash_equivalent_audit ON public\.chart_of_accounts;/g, "");
    expect(withoutOwnTriggerDrops).not.toMatch(/(INSERT\s+INTO|UPDATE\s+public|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+)/i);
  });
  it("keeps the signatures and grants of the two receipt functions (anon cannot execute them; authenticated can)", () => {
    const acl = (fn: string) => q(`select has_function_privilege('anon', '${fn}', 'execute')::text||'/'||has_function_privilege('authenticated', '${fn}', 'execute')::text`);
    expect(acl("public.record_payment(uuid,uuid,uuid,uuid,numeric,text,date,uuid,uuid,jsonb,text,uuid)")).toBe("false/true");
    expect(acl("public.record_advance_payment(uuid,uuid,uuid,uuid,numeric,text,date,uuid,uuid,jsonb,text,uuid)")).toBe("false/true");
    expect(acl("public.deposit_account_is_valid(uuid,uuid)")).toBe("false/false");
    expect(acl("public.list_deposit_accounts(uuid,uuid)")).toBe("false/true");
  });
});
