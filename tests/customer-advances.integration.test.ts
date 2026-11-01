import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Phase 3b acceptance matrix for customer advances (record_advance_payment, apply_payment_credit, reverse_credit_application,
 * void_payment, set_default_customer_advance_account). Fixed numbers and PAST dates (V1 refuses future dates):
 *   D1 = 2,000 issued 2026-08-01 · D2 = 800 issued 2026-09-01 · R1 = 3,000 on 2026-08-10 (2,000 -> D1, advance 1,000)
 *   R2 = 1,500 on 2026-08-12 (no allocation) · apply 600 on 09-05 · apply 200 on 09-07 · reverse the 600 on 09-09
 * Real sessions (RLS), real fixture organizations, isolated stack only.
 */
const q = (query: string) => sql(query);
const TOMORROW = () => q("select (current_date + 1)::text");
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };
const err = (r: Rpc) => `${r.error?.code ?? ""}:${r.error?.message ?? ""}`;

let fx: JourneyFixture;
let owner: Client, accountant: Client, cashier: Client, auditor: Client, otherOwner: Client;
let other: JourneyFixture;
let period = "";
let u2 = "";          // a second unit (different member) in the same organization
let m2 = "";
const advance2250 = () => fx.accounts["2250"];
/** fiscal periods are monthly: every call uses the period that contains its date (unless a test passes one on purpose) */
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`) || randomUUID();

async function snap(orgId: string) {
  return q(`select (select count(*) from public.payments where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}')||'/'||
    (select count(*) from public.journal_entries where organization_id='${orgId}')||'/'||
    (select count(*) from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${orgId}')||'/'||
    (select count(*) from public.platform_audit_logs where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_credit_requests where organization_id='${orgId}')||'/'||
    md5(coalesce((select string_agg(d.id::text||d.status, ',' order by d.id) from public.dues d where d.organization_id='${orgId}'),'')||
        coalesce((select string_agg(p.id::text||p.status||p.unallocated_amount::text, ',' order by p.id) from public.payments p where p.organization_id='${orgId}'),'')||
        coalesce((select string_agg(pa.id::text||(pa.reversed_at is not null)::text, ',' order by pa.id) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}'),''))`);
}
/** run a call that must be refused and must leave NO trace */
async function refused(orgId: string, call: () => PromiseLike<Rpc>, pattern: RegExp) {
  const before = await snap(orgId);
  const r = await call();
  expect(r.error, `expected a refusal matching ${pattern}`).not.toBeNull();
  expect(err(r)).toMatch(pattern);
  expect(await snap(orgId), "a refused call left a trace").toBe(before);
}

const record = (c: Client, f: JourneyFixture, o: { amount: number; date: string; allocations?: { due_id: string; amount: number }[]; key?: string; unit?: string; member?: string; method?: string; period?: string }) =>
  c.rpc("record_advance_payment", {
    p_organization_id: f.orgId, p_resort_id: f.propertyId, p_member_id: o.member ?? f.member.id, p_unit_id: o.unit ?? f.unit.id, p_amount: o.amount,
    p_method: o.method ?? "CASH", p_payment_date: o.date, p_deposit_account_id: f.accounts["1110"], p_fiscal_period_id: o.period ?? periodOf(f.orgId, o.date),
    p_allocations: o.allocations ?? [], p_idempotency_key: o.key ?? randomUUID(),
  }) as PromiseLike<Rpc>;
const apply = (c: Client, f: JourneyFixture, payment: string, allocations: { due_id: string; amount: number }[], date: string, key = randomUUID(), per?: string) =>
  c.rpc("apply_payment_credit", { p_organization_id: f.orgId, p_payment_id: payment, p_allocations: allocations, p_application_date: date, p_fiscal_period_id: per ?? periodOf(f.orgId, date), p_idempotency_key: key }) as PromiseLike<Rpc>;
const reverse = (c: Client, f: JourneyFixture, allocation: string, date: string, reason = "wrong due", key = randomUUID(), per?: string) =>
  c.rpc("reverse_credit_application", { p_organization_id: f.orgId, p_allocation_id: allocation, p_reason: reason, p_reversal_date: date, p_fiscal_period_id: per ?? periodOf(f.orgId, date), p_idempotency_key: key }) as PromiseLike<Rpc>;
const voidPayment = (c: Client, f: JourneyFixture, payment: string, reason = "void") =>
  c.rpc("void_payment", { p_organization_id: f.orgId, p_payment_id: payment, p_reason: reason }) as PromiseLike<Rpc>;

async function issueDue(f: JourneyFixture, c: Client, unit: string, amount: number, date: string, label: string) {
  const typeId = q(`select id from public.due_types where organization_id='${f.orgId}' limit 1`);
  const r = await c.rpc("issue_dues", { p_organization_id: f.orgId, p_resort_id: f.propertyId, p_unit_ids: [unit], p_due_type_id: typeId, p_receivable_account_id: f.accounts["1130"], p_amount: amount, p_issue_date: date, p_due_date: date, p_description: label });
  expect(r.error, r.error?.message).toBeNull();
  return q(`select id from public.dues where organization_id='${f.orgId}' and description='${label}'`).split("\n")[0];
}
const dueStatus = (id: string) => q(`select status from public.dues where id='${id}'`);
const outstanding = (id: string) => Number(q(`select public.due_outstanding('${id}')::text`));
const unalloc = (id: string) => Number(q(`select unallocated_amount::text from public.payments where id='${id}'`));
const lines = (entry: string) => q(`select string_agg(a.code||':'||l.debit::text||'/'||l.credit::text, ' | ' order by l.line_number) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${entry}'`);

async function userWithRole(f: JourneyFixture, roleKey: string, label: string) {
  const admin = adminClient();
  const email = `${label}-${f.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  const roleId = (await admin.from("roles").select("id").eq("organization_id", f.orgId).eq("key", roleKey).single()).data!.id as string;
  await admin.from("organization_memberships").insert({ organization_id: f.orgId, user_id: created.data.user!.id, status: "active" });
  await admin.from("user_role_assignments").insert({ user_id: created.data.user!.id, role_id: roleId, organization_id: f.orgId });
  return signedInClient(email);
}

let D1 = "", D2 = "", D3 = "", D4 = "";
let R1 = "", R2 = "";
let app600 = "", app200 = "";

beforeAll(async () => {
  fx = await createJourneyFixture("adv-b");
  other = await createJourneyFixture("adv-b-other");
  const admin = adminClient();
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  auditor = await signedInClient(fx.auditor.email);
  otherOwner = await signedInClient(other.owner.email);
  cashier = await userWithRole(fx, "CASHIER", "cashier");
  period = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", "2026-08-10").gte("end_date", "2026-08-10").single()).data!.id as string;
  // second unit/member in the same organization
  u2 = randomUUID(); m2 = randomUUID();
  await admin.from("units").insert({ id: u2, organization_id: fx.orgId, property_id: fx.propertyId, code: "B-202" });
  await admin.from("members").insert({ id: m2, organization_id: fx.orgId, full_name: "Second Owner" });
  await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: u2, member_id: m2, share_percentage: 100, is_primary_contact: true, start_date: "2026-01-01" });
  D1 = await issueDue(fx, owner, fx.unit.id, 2000, "2026-08-01", "D1");
  D2 = await issueDue(fx, owner, fx.unit.id, 800, "2026-09-01", "D2");
  D3 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-02", "D3");
  D4 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-02", "D4");
}, 600_000);

describe.sequential("1. approved advance account (setting) and its absence", () => {
  it("a receipt with an advance is refused until the account is approved; nothing is created", async () => {
    await refused(fx.orgId, () => record(accountant, fx, { amount: 100, date: "2026-08-10" }), /ADVANCE_ACCOUNT_NOT_CONFIGURED/);
  });
  it("only a user with finance.accounts.manage can approve it; it must be a leaf active LIABILITY account of the organization", async () => {
    expect(err(await cashier.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: advance2250() }))).toMatch(/42501/);
    expect(err(await auditor.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: advance2250() }))).toMatch(/42501/);
    expect(err(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["1110"] }))).toMatch(/CUSTOMER_ADVANCE_ACCOUNT_INVALID/);
    ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: advance2250() }));
    expect(q(`select customer_advance_account_id from public.organization_finance_settings where organization_id='${fx.orgId}' and property_id='${fx.propertyId}'`)).toBe(advance2250());
    expect(q(`select count(*) from public.platform_audit_logs where organization_id='${fx.orgId}' and action='finance.customer_advance_account.set'`)).toBe("1");
  });
});

describe.sequential("2. recording advance receipts", () => {
  it("R1: 3,000 with 2,000 allocated => entry Dr 3,000 / Cr 2,000 / Cr 1,000 advance; account and amount stored on the receipt; D1 PAID", async () => {
    const out = ok<{ payment_id: string; allocated_amount: number; advance_amount: number; replay: boolean }>(await record(accountant, fx, { amount: 3000, date: "2026-08-10", allocations: [{ due_id: D1, amount: 2000 }] }));
    R1 = out.payment_id;
    expect([out.allocated_amount, out.advance_amount, out.replay]).toEqual([2000, 1000, false]);
    const row = q(`select advance_amount::text||'/'||unallocated_amount::text||'/'||advance_account_id from public.payments where id='${R1}'`);
    expect(row).toBe(`1000.0000/1000.0000/${advance2250()}`);
    expect(lines(q(`select journal_entry_id from public.payments where id='${R1}'`))).toBe("1110:3000.0000/0.0000 | 1130:0.0000/2000.0000 | 2250:0.0000/1000.0000");
    expect(dueStatus(D1)).toBe("PAID");
    expect(q(`select kind||'/'||applied_on::text from public.payment_allocations where payment_id='${R1}'`)).toBe("RECEIPT/2026-08-10");
  });
  it("R2: 1,500 with no allocation => Dr 1,500 / Cr 1,500 advance", async () => {
    R2 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 1500, date: "2026-08-12" })).payment_id;
    expect(lines(q(`select journal_entry_id from public.payments where id='${R2}'`))).toBe("1110:1500.0000/0.0000 | 2250:0.0000/1500.0000");
    expect(unalloc(R2)).toBe(1500);
  });
  it("idempotency by CONTENT: same key + same request = same receipt, no second entry; same key + different request refused", async () => {
    const key = randomUUID();
    const first = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 50, date: "2026-08-13", key }));
    const before = await snap(fx.orgId);
    const again = ok<{ payment_id: string; replay: boolean }>(await record(accountant, fx, { amount: 50, date: "2026-08-13", key }));
    expect([again.payment_id, again.replay]).toEqual([first.payment_id, true]);
    expect(await snap(fx.orgId)).toBe(before);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 51, date: "2026-08-13", key }), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 50, date: "2026-08-13", key, allocations: [{ due_id: D2, amount: 10 }] }), /IDEMPOTENCY_KEY_REUSED/);
  });
  it("a missing key, a zero/negative amount and a FUTURE date are refused without a trace", async () => {
    await refused(fx.orgId, () => accountant.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 10, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [], p_idempotency_key: null }), /IDEMPOTENCY_KEY_REQUIRED/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 0, date: "2026-08-10" }), /AMOUNT_INVALID/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 10, date: TOMORROW() }), /FUTURE_DATE_NOT_ALLOWED/);
  });
  it("allocation rules at receipt time: not above what is owed, not a duplicate due, same unit, an existing due, a non-void due, not 'no advance left'", async () => {
    await refused(fx.orgId, () => record(accountant, fx, { amount: 5000, date: "2026-09-10", allocations: [{ due_id: D2, amount: 900 }] }), /ALLOCATION_EXCEEDS_REMAINING/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 5000, date: "2026-08-10", allocations: [{ due_id: D2, amount: 100 }] }), /PAYMENT_BEFORE_DUE/); // D2 was issued on 09-01
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-10", allocations: [{ due_id: D2, amount: 100 }, { due_id: D2, amount: 100 }] }), /DUPLICATE_DUE_IN_REQUEST/);
    const dueU2 = await issueDue(fx, owner, u2, 100, "2026-09-03", "DU2");
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-10", allocations: [{ due_id: dueU2, amount: 100 }] }), /DUE_UNIT_MISMATCH/);
    const foreignDue = q(`select id from public.dues where organization_id='${other.orgId}' limit 1`) || (await issueDue(other, otherOwner, other.unit.id, 100, "2026-09-03", "OTHER1"));
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-10", allocations: [{ due_id: foreignDue, amount: 100 }] }), /DUE_NOT_FOUND/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 100, date: "2026-09-10", allocations: [{ due_id: D3, amount: 100 }] }), /NOT_AN_ADVANCE/);
    const dueVoid = await issueDue(fx, owner, fx.unit.id, 70, "2026-09-03", "DVOID");
    q(`update public.dues set status='VOID' where id='${dueVoid}'`);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-10", allocations: [{ due_id: dueVoid, amount: 10 }] }), /DUE_VOID/);
    const dueNoEntry = q(`with x as (insert into public.dues(organization_id, property_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, description, status) select organization_id, property_id, unit_id, due_type_id, receivable_account_id, 60, issue_date, due_date, 'DNOENTRY', 'ISSUED' from public.dues where id='${D1}' returning id) select id from x`).split("\n")[0];
    q(`update public.dues set journal_entry_id = null where id='${dueNoEntry}'`); // the insert trigger posted one; emulate a "recognise later" due
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-10", allocations: [{ due_id: dueNoEntry, amount: 10 }] }), /DUE_NOT_POSTED/);
  });
  it("member/unit rules: both required, the member must own the unit on that date; a closed/undefined period is refused", async () => {
    await refused(fx.orgId, () => record(accountant, fx, { amount: 10, date: "2026-08-10", member: m2 }), /MEMBER_NOT_LINKED_TO_UNIT/);
    await refused(fx.orgId, () => accountant.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: null, p_unit_id: fx.unit.id, p_amount: 10, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [], p_idempotency_key: randomUUID() }), /MEMBER_AND_UNIT_REQUIRED/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 10, date: "2023-01-10" }), /FISCAL_PERIOD_MISSING/);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 10, date: "2026-08-10", method: "ONLINE" }), /METHOD_INVALID/);
  });
  it("permissions: the cashier can record an advance; the auditor and other organizations cannot; anon cannot", async () => {
    ok(await record(cashier, fx, { amount: 20, date: "2026-08-14" }));
    await refused(fx.orgId, () => record(auditor, fx, { amount: 10, date: "2026-08-10" }), /42501|FORBIDDEN/);
    await refused(fx.orgId, () => record(otherOwner, fx, { amount: 10, date: "2026-08-10" }), /42501|FORBIDDEN/);
    const anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 1, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [], p_idempotency_key: randomUUID() })).error).not.toBeNull();
  });
  it("negative control: the unchanged record_payment still refuses an incomplete allocation", async () => {
    const r = await accountant.rpc("record_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 100, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [{ due_id: D3, amount: 40 }], p_idempotency_key: randomUUID() });
    expect(err(r)).toMatch(/ALLOCATIONS_MISMATCH/);
  });
});

describe.sequential("3. applying credit", () => {
  it("600 from R1 on D2 (09-05): entry Dr advance 600 / Cr receivable 600 dated 09-05; D2 PARTIALLY_PAID, owes 200; R1 credit 400", async () => {
    const out = ok<{ allocations: { allocation_id: string; journal_entry_id: string }[]; remaining: number }>(await apply(accountant, fx, R1, [{ due_id: D2, amount: 600 }], "2026-09-05"));
    app600 = out.allocations[0].allocation_id;
    expect(out.remaining).toBe(400);
    expect(q(`select a.code||':'||l.debit::text from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${out.allocations[0].journal_entry_id}' and l.debit>0`)).toBe("2250:600.0000");
    expect(q(`select a.code||':'||l.credit::text from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${out.allocations[0].journal_entry_id}' and l.credit>0`)).toBe("1130:600.0000");
    expect(q(`select entry_date::text from public.journal_entries where id='${out.allocations[0].journal_entry_id}'`)).toBe("2026-09-05");
    expect(dueStatus(D2)).toBe("PARTIALLY_PAID");
    expect(outstanding(D2)).toBe(200);
    expect(unalloc(R1)).toBe(400);
    expect(q(`select kind||'/'||applied_on::text||'/'||credit_account_id from public.payment_allocations where id='${app600}'`)).toBe(`CREDIT_APPLICATION/2026-09-05/${advance2250()}`);
    expect(q(`select count(*) from public.platform_audit_logs where organization_id='${fx.orgId}' and action='payment.credit_applied'`)).toBe("1");
  });
  it("200 more on 09-07 => D2 PAID, R1 credit 200", async () => {
    const out = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, R1, [{ due_id: D2, amount: 200 }], "2026-09-07"));
    app200 = out.allocations[0].allocation_id;
    expect(dueStatus(D2)).toBe("PAID");
    expect(unalloc(R1)).toBe(200);
  });
  it("replay: same key and same content returns the first result without a second entry; same key with other content is refused", async () => {
    const key = randomUUID();
    const first = ok<{ applied_total: number }>(await apply(accountant, fx, R2, [{ due_id: D3, amount: 100 }], "2026-09-10", key));
    const before = await snap(fx.orgId);
    const again = ok<{ applied_total: number; replay: boolean }>(await apply(accountant, fx, R2, [{ due_id: D3, amount: 100 }], "2026-09-10", key));
    expect([again.applied_total, again.replay]).toEqual([first.applied_total, true]);
    expect(await snap(fx.orgId)).toBe(before);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 101 }], "2026-09-10", key), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 100 }], "2026-09-11", key), /IDEMPOTENCY_KEY_REUSED/);
  });
  it("refusals leave no trace: beyond the due, beyond the credit, wrong unit, other organization, void due, due without a posted entry, duplicate due, empty, bad shape", async () => {
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D2, amount: 1 }], "2026-09-10"), /ALLOCATION_EXCEEDS_REMAINING/);       // D2 is PAID
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 800 }, { due_id: D4, amount: 700 }], "2026-09-10"), /CREDIT_EXCEEDED/); // 1,500 > 1,400 left
    const dueU2 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='DU2'`);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: dueU2, amount: 10 }], "2026-09-10"), /DUE_UNIT_MISMATCH/);
    const foreignDue = q(`select id from public.dues where organization_id='${other.orgId}' limit 1`);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: foreignDue, amount: 10 }], "2026-09-10"), /DUE_NOT_FOUND/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: q(`select id from public.dues where organization_id='${fx.orgId}' and description='DVOID'`), amount: 10 }], "2026-09-10"), /DUE_VOID/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: q(`select id from public.dues where organization_id='${fx.orgId}' and description='DNOENTRY'`), amount: 10 }], "2026-09-10"), /DUE_NOT_POSTED/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 10 }, { due_id: D3, amount: 10 }], "2026-09-10"), /DUPLICATE_DUE_IN_REQUEST/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [], "2026-09-10"), /ALLOCATIONS_REQUIRED/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: -5 }], "2026-09-10"), /ALLOCATION_AMOUNT_INVALID/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: "not-a-uuid", amount: 5 } as never], "2026-09-10"), /ALLOCATIONS_INVALID/);
  });
  it("date and period rules: not before the receipt, not in the future, not in a missing/closed period", async () => {
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 10 }], "2026-08-11"), /APPLICATION_BEFORE_RECEIPT/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 10 }], TOMORROW()), /FUTURE_DATE_NOT_ALLOWED/);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 10 }], "2023-05-05"), /FISCAL_PERIOD_MISSING|APPLICATION_BEFORE_RECEIPT/);
    const otherPeriod = q(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date > '2026-09-30' limit 1`);
    await refused(fx.orgId, () => apply(accountant, fx, R2, [{ due_id: D3, amount: 10 }], "2026-09-10", randomUUID(), otherPeriod), /FISCAL_PERIOD_MISMATCH/);
  });
  it("permissions: apply needs receivables.allocations.manage — the cashier, the auditor and other organizations are refused; a normal receipt is not an advance", async () => {
    await refused(fx.orgId, () => apply(cashier, fx, R2, [{ due_id: D3, amount: 10 }], "2026-09-10"), /42501|FORBIDDEN/);
    await refused(fx.orgId, () => apply(auditor, fx, R2, [{ due_id: D3, amount: 10 }], "2026-09-10"), /42501|FORBIDDEN/);
    await refused(fx.orgId, () => apply(otherOwner, fx, R2, [{ due_id: D3, amount: 10 }], "2026-09-10"), /42501|FORBIDDEN|PAYMENT_NOT_FOUND/);
    const plain = ok<string>(await accountant.rpc("record_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 40, p_method: "CASH", p_payment_date: "2026-09-02", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodOf(fx.orgId, "2026-09-02"), p_allocations: [{ due_id: D4, amount: 40 }], p_idempotency_key: randomUUID() }) as never);
    await refused(fx.orgId, () => apply(accountant, fx, plain as unknown as string, [{ due_id: D4, amount: 10 }], "2026-09-10"), /NOT_AN_ADVANCE_RECEIPT/);
  });
});

describe.sequential("4. reversing one application", () => {
  it("a reason is required; the 600 (not the 200) is reversed on 09-09: entry mirrored, D2 owes 600, R1 credit 800, dates linked to the reversal entry", async () => {
    await refused(fx.orgId, () => reverse(accountant, fx, app600, "2026-09-09", "   "), /REASON_REQUIRED/);
    const out = ok<{ reversal_journal_entry_id: string; remaining: number }>(await reverse(accountant, fx, app600, "2026-09-09", "applied to the wrong due"));
    expect(out.remaining).toBe(800);
    expect(q(`select a.code||':'||l.debit::text from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${out.reversal_journal_entry_id}' and l.debit>0`)).toBe("1130:600.0000");
    expect(q(`select a.code||':'||l.credit::text from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${out.reversal_journal_entry_id}' and l.credit>0`)).toBe("2250:600.0000");
    expect(q(`select (pa.reversed_on = je.entry_date)::text||'/'||pa.reversed_on::text||'/'||(select status from public.journal_entries where id=pa.journal_entry_id) from public.payment_allocations pa join public.journal_entries je on je.id=pa.reversal_journal_entry_id where pa.id='${app600}'`)).toBe("true/2026-09-09/REVERSED");
    expect(dueStatus(D2)).toBe("PARTIALLY_PAID");
    expect(outstanding(D2)).toBe(600);
    expect(unalloc(R1)).toBe(800);
    expect(q(`select reversed_at is null from public.payment_allocations where id='${app200}'`)).toBe("t");   // the 200 stays in force
    expect(q(`select count(*) from public.platform_audit_logs where organization_id='${fx.orgId}' and action='payment.credit_application_reversed' and safe_change_summary->>'reason'='applied to the wrong due'`)).toBe("1");
  });
  it("a second reversal, a receipt allocation, a date before the application, the future, other users and a reused key are all refused without a trace", async () => {
    await refused(fx.orgId, () => reverse(accountant, fx, app600, "2026-09-10"), /ALREADY_REVERSED/);
    const receiptAlloc = q(`select id from public.payment_allocations where payment_id='${R1}' and kind='RECEIPT'`);
    await refused(fx.orgId, () => reverse(accountant, fx, receiptAlloc, "2026-09-10"), /NOT_A_CREDIT_APPLICATION/);
    await refused(fx.orgId, () => reverse(accountant, fx, app200, "2026-09-06"), /REVERSAL_BEFORE_APPLICATION/);
    await refused(fx.orgId, () => reverse(accountant, fx, app200, TOMORROW()), /FUTURE_DATE_NOT_ALLOWED/);
    await refused(fx.orgId, () => reverse(cashier, fx, app200, "2026-09-10"), /42501|FORBIDDEN/);
    await refused(fx.orgId, () => reverse(otherOwner, fx, app200, "2026-09-10"), /42501|FORBIDDEN|ALLOCATION_NOT_FOUND/);
    const key = randomUUID();
    const first = ok<{ replay: boolean }>(await reverse(accountant, fx, app200, "2026-09-10", "second look", key));
    expect(first.replay).toBe(false);
    const before = await snap(fx.orgId);
    expect(ok<{ replay: boolean }>(await reverse(accountant, fx, app200, "2026-09-10", "second look", key)).replay).toBe(true);
    expect(await snap(fx.orgId)).toBe(before);
    await refused(fx.orgId, () => reverse(accountant, fx, app200, "2026-09-10", "another reason", key), /IDEMPOTENCY_KEY_REUSED/);
    expect(unalloc(R1)).toBe(1000);       // both applications reversed: the whole advance is available again
    expect(dueStatus(D2)).toBe("OVERDUE"); // nothing paid on D2 any more and its due date (09-01) has passed
  });
});

describe.sequential("5. voiding a receipt: only when no application is in force", () => {
  it("R3 (no application) can be voided: whole entry reversed, credit 0, liability back to its prior level", async () => {
    const r3 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 500, date: "2026-09-02" })).payment_id;
    ok(await voidPayment(owner, fx, r3, "entered by mistake"));
    expect(q(`select status||'/'||unallocated_amount::text from public.payments where id='${r3}'`)).toBe("REVERSED/0.0000");
  });
  it("R4 with an active application is refused (CREDIT_APPLICATIONS_ACTIVE) without a trace; after reversing it the void works and the earlier reversal date is preserved", async () => {
    const r4 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 500, date: "2026-09-02" })).payment_id;
    const a = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, r4, [{ due_id: D4, amount: 300 }], "2026-09-05")).allocations[0].allocation_id;
    await refused(fx.orgId, () => voidPayment(owner, fx, r4), /CREDIT_APPLICATIONS_ACTIVE/);
    ok(await reverse(accountant, fx, a, "2026-09-06", "undo"));
    ok(await voidPayment(owner, fx, r4, "void after the application was reversed"));
    expect(q(`select reversed_on::text from public.payment_allocations where id='${a}'`)).toBe("2026-09-06");            // not replaced by today
    expect(q(`select count(*) from public.payment_allocations where payment_id='${r4}' and kind='RECEIPT'`)).toBe("0"); // R4 had no receipt-time allocation
    expect(q(`select p.status||'/'||p.unallocated_amount::text from public.payments p where p.id='${r4}'`)).toBe("REVERSED/0.0000");
    expect(outstanding(D4)).toBe(860); // 900 less the plain 40 receipt recorded earlier; the reversed 300 is back
    // history: the application counts at 09-05, not at 09-07 (reversed 09-06), and the receipt itself is voided today
    const at = (d: string) => Number(q(`select coalesce(sum(amount),0)::text from public.payment_allocations_as_of('${fx.orgId}','${d}') where allocation_id='${a}'`));
    expect([at("2026-09-05"), at("2026-09-07")]).toEqual([300, 0]);
  });
  it("R5: one application reversed and a second still in force => the void is still refused until the second is reversed", async () => {
    const r5 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 400, date: "2026-09-02" })).payment_id;
    const first = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, r5, [{ due_id: D4, amount: 100 }], "2026-09-05")).allocations[0].allocation_id;
    ok(await reverse(accountant, fx, first, "2026-09-06", "undo first"));
    const second = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, r5, [{ due_id: D4, amount: 50 }], "2026-09-07")).allocations[0].allocation_id;
    await refused(fx.orgId, () => voidPayment(owner, fx, r5), /CREDIT_APPLICATIONS_ACTIVE/);
    ok(await reverse(accountant, fx, second, "2026-09-08", "undo second"));
    ok(await voidPayment(owner, fx, r5));
    expect(q(`select status from public.payments where id='${r5}'`)).toBe("REVERSED");
  });
});

describe.sequential("6. the advance account is the one the receipt was received into", () => {
  it("changing the default does not move an existing receipt; deactivating the original account blocks apply AND reverse with a clear error; reactivating restores both", async () => {
    const admin = adminClient();
    const r7 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 300, date: "2026-09-02" })).payment_id;
    const appId = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, r7, [{ due_id: D3, amount: 50 }], "2026-09-05")).allocations[0].allocation_id;
    // a second liability account becomes the default
    const second = randomUUID();
    await admin.from("chart_of_accounts").insert({ id: second, organization_id: fx.orgId, code: "2251", name_ar: "سلف أخرى", name_en: "Other advances", category: "LIABILITY", normal_balance: "CREDIT", is_group: false, parent_id: q(`select parent_id from public.chart_of_accounts where id='${advance2250()}'`) });
    ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: second }));
    const r8 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 200, date: "2026-09-03" })).payment_id;
    expect(q(`select advance_account_id from public.payments where id='${r8}'`)).toBe(second);                       // new receipts use the new default
    expect(q(`select advance_account_id from public.payments where id='${r7}'`)).toBe(advance2250());                // the old receipt keeps its own
    const app2 = ok<{ allocations: { journal_entry_id: string }[] }>(await apply(accountant, fx, r7, [{ due_id: D3, amount: 25 }], "2026-09-06"));
    expect(q(`select a.code from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id where l.journal_entry_id='${app2.allocations[0].journal_entry_id}' and l.debit>0`)).toBe("2250");   // applied from 2250, not the default
    expect(q(`select credit_account_id from public.payment_allocations where id='${appId}'`)).toBe(advance2250());
    // deactivate the original account
    q(`update public.chart_of_accounts set is_active=false where id='${advance2250()}'`);
    await refused(fx.orgId, () => apply(accountant, fx, r7, [{ due_id: D3, amount: 10 }], "2026-09-08"), /ADVANCE_ACCOUNT_INACTIVE/);
    await refused(fx.orgId, () => reverse(accountant, fx, appId, "2026-09-08", "blocked while inactive"), /ADVANCE_ACCOUNT_INACTIVE/);
    // no function can change the account of an existing receipt
    expect(q(`select count(*) from pg_proc where pronamespace='public'::regnamespace and pg_get_functiondef(oid) ilike '%set advance_account_id%'`)).toBe("0");
    q(`update public.chart_of_accounts set is_active=true where id='${advance2250()}'`);
    ok(await apply(accountant, fx, r7, [{ due_id: D3, amount: 10 }], "2026-09-08"));
    ok(await reverse(accountant, fx, appId, "2026-09-08", "now allowed"));
    ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: advance2250() }));
  });
});

describe.sequential("7. concurrency", () => {
  it("two simultaneous applications of 800+800 against 1,000 of credit: exactly one succeeds, the other is CREDIT_EXCEEDED; the books agree", async () => {
    const r = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 1000, date: "2026-09-02" })).payment_id;
    const d5 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-04", "D5");
    const d6 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-04", "D6");
    const second = await signedInClient(fx.accountant.email);
    const results = await Promise.all([apply(accountant, fx, r, [{ due_id: d5, amount: 800 }], "2026-09-10"), apply(second, fx, r, [{ due_id: d6, amount: 800 }], "2026-09-10")]);
    const good = results.filter((x) => !x.error), bad = results.filter((x) => x.error);
    expect([good.length, bad.length]).toEqual([1, 1]);
    expect(err(bad[0])).toMatch(/CREDIT_EXCEEDED/);
    expect(unalloc(r)).toBe(200);
    expect(q(`select count(*) from public.payment_allocations where payment_id='${r}' and kind='CREDIT_APPLICATION' and reversed_at is null`)).toBe("1");
  });
  it("two identical requests with the SAME key at once: both succeed (one is the replay) and only one application exists", async () => {
    const r = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 400, date: "2026-09-02" })).payment_id;
    const d = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-04", "D7");
    const key = randomUUID();
    const second = await signedInClient(fx.accountant.email);
    const results = await Promise.all([apply(accountant, fx, r, [{ due_id: d, amount: 150 }], "2026-09-10", key), apply(second, fx, r, [{ due_id: d, amount: 150 }], "2026-09-10", key)]);
    expect(results.map((x) => x.error)).toEqual([null, null]);
    expect(results.filter((x) => (x.data as { replay: boolean }).replay)).toHaveLength(1);
    expect(q(`select count(*) from public.payment_allocations where payment_id='${r}' and kind='CREDIT_APPLICATION'`)).toBe("1");
    expect(unalloc(r)).toBe(250);
  });
  it("apply vs void of the same receipt: one consistent end state (never a voided receipt with an application in force)", async () => {
    const r = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 300, date: "2026-09-02" })).payment_id;
    const d = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-04", "D8");
    const o2 = await signedInClient(fx.owner.email);
    await Promise.all([apply(accountant, fx, r, [{ due_id: d, amount: 100 }], "2026-09-10"), voidPayment(o2, fx, r, "race")]);
    const state = q(`select p.status||'/'||(select count(*) from public.payment_allocations pa where pa.payment_id=p.id and pa.kind='CREDIT_APPLICATION' and pa.reversed_at is null) from public.payments p where p.id='${r}'`);
    expect(["REVERSED/0", "POSTED/1"]).toContain(state);
  });
  it("two reversals of the same application at once: exactly one succeeds", async () => {
    const r = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 300, date: "2026-09-02" })).payment_id;
    const d = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-04", "D9");
    const a = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, r, [{ due_id: d, amount: 100 }], "2026-09-10")).allocations[0].allocation_id;
    const second = await signedInClient(fx.accountant.email);
    const results = await Promise.all([reverse(accountant, fx, a, "2026-09-11"), reverse(second, fx, a, "2026-09-11")]);
    expect(results.filter((x) => !x.error)).toHaveLength(1);
    expect(err(results.find((x) => x.error)!)).toMatch(/ALREADY_REVERSED/);
    expect(unalloc(r)).toBe(300);
  });
});

describe.sequential("8. ownership change (D13): the credit stays with the original member", () => {
  it("applying is refused, the credit is flagged stranded, the new owner sees nothing and cannot use it; the old owner still sees it; the void works", async () => {
    const admin = adminClient();
    const r = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 600, date: "2026-09-02" })).payment_id;
    const dNew = await issueDue(fx, owner, fx.unit.id, 400, "2026-09-12", "DNEW");
    // M's ownership of the unit ends; N becomes the owner (with a portal login); M also has a portal login
    const nId = randomUUID();
    await admin.from("members").insert({ id: nId, organization_id: fx.orgId, full_name: "New Owner" });
    q(`update public.unit_ownerships set end_date='2026-09-10' where unit_id='${fx.unit.id}' and member_id='${fx.member.id}'`);
    await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: fx.unit.id, member_id: nId, share_percentage: 100, is_primary_contact: true, start_date: "2026-09-11" });
    const login = async (memberId: string, label: string) => {
      const email = `${label}-${fx.tag}@demo.local`;
      const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      q(`update public.members set user_id='${u.data.user!.id}' where id='${memberId}'`);
      const c = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
      expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
      return c;
    };
    const nPortal = await login(nId, "new-owner"), mPortal = await login(fx.member.id, "old-owner");

    await refused(fx.orgId, () => apply(accountant, fx, r, [{ due_id: dNew, amount: 100 }], "2026-09-12"), /MEMBER_NOT_LINKED_TO_UNIT/);
    expect(q(`select is_stranded::text from public.payment_credit_balances where payment_id='${r}'`)).toBe("true");
    // the new owner: no receipt, no allocation, no balance row of M's; arrears unchanged
    expect(((await nPortal.from("payments").select("id").eq("id", r)).data ?? [])).toHaveLength(0);
    expect(((await nPortal.from("payment_credit_balances").select("payment_id").eq("payment_id", r)).data ?? [])).toHaveLength(0);
    expect(((await nPortal.from("effective_payment_allocations").select("id").eq("payment_id", r)).data ?? [])).toHaveLength(0);
    expect(((await nPortal.from("payment_allocations").select("id").eq("payment_id", r)).data ?? [])).toHaveLength(0);
    expect(err(await apply(nPortal as never, fx, r, [{ due_id: dNew, amount: 100 }], "2026-09-12"))).toMatch(/42501|FORBIDDEN|PAYMENT_NOT_FOUND/);
    expect(outstanding(dNew)).toBe(400);                                                  // M's credit did not pay N's due
    // the original owner still sees his own receipt and the stranded credit
    expect(((await mPortal.from("payment_credit_balances").select("payment_id, is_stranded").eq("payment_id", r)).data ?? [])).toEqual([{ payment_id: r, is_stranded: true }]);
    // the liability still includes it; voiding is allowed and clears it
    ok(await voidPayment(owner, fx, r, "stranded credit returned"));
    expect(unalloc(r)).toBe(0);
    q(`delete from public.unit_ownerships where unit_id='${fx.unit.id}' and member_id='${nId}'`); // restore for the closing checks
    q(`update public.unit_ownerships set end_date=null where unit_id='${fx.unit.id}' and member_id='${fx.member.id}'`);
  });
});

describe.sequential("9. grants and isolation", () => {
  const acl = (name: string) => q(`select coalesce((select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end, ',' order by a.grantee) from aclexplode(proacl) a),'DEFAULT-PUBLIC') from pg_proc where pronamespace='public'::regnamespace and proname='${name}'`);
  it("public functions: authenticated only (never anon/PUBLIC); internal helpers: NOT authenticated, anon or PUBLIC", () => {
    for (const f of ["set_default_customer_advance_account", "record_advance_payment", "apply_payment_credit", "reverse_credit_application"]) {
      expect(acl(f), f).toContain("authenticated");
      expect(acl(f), f).not.toMatch(/anon|PUBLIC/);
    }
    for (const f of ["post_advance_payment_internal", "recompute_due_payment_status", "assert_posting_period", "credit_request_hash", "normalize_credit_allocations"]) {
      expect(acl(f), f).not.toMatch(/authenticated|anon|PUBLIC/);
    }
    expect(q("select has_function_privilege('authenticated','public.post_advance_payment_internal(uuid,uuid,uuid,uuid,numeric,text,date,uuid,uuid,jsonb,text,uuid,uuid)','execute')::text")).toBe("false");
  });
  it("a client session cannot call the internal function nor touch the request store; an outsider cannot see this organization's receipts", async () => {
    const r = await accountant.rpc("post_advance_payment_internal", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 1, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: period, p_allocations: [], p_idempotency_key: randomUUID(), p_cashier_session_id: null, p_actor_id: fx.accountant.id });
    expect(r.error).not.toBeNull();
    expect((await accountant.from("payment_credit_requests").select("idempotency_key")).data ?? []).toEqual([]);
    expect(((await otherOwner.from("payments").select("id").eq("organization_id", fx.orgId)).data ?? [])).toHaveLength(0);
    expect(((await otherOwner.from("payment_credit_balances").select("payment_id").eq("organization_id", fx.orgId)).data ?? [])).toHaveLength(0);
  });
});

describe.sequential("10. books and balances stay consistent", () => {
  it("per receipt: advance = Σ applications in force + credit left; the 2250 ledger = Σ credit left over POSTED receipts; every entry balances", () => {
    const bad = q(`select count(*) from public.payments p where p.organization_id='${fx.orgId}' and p.advance_amount>0 and p.status='POSTED'
      and p.advance_amount - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.payment_id=p.id and pa.kind='CREDIT_APPLICATION' and pa.reversed_at is null),0) <> p.unallocated_amount`);
    expect(bad).toBe("0");
    const ledger = q(`select coalesce(sum(l.credit - l.debit),0)::text from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and l.account_id='${advance2250()}'`);
    const credit = q(`select coalesce(sum(p.unallocated_amount),0)::text from public.payments p where p.organization_id='${fx.orgId}' and p.advance_amount>0 and p.status='POSTED' and p.advance_account_id='${advance2250()}'`);
    expect(Number(ledger)).toBe(Number(credit));
    expect(q(`select count(*) from (select j.id from public.journal_entries j join public.journal_entry_lines l on l.journal_entry_id=j.id where j.organization_id='${fx.orgId}' group by j.id having sum(l.debit) <> sum(l.credit)) x`)).toBe("0");
  });
  it("the other organization is untouched by all of this", () => {
    expect(q(`select count(*) from public.payments where organization_id='${other.orgId}'`)).toBe("0");
    expect(q(`select count(*) from public.payment_credit_requests where organization_id='${other.orgId}'`)).toBe("0");
  });
});

describe.sequential("11. historical statements: later applications and reversals never change an earlier date", () => {
  let hx: JourneyFixture, hOwner: Client, hAcc: Client;
  let h1 = "", h2 = "", hr1 = "", hr2 = "", happ600 = "";
  const figures = async (d: string) => {
    const dueSet = `('${h1}','${h2}')`;
    const dued = Number(q(`select coalesce(sum(amount),0)::text from public.dues where id in ${dueSet} and issue_date <= '${d}' and status <> 'VOID'`));
    const paid = Number(q(`select coalesce(sum(amount),0)::text from public.payment_allocations_as_of('${hx.orgId}','${d}') where due_id in ${dueSet}`));
    const credit = Number(q(`select coalesce(sum(remaining_amount),0)::text from public.payment_credit_balances_as_of('${hx.orgId}','${d}') where payment_id in ('${hr1}','${hr2}')`));
    const ledger = Number(q(`select coalesce(sum(l.credit - l.debit),0)::text from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${hx.orgId}' and l.account_id='${hx.accounts["2250"]}' and j.entry_date <= '${d}'`));
    const tb = (await hOwner.rpc("get_trial_balance_with_opening", { p_organization_id: hx.orgId, p_start_date: "2026-01-01", p_end_date: d })).data as { code: string; closing_debit: number; closing_credit: number }[];
    const tbAdv = tb.filter((r) => r.code === "2250").reduce((s, r) => s + Number(r.closing_credit) - Number(r.closing_debit), 0);
    const balanced = Math.abs(tb.reduce((s, r) => s + Number(r.closing_debit) - Number(r.closing_credit), 0)) < 0.0001;
    return { arrears: dued - paid, credit, net: dued - paid - credit, ledger2250: ledger, trialBalance2250: tbAdv, trialBalanceBalanced: balanced };
  };
  const EXPECTED: Record<string, { arrears: number; credit: number; net: number; ledger2250: number }> = {
    "2026-08-31": { arrears: 0, credit: 2500, net: -2500, ledger2250: 2500 },
    "2026-09-04": { arrears: 800, credit: 2500, net: -1700, ledger2250: 2500 },
    "2026-09-06": { arrears: 200, credit: 1900, net: -1700, ledger2250: 1900 },
    "2026-09-08": { arrears: 0, credit: 1700, net: -1700, ledger2250: 1700 },
    "2026-09-30": { arrears: 600, credit: 2300, net: -1700, ledger2250: 2300 },
  };
  const immediate: Record<string, Awaited<ReturnType<typeof figures>>> = {};

  it("setup: D1 2,000 (08-01), D2 800 (09-01), R1 3,000 on 08-10 (2,000 -> D1), R2 1,500 on 08-12", async () => {
    hx = await createJourneyFixture("adv-hist");
    hOwner = await signedInClient(hx.owner.email);
    hAcc = await signedInClient(hx.accountant.email);
    ok(await hOwner.rpc("set_default_customer_advance_account", { p_organization_id: hx.orgId, p_property_id: hx.propertyId, p_account_id: hx.accounts["2250"] }));
    h1 = await issueDue(hx, hOwner, hx.unit.id, 2000, "2026-08-01", "H1");
    h2 = await issueDue(hx, hOwner, hx.unit.id, 800, "2026-09-01", "H2");
    hr1 = ok<{ payment_id: string }>(await record(hAcc, hx, { amount: 3000, date: "2026-08-10", allocations: [{ due_id: h1, amount: 2000 }] })).payment_id;
    hr2 = ok<{ payment_id: string }>(await record(hAcc, hx, { amount: 1500, date: "2026-08-12" })).payment_id;
    for (const d of ["2026-08-31", "2026-09-04"]) immediate[d] = await figures(d);
  }, 300_000);

  it("apply 600 on 09-05 then 200 on 09-07, then reverse ONLY the 600 on 09-09 — figures are captured right after each step", async () => {
    happ600 = ok<{ allocations: { allocation_id: string }[] }>(await apply(hAcc, hx, hr1, [{ due_id: h2, amount: 600 }], "2026-09-05")).allocations[0].allocation_id;
    immediate["2026-09-06"] = await figures("2026-09-06");
    ok(await apply(hAcc, hx, hr1, [{ due_id: h2, amount: 200 }], "2026-09-07"));
    immediate["2026-09-08"] = await figures("2026-09-08");
    ok(await reverse(hAcc, hx, happ600, "2026-09-09", "wrong due"));
    immediate["2026-09-30"] = await figures("2026-09-30");
    expect(outstanding(h2)).toBe(600);
    expect(dueStatus(h2)).toBe("PARTIALLY_PAID");
    expect(unalloc(hr1)).toBe(800);
  });

  for (const date of Object.keys(EXPECTED)) {
    it(`as of ${date}: arrears, credit, net and the 2250 ledger match the specification, the immediate figures, and the trial balance`, async () => {
      const rebuilt = await figures(date);
      const e = EXPECTED[date];
      expect({ arrears: rebuilt.arrears, credit: rebuilt.credit, net: rebuilt.net, ledger2250: rebuilt.ledger2250 }).toEqual(e);
      expect(rebuilt.trialBalance2250).toBe(e.ledger2250);   // the trial balance agrees with the ledger
      expect(rebuilt.trialBalanceBalanced).toBe(true);        // and balances at every date
      expect(rebuilt, "a date reconstructed LATER must equal the figures taken at the time").toEqual(immediate[date]);
    });
  }

  it("the figures of 08-31 are identical before any application, after both applications and after the reversal (history never changes)", () => {
    expect(immediate["2026-08-31"]).toEqual({ arrears: 0, credit: 2500, net: -2500, ledger2250: 2500, trialBalance2250: 2500, trialBalanceBalanced: true });
  });
});
