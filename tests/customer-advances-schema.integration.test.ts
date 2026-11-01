import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createJourneyFixture, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Phase 3a (customer advances): schema, backfill compatibility, triggers, views, grants.
 * Isolated stack only (the isolation gate refuses anything else before the first query). Fixtures are real: an organization
 * built by the product's own RPCs, receipts recorded by `record_payment`, reversed by the CURRENT `void_payment`.
 * Rows marked "synthetic" are inserted directly to exercise a constraint or trigger; they reference real journal entries.
 */
const q = (query: string) => sql(query);
const fails = (query: string, pattern: RegExp) => {
  let message = "";
  try { sql(query); } catch (e) { message = String((e as { stderr?: string; message?: string }).stderr ?? (e as Error).message); }
  expect(message, `expected a failure matching ${pattern}`).toMatch(pattern);
};

let fx: JourneyFixture;
let dueId = "";
let periodId = "";
let session: Awaited<ReturnType<typeof signedInClient>>;
let accountant: Awaited<ReturnType<typeof signedInClient>>;
const DATE = "2026-02-10";

async function receipt(amount: number, due: string | null, paymentDate = DATE) {
  const r = await accountant.rpc("record_payment", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: amount, p_method: "CASH",
    p_payment_date: paymentDate, p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodId,
    p_allocations: due ? [{ due_id: due, amount }] : [], p_idempotency_key: randomUUID(),
  });
  expect(r.error, r.error?.message).toBeNull();
  return r.data as string;
}

beforeAll(async () => {
  fx = await createJourneyFixture("adv-schema");
  const admin = adminClient();
  session = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  periodId = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", DATE).gte("end_date", DATE).single()).data!.id as string;
  const dueTypeId = (await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  const issued = await session.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: dueTypeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 1000, p_issue_date: "2026-02-01", p_due_date: "2026-02-15", p_description: "adv schema" });
  expect(issued.error, issued.error?.message).toBeNull();
  dueId = (await admin.from("dues").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
}, 300_000);

describe("structure", () => {
  it("adds the columns, views, functions and the request table", () => {
    const cols = (table: string) => q(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='${table}'`);
    for (const c of ["advance_amount", "advance_account_id", "request_hash"]) expect(cols("payments")).toContain(c);
    for (const c of ["applied_on", "reversed_on", "kind", "journal_entry_id", "reversal_journal_entry_id", "credit_account_id", "created_at", "created_by"]) expect(cols("payment_allocations")).toContain(c);
    expect(cols("organization_finance_settings")).toContain("customer_advance_account_id");
    expect(q("select count(*) from pg_class where relname in ('effective_payment_allocations','payment_credit_balances','payment_credit_requests') and relnamespace='public'::regnamespace")).toBe("3");
    expect(q("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('payment_allocations_as_of','payment_credit_balances_as_of')")).toBe("2");
  });
  it("the shipped chart template carries 2250 Customer Advances (LIABILITY, credit-normal, leaf) and a cloned organization gets it", () => {
    expect(q(`select category||'/'||normal_balance||'/'||is_group from public.chart_of_accounts where id='${fx.accounts["2250"]}'`)).toBe("LIABILITY/CREDIT/false");
  });
});

describe("legacy behaviour is unchanged (backfill + insert defaults)", () => {
  it("a receipt recorded by the unchanged record_payment gets applied_on = payment_date, kind RECEIPT, advance_amount 0", async () => {
    const pid = await receipt(400, dueId);
    expect(q(`select applied_on::text||'/'||kind||'/'||coalesce(reversed_on::text,'-') from public.payment_allocations where payment_id='${pid}'`)).toBe(`${DATE}/RECEIPT/-`);
    expect(q(`select advance_amount::text||'/'||coalesce(advance_account_id::text,'-') from public.payments where id='${pid}'`)).toBe("0.0000/-");
  });
  it("an allocation inserted WITHOUT the new columns (the record_online_payment / Accsys path) is filled by the insert trigger", () => {
    const pid = q(`select id from public.payments where organization_id='${fx.orgId}' order by created_at limit 1`);
    const id = q(`with x as (insert into public.payment_allocations(payment_id, due_id, amount) values('${pid}','${dueId}', 1) returning id, applied_on, kind) select applied_on::text||'/'||kind from x`).split("\n")[0];
    expect(id).toBe(`${DATE}/RECEIPT`);
    q(`delete from public.payment_allocations where payment_id='${pid}' and amount=1`); // synthetic row removed (no financial effect: never counted)
  });
  it("an Accsys-style imported receipt (unallocated_amount > 0, no advance) is accepted and is NOT a customer advance", () => {
    const entry = q(`select journal_entry_id from public.payments where organization_id='${fx.orgId}' limit 1`);
    const id = q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status, journal_entry_id, unallocated_amount) values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 300, 'CASH', '${DATE}', 'POSTED', '${entry}', 300) returning id) select id from x`).split("\n")[0];
    expect(q(`select count(*) from public.payment_credit_balances where payment_id='${id}'`)).toBe("0");
    expect(q(`select advance_amount::text from public.payments where id='${id}'`)).toBe("0.0000");
    q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic legacy row', unallocated_amount=0 where id='${id}'`);
  });
});

describe("constraints and immutability", () => {
  const entry = () => q(`select journal_entry_id from public.payments where organization_id='${fx.orgId}' and advance_amount=0 limit 1`);
  const insertPayment = (extra: string, vals: string) =>
    `insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status, journal_entry_id, unallocated_amount${extra}) values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 500, 'CASH', '${DATE}', 'POSTED', '${entry()}'${vals})`;
  it("an advance needs its account, cannot leave more unallocated than advanced, and needs member and unit", () => {
    fails(insertPayment(", advance_amount", ", 0, 500"), /payments_advance_account_required/);
    fails(insertPayment(", advance_amount, advance_account_id", `, 600, 100, '${fx.accounts["2250"]}'`).replace("unallocated_amount, advance_amount", "unallocated_amount, advance_amount"), /payments_unallocated_le_advance/);
    fails(insertPayment(", advance_amount, advance_account_id", `, 500, 500, '${fx.accounts["2250"]}'`).replace(`member_id, unit_id`, `member_id, unit_id`).replace(`'${fx.member.id}','${fx.unit.id}'`, `null, null`), /payments_advance_requires_unit/);
  });
  it("advance_amount and advance_account_id cannot change after creation", () => {
    const id = q(`with x as (${insertPayment(", advance_amount, advance_account_id", `, 500, 500, '${fx.accounts["2250"]}'`)} returning id) select id from x`).split("\n")[0];
    fails(`update public.payments set advance_amount = 400 where id='${id}'`, /immutable/i);
    fails(`update public.payments set advance_account_id = '${fx.accounts["2200"]}' where id='${id}'`, /immutable/i);
    q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic', unallocated_amount=0 where id='${id}'`);
  });
  it("the advance-account setting must be a leaf, active LIABILITY account of the same organization", () => {
    const setting = (account: string) => `update public.organization_finance_settings set customer_advance_account_id='${account}' where organization_id='${fx.orgId}' and property_id='${fx.propertyId}'`;
    expect(q(`select count(*) from public.organization_finance_settings where organization_id='${fx.orgId}' and property_id='${fx.propertyId}'`)).toBe("1");
    fails(setting(fx.accounts["1110"]), /CUSTOMER_ADVANCE_ACCOUNT_INVALID/); // asset
    fails(setting(fx.accounts["2000"]), /CUSTOMER_ADVANCE_ACCOUNT_INVALID/); // group
    fails(setting(q("select id from public.chart_of_accounts where organization_id<>'" + fx.orgId + "' and category='LIABILITY' and not is_group limit 1")), /CUSTOMER_ADVANCE_ACCOUNT_INVALID/); // other organization
    q(setting(fx.accounts["2250"]));
    expect(q(`select customer_advance_account_id from public.organization_finance_settings where organization_id='${fx.orgId}' and property_id='${fx.propertyId}'`)).toBe(fx.accounts["2250"]);
  });
});

describe("compatibility of migration A with the CURRENT void_payment (no migration B yet)", () => {
  it("voiding a receipt with the existing function works; reversed_on is the date of the actual reversal entry (and that is today)", async () => {
    const admin = adminClient();
    const pid = await receipt(100, dueId);
    const voided = await session.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: pid, p_reason: "schema compatibility" });
    expect(voided.error, voided.error?.message).toBeNull();
    const row = (await admin.from("payment_allocations").select("reversed_at, reversed_on, kind").eq("payment_id", pid).single()).data!;
    const entryDate = q(`select je.entry_date::text from public.payments p join public.journal_entries je on je.id=p.reversal_journal_entry_id where p.id='${pid}'`);
    expect(row.reversed_at).not.toBeNull();
    expect(row.reversed_on).toBe(entryDate);                       // derived from the real reversal entry
    expect(entryDate).toBe(q("select current_date::text"));        // the old path dates its reversal entry "today": proven, not assumed
    expect(row.kind).toBe("RECEIPT");
  });
  it("a reversal date saved earlier is never changed when the receipt is voided later (synthetic reversed application)", async () => {
    const pid = await receipt(60, dueId);
    const other = await receipt(10, dueId);   // its entry stands in as the reversal entry of the synthetic application
    const stand = q(`select journal_entry_id from public.payments where id='${other}'`);
    const standDate = q(`select entry_date::text from public.journal_entries where id='${stand}'`);
    const own = q(`select journal_entry_id from public.payments where id='${pid}'`);
    const alloc = q(`with x as (insert into public.payment_allocations(payment_id, due_id, amount, kind, journal_entry_id, credit_account_id, applied_on, reversed_at, reversed_by, reversed_on, reversal_journal_entry_id) values('${pid}','${dueId}', 5, 'CREDIT_APPLICATION', '${own}', '${fx.accounts["2250"]}', '${DATE}', now(), '${fx.owner.id}', '${standDate}', '${stand}') returning id) select id from x`).split("\n")[0];
    const voided = await session.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: pid, p_reason: "keeps earlier reversal date" });
    expect(voided.error, voided.error?.message).toBeNull();
    expect(q(`select reversed_on::text from public.payment_allocations where id='${alloc}'`)).toBe(standDate);
    fails(`update public.payment_allocations set reversed_on = '2026-01-01' where id='${alloc}'`, /immutable/i);
  });
  it("the deferred consistency trigger rejects reversed_at without reversed_on and a wrong reversal date", () => {
    const pid = q(`select id from public.payments where organization_id='${fx.orgId}' and status='POSTED' and advance_amount=0 limit 1`);
    fails(`begin; insert into public.payment_allocations(payment_id, due_id, amount, reversed_at, reversed_by) values('${pid}','${dueId}', 1, now(), '${fx.owner.id}'); update public.payment_allocations set reversed_on = null where false; commit`, /PAYMENT_ALLOCATION_REVERSAL_DATE_MISMATCH|reversal/i);
  });
});

describe("as-of function and effective view", () => {
  it("an allocation counts at a date only between its applied_on and (exclusive) reversed_on; a receipt without a posted entry never counts", async () => {
    const pid = await receipt(200, dueId, "2026-02-11");
    const asOf = (d: string) => q(`select coalesce(sum(amount),0)::text from public.payment_allocations_as_of('${fx.orgId}','${d}') where payment_id='${pid}'`);
    expect(asOf("2026-02-10")).toBe("0");
    expect(asOf("2026-02-11")).toBe("200.0000");
    const voided = await session.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: pid, p_reason: "as-of check" });
    expect(voided.error, voided.error?.message).toBeNull();
    const today = q("select current_date::text");
    expect(asOf(today)).toBe("0");                       // voided today: no longer effective today
    expect(asOf("2026-02-20")).toBe("200.0000");         // but it was effective before the reversal
    // synthetic receipt with NO journal entry
    const bare = q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status) values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 50, 'CASH', '${DATE}', 'POSTED') returning id) select id from x`).split("\n")[0];
    q(`insert into public.payment_allocations(payment_id, due_id, amount) values('${bare}','${dueId}', 50)`);
    expect(q(`select count(*) from public.payment_allocations_as_of('${fx.orgId}','${today}') where payment_id='${bare}'`)).toBe("0");
    q(`delete from public.payment_allocations where payment_id='${bare}'`);
    q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic', unallocated_amount=0 where id='${bare}'`);
  });
  it("units_with_financials counts only effective allocations (a reversed application of a POSTED receipt is excluded)", () => {
    const before = q(`select balance::text from public.units_with_financials where id='${fx.unit.id}'`);
    const pid = q(`select id from public.payments where organization_id='${fx.orgId}' and status='POSTED' and advance_amount=0 order by created_at limit 1`);
    const stand = q(`select journal_entry_id from public.payments where id='${pid}'`);
    const standDate = q(`select entry_date::text from public.journal_entries where id='${stand}'`);
    const a = q(`with x as (insert into public.payment_allocations(payment_id, due_id, amount, kind, journal_entry_id, credit_account_id, applied_on, reversed_at, reversed_by, reversed_on, reversal_journal_entry_id) values('${pid}','${dueId}', 7, 'CREDIT_APPLICATION', '${stand}', '${fx.accounts["2250"]}', '${DATE}', now(), '${fx.owner.id}', '${standDate}', '${stand}') returning id) select id from x`).split("\n")[0];
    expect(q(`select balance::text from public.units_with_financials where id='${fx.unit.id}'`)).toBe(before);   // the reversed 7 is not counted
    expect(q(`select count(*) from public.effective_payment_allocations where id='${a}'`)).toBe("0");
  });
  it("payment_credit_balances reports remaining credit and flags a stranded one after the owner changes (synthetic advance)", () => {
    const stand = q(`select journal_entry_id from public.payments where organization_id='${fx.orgId}' and advance_amount=0 and status='POSTED' limit 1`);
    const id = q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status, journal_entry_id, unallocated_amount, advance_amount, advance_account_id) values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 500, 'CASH', '${DATE}', 'POSTED', '${stand}', 500, 500, '${fx.accounts["2250"]}') returning id) select id from x`).split("\n")[0];
    expect(q(`select remaining_amount::text||'/'||is_stranded from public.payment_credit_balances where payment_id='${id}'`)).toBe("500.0000/false");
    q(`update public.unit_ownerships set end_date='2026-02-01' where unit_id='${fx.unit.id}' and member_id='${fx.member.id}'`);
    expect(q(`select is_stranded::text from public.payment_credit_balances where payment_id='${id}'`)).toBe("true");
    q(`update public.unit_ownerships set end_date=null where unit_id='${fx.unit.id}' and member_id='${fx.member.id}'`);
    q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic', unallocated_amount=0 where id='${id}'`);
  });
});

describe("grants", () => {
  it("views and the request table are not readable by anon; the request table is not readable by authenticated", () => {
    for (const v of ["effective_payment_allocations", "payment_credit_balances"]) {
      expect(q(`select has_table_privilege('anon','public.${v}','select')::text||'/'||has_table_privilege('authenticated','public.${v}','select')::text`)).toBe("false/true");
    }
    expect(q("select has_table_privilege('anon','public.payment_credit_requests','select')::text||'/'||has_table_privilege('authenticated','public.payment_credit_requests','select')::text")).toBe("false/false");
    expect(q("select relrowsecurity::text from pg_class where relname='payment_credit_requests' and relnamespace='public'::regnamespace")).toBe("true");
  });
  it("as-of functions: authenticated and service_role only; trigger functions: not executable by client roles", () => {
    const acl = (name: string) => q(`select coalesce((select string_agg(coalesce(nullif(grantee::regrole::text,'-'),'PUBLIC'), ',' order by grantee::regrole::text) from aclexplode(proacl)),'DEFAULT-PUBLIC') from pg_proc where pronamespace='public'::regnamespace and proname='${name}'`);
    for (const f of ["payment_allocations_as_of", "payment_credit_balances_as_of"]) {
      const a = acl(f);
      expect(a, f).toContain("authenticated");
      expect(a, f).not.toMatch(/anon|PUBLIC/);
    }
    for (const f of ["payment_allocations_before_insert", "payment_allocations_guard_update", "payment_allocations_reversal_consistency", "payments_fill_allocation_reversal_dates", "payments_guard_advance_columns", "validate_customer_advance_account_setting"]) {
      const a = acl(f);
      expect(a, f).not.toMatch(/anon|authenticated|PUBLIC|DEFAULT-PUBLIC/);
    }
  });
});
