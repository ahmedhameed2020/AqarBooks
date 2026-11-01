import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Second review (migration 20261017100300):
 *  1. the owner's historical figures keep a receipt voided LATER on the dates before its void, without opening the ledger;
 *  2. record_advance_payment obeys the due-date rules at receipt time (refusal without a trace; success on the issue date itself);
 *  3. record / apply / reverse / void agree with the approved readers when a POSTED receipt has no valid journal entry.
 * Past dates only; isolated stack only.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };
const err = (r: Rpc) => `${r.error?.code ?? ""}:${r.error?.message ?? ""}`;

let fx: JourneyFixture, other: JourneyFixture;
let owner: Client, accountant: Client, otherOwner: Client;
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`) || randomUUID();
const TODAY = () => q("select current_date::text");

async function snap(orgId: string) {
  return q(`select (select count(*) from public.payments where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}')||'/'||
    (select count(*) from public.journal_entries where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_credit_requests where organization_id='${orgId}')||'/'||
    md5(coalesce((select string_agg(d.id::text||d.status, ',' order by d.id) from public.dues d where d.organization_id='${orgId}'),''))`);
}
async function refused(orgId: string, call: () => PromiseLike<Rpc>, pattern: RegExp) {
  const before = await snap(orgId);
  const r = await call();
  expect(r.error, `expected a refusal matching ${pattern}`).not.toBeNull();
  expect(err(r)).toMatch(pattern);
  expect(await snap(orgId), "a refused call left a trace").toBe(before);
}
const record = (c: Client, f: JourneyFixture, o: { amount: number; date: string; allocations?: { due_id: string; amount: number }[]; key?: string; unit?: string; member?: string }) =>
  c.rpc("record_advance_payment", { p_organization_id: f.orgId, p_resort_id: f.propertyId, p_member_id: o.member ?? f.member.id, p_unit_id: o.unit ?? f.unit.id, p_amount: o.amount, p_method: "CASH", p_payment_date: o.date, p_deposit_account_id: f.accounts["1110"], p_fiscal_period_id: periodOf(f.orgId, o.date), p_allocations: o.allocations ?? [], p_idempotency_key: o.key ?? randomUUID() }) as PromiseLike<Rpc>;
const apply = (c: Client, f: JourneyFixture, payment: string, allocations: { due_id: string; amount: number }[], date: string) =>
  c.rpc("apply_payment_credit", { p_organization_id: f.orgId, p_payment_id: payment, p_allocations: allocations, p_application_date: date, p_fiscal_period_id: periodOf(f.orgId, date), p_idempotency_key: randomUUID() }) as PromiseLike<Rpc>;
const reverse = (c: Client, f: JourneyFixture, allocation: string, date: string) =>
  c.rpc("reverse_credit_application", { p_organization_id: f.orgId, p_allocation_id: allocation, p_reason: "undo", p_reversal_date: date, p_fiscal_period_id: periodOf(f.orgId, date), p_idempotency_key: randomUUID() }) as PromiseLike<Rpc>;
async function issueDue(f: JourneyFixture, c: Client, unit: string, amount: number, date: string, label: string) {
  const typeId = q(`select id from public.due_types where organization_id='${f.orgId}' limit 1`);
  const r = await c.rpc("issue_dues", { p_organization_id: f.orgId, p_resort_id: f.propertyId, p_unit_ids: [unit], p_due_type_id: typeId, p_receivable_account_id: f.accounts["1130"], p_amount: amount, p_issue_date: date, p_due_date: date, p_description: label });
  expect(r.error, r.error?.message).toBeNull();
  return q(`select id from public.dues where organization_id='${f.orgId}' and description='${label}'`).split("\n")[0];
}
const addUnit = async (f: JourneyFixture, code: string) => {
  const admin = adminClient();
  const u = randomUUID(), m = randomUUID();
  await admin.from("units").insert({ id: u, organization_id: f.orgId, property_id: f.propertyId, code });
  await admin.from("members").insert({ id: m, organization_id: f.orgId, full_name: `Owner ${code}` });
  await admin.from("unit_ownerships").insert({ organization_id: f.orgId, unit_id: u, member_id: m, share_percentage: 100, is_primary_contact: true, start_date: "2026-01-01" });
  return { unit: u, member: m };
};
const portalLogin = async (f: JourneyFixture, memberId: string, label: string) => {
  const email = `${label}-${f.tag}@demo.local`;
  const u = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  q(`update public.members set user_id='${u.data.user!.id}' where id='${memberId}'`);
  const c = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  return c;
};

beforeAll(async () => {
  fx = await createJourneyFixture("adv-r2");
  other = await createJourneyFixture("adv-r2-other");
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  otherOwner = await signedInClient(other.owner.email);
  ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] }));
}, 600_000);

describe.sequential("1. the owner's historical figures keep a receipt that is voided later, up to the day of the void", () => {
  let mA: Awaited<ReturnType<typeof addUnit>>, nOther: Awaited<ReturnType<typeof addUnit>>;
  let mPortal: ReturnType<typeof createClient>, nPortal: ReturnType<typeof createClient>;
  let kept = "", voided = "", dueM = "", voidedAllocation = "";
  type Row = { payment_id: string; remaining_amount: number };
  it("setup: M has a kept advance receipt (700, one application of 250) and a receipt of 90 with a 40 allocation that staff voids today", async () => {
    mA = await addUnit(fx, "R2-M");
    nOther = await addUnit(fx, "R2-N");
    dueM = await issueDue(fx, owner, mA.unit, 400, "2026-09-02", "R2P1");
    kept = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 700, date: "2026-09-02", unit: mA.unit, member: mA.member })).payment_id;
    ok(await apply(accountant, fx, kept, [{ due_id: dueM, amount: 250 }], "2026-09-06"));
    voided = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 90, date: "2026-09-03", unit: mA.unit, member: mA.member, allocations: [{ due_id: dueM, amount: 40 }] })).payment_id;
    voidedAllocation = q(`select id from public.payment_allocations where payment_id='${voided}'`);
    mPortal = await portalLogin(fx, mA.member, "r2-m");
    nPortal = await portalLogin(fx, nOther.member, "r2-n");
  });
  const owned = async (c: ReturnType<typeof createClient> | Client, d: string) =>
    ((await c.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: d })).data as Row[]).map((r) => `${r.payment_id}:${Number(r.remaining_amount)}`).sort();
  const allocs = async (c: ReturnType<typeof createClient> | Client, d: string) =>
    ((await c.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: d })).data as { allocation_id: string; amount: number }[]).map((r) => `${r.allocation_id}:${Number(r.amount)}`).sort();
  it("BEFORE the void the voided receipt is in the owner's figures — equal to the staff view on every date", async () => {
    // not yet voided: both receipts everywhere
    for (const d of ["2026-09-02", "2026-09-05", "2026-09-30", TODAY()]) {
      expect(await owned(mPortal, d), d).toEqual((await owned(accountant, d)).filter((x) => [kept, voided].some((p) => x.startsWith(p))));
    }
  });
  it("after staff voids it today: owner and staff agree on EVERY date; the receipt is there on the days before the void and gone from the void date", async () => {
    ok(await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: voided, p_reason: "voided after the fact" }) as Rpc);
    const today = TODAY();
    const mine = (d: string) => owned(mPortal, d);
    const staffMine = async (d: string) => (await owned(accountant, d)).filter((x) => [kept, voided].some((p) => x.startsWith(p)));
    for (const d of ["2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06", "2026-09-30", "2026-10-10", today]) {
      expect(await mine(d), `credit on ${d}`).toEqual(await staffMine(d));
      const owner_allocs = await allocs(mPortal, d);
      const staff_allocs = (await allocs(accountant, d)).filter((a) => q(`select count(*) from public.payment_allocations x join public.payments p on p.id=x.payment_id where x.id='${a.split(":")[0]}' and p.member_id='${mA.member}'`) === "1");
      expect(owner_allocs, `allocations on ${d}`).toEqual(staff_allocs);
    }
    // the shape the reviewer asked for: present before, gone from the void date
    expect((await owned(mPortal, "2026-09-30")).some((x) => x.startsWith(voided))).toBe(true);
    expect((await allocs(mPortal, "2026-10-10")).some((x) => x.startsWith(voidedAllocation))).toBe(true);
    expect((await owned(mPortal, today)).some((x) => x.startsWith(voided))).toBe(false);
    expect((await allocs(mPortal, today)).some((x) => x.startsWith(voidedAllocation))).toBe(false);
    // the owner's arrears picture on 09-30: the due is 400, the kept application 250 and the voided receipt's 40 were both in force
    const paidOn = async (d: string) => (await allocs(mPortal, d)).reduce((s, x) => s + Number(x.split(":")[1]), 0);
    expect([await paidOn("2026-09-30"), await paidOn(today)]).toEqual([290, 250]);
  });
  it("scope: the new owner, another member, the other organization and an anonymous caller see none of M's figures; the ledger stays closed", async () => {
    for (const d of ["2026-09-05", "2026-09-30", TODAY()]) {
      expect(await owned(nPortal, d), `N on ${d}`).toEqual([]);
      expect(await allocs(nPortal, d), `N allocations on ${d}`).toEqual([]);
      expect(await owned(otherOwner, d), `other org on ${d}`).toEqual([]);
      expect(await allocs(otherOwner, d), `other org allocations on ${d}`).toEqual([]);
    }
    // M asking for another organization's id gets nothing either
    expect(((await mPortal.rpc("payment_credit_balances_as_of", { p_org: other.orgId, p_as_of: "2026-09-30" })).data as unknown[])).toHaveLength(0);
    const anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).error).not.toBeNull();
    // no ledger for the owner, and the returned columns carry amounts only
    expect(((await mPortal.from("journal_entries").select("id")).data ?? [])).toHaveLength(0);
    expect(((await mPortal.from("journal_entry_lines").select("id")).data ?? [])).toHaveLength(0);
    const cols = Object.keys(((await mPortal.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as Record<string, unknown>[])[0]);
    expect(cols.sort()).toEqual(["allocation_id", "amount", "applied_on", "due_id", "kind", "payment_id"]);
  });
  it("a suspended organization closes the owner path (same rule as the receipts policy)", async () => {
    q(`update public.organizations set status='SUSPENDED' where id='${fx.orgId}'`);
    try {
      expect(await owned(mPortal, "2026-09-30")).toEqual([]);
      expect((await owned(accountant, "2026-09-30")).length).toBeGreaterThan(0); // staff with finance.payments.read are not cut off by this rule
    } finally {
      q(`update public.organizations set status='ACTIVE' where id='${fx.orgId}'`);
    }
  });
});

describe.sequential("2. record_advance_payment: allocation dates at receipt time", () => {
  let due = "", covered = "";
  it("an allocation dated BEFORE the due was issued is refused without a trace; on the issue date itself it succeeds", async () => {
    due = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-10", "R2D1");
    await refused(fx.orgId, () => record(accountant, fx, { amount: 700, date: "2026-09-09", allocations: [{ due_id: due, amount: 500 }] }), /PAYMENT_BEFORE_DUE/);
    const same = ok<{ allocated_amount: number; advance_amount: number }>(await record(accountant, fx, { amount: 700, date: "2026-09-10", allocations: [{ due_id: due, amount: 500 }] }));
    expect([same.allocated_amount, same.advance_amount]).toEqual([500, 200]);
    expect(q(`select status from public.dues where id='${due}'`)).toBe("PAID");
  });
  it("a due covered on a later date by a receipt that is voided afterwards cannot be paid twice at an earlier receipt date", async () => {
    covered = await issueDue(fx, owner, fx.unit.id, 300, "2026-09-01", "R2D2");
    const cover = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 400, date: "2026-09-12", allocations: [{ due_id: covered, amount: 300 }] })).payment_id;
    ok(await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: cover, p_reason: "voided later" }) as Rpc);
    expect(Number(q(`select public.due_outstanding('${covered}')::text`))).toBe(300); // owes 300 today ...
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-11", allocations: [{ due_id: covered, amount: 300 }] }), /ALLOCATION_EXCEEDS_REMAINING_ON_DATE/); // ... but on 09-12 it was covered
    ok(await record(accountant, fx, { amount: 500, date: TODAY(), allocations: [{ due_id: covered, amount: 300 }] }));
  });
});

describe.sequential("3. a POSTED receipt without a valid journal entry: the new functions agree with the approved readers", () => {
  let X = "", bad = "", A1 = "", appId = "";
  const readerPaid = (d: string) => Number(q(`select coalesce(sum(amount),0)::text from public.effective_payment_allocations where due_id='${d}'`));
  const expectedStatus = (d: string) => {
    const [amount, dueDate] = q(`select amount::text||'|'||due_date::text from public.dues where id='${d}'`).split("|");
    const paid = readerPaid(d);
    return paid >= Number(amount) ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : dueDate < TODAY() ? "OVERDUE" : "ISSUED";
  };
  const status = (d: string) => q(`select status from public.dues where id='${d}'`);
  it("setup: due X 300 (issued 09-01); a synthetic POSTED receipt WITHOUT an entry holds a 300 allocation on it — the readers say 0 paid, due_outstanding says 0 owed", async () => {
    X = await issueDue(fx, owner, fx.unit.id, 300, "2026-09-01", "R2X");
    bad = q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status) values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 300, 'CASH', '2026-09-02', 'POSTED') returning id) select id from x`).split("\n")[0];
    q(`insert into public.payment_allocations(payment_id, due_id, amount) values('${bad}','${X}', 300)`);
    expect(readerPaid(X)).toBe(0);
    expect(Number(q(`select public.due_outstanding('${X}')::text`))).toBe(0);   // the legacy figure differs ...
    expect(status(X)).toBe("ISSUED");                                           // ... and the stored status was not touched by the raw insert
  });
  it("record_advance_payment allocates against what the readers say is owed (300), and the status follows the readers", async () => {
    const r = await record(accountant, fx, { amount: 400, date: "2026-09-05", allocations: [{ due_id: X, amount: 100 }] });
    A1 = ok<{ payment_id: string }>(r).payment_id;
    expect(readerPaid(X)).toBe(100);
    expect(status(X)).toBe(expectedStatus(X));       // PARTIALLY_PAID: the entry-less 300 does not make it PAID
    expect(status(X)).toBe("PARTIALLY_PAID");
    await refused(fx.orgId, () => record(accountant, fx, { amount: 500, date: "2026-09-05", allocations: [{ due_id: X, amount: 201 }] }), /ALLOCATION_EXCEEDS_REMAINING/); // 300 - 100 = 200 owed
  });
  it("apply and reverse keep the status equal to the readers; the amount shown by the readers is the amount the functions use", async () => {
    appId = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, A1, [{ due_id: X, amount: 50 }], "2026-09-06")).allocations[0].allocation_id;
    expect([readerPaid(X), status(X)]).toEqual([150, expectedStatus(X)]);
    await refused(fx.orgId, () => apply(accountant, fx, A1, [{ due_id: X, amount: 151 }], "2026-09-07"), /ALLOCATION_EXCEEDS_REMAINING/);
    ok(await reverse(accountant, fx, appId, "2026-09-08"));
    expect([readerPaid(X), status(X)]).toEqual([100, expectedStatus(X)]);
    expect(status(X)).toBe("PARTIALLY_PAID");
  });
  it("voiding the receipt recomputes the status by the same rule: back to OVERDUE (the legacy status-only sum would have said PAID)", async () => {
    ok(await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: A1, p_reason: "back to square one" }) as Rpc);
    expect([readerPaid(X), status(X)]).toEqual([0, "OVERDUE"]);
    expect(status(X)).toBe(expectedStatus(X));
    // clean up the synthetic receipt so that the organization's other checks are not distorted
    q(`delete from public.payment_allocations where payment_id='${bad}'`);
    q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic', unallocated_amount=0 where id='${bad}'`);
  });
  it("across the organization: no due's stored status disagrees with the readers for the dues these functions touched", () => {
    const wrong = q(`select count(*) from public.dues d where d.organization_id='${fx.orgId}' and d.status <> 'VOID'
      and d.id in (select due_id from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}')
      and d.status <> case when coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id=d.id),0) >= d.amount then 'PAID'
                           when coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id=d.id),0) > 0 then 'PARTIALLY_PAID'
                           when d.due_date < current_date then 'OVERDUE' else 'ISSUED' end`);
    expect(wrong).toBe("0");
  });
});
