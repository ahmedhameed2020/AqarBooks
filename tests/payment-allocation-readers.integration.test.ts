import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";
import { fetchAllocationsAsOf, fetchEffectiveAllocations, paidByDue } from "../lib/finance/payment-allocations";
import { createClient } from "@supabase/supabase-js";

/**
 * Task 2 of the customer-advances plan: every reader that used to select payment_allocations directly now reads
 * effective_payment_allocations. For LEGACY data (no credit applications) the two must give the SAME figures. The data here
 * is the awkward legacy mix: plain receipts, a part-paid due, a VOIDED receipt (REVERSED, allocation reversed), an Accsys-style
 * receipt that is fully unallocated and one that is partly allocated (unallocated_amount > 0, journal entry present), and a
 * second organization that must stay invisible. Both query shapes run under real RLS sessions (staff and portal owner).
 * Isolated stack only.
 */
const q = (query: string) => sql(query);
type Row = { due_id: string; amount: number | string; payment_id: string };
const canon = (rows: Row[]) => rows.map((r) => `${r.payment_id}|${r.due_id}|${Number(r.amount).toFixed(4)}`).sort();

let fx: JourneyFixture, other: JourneyFixture;
let accountant: Awaited<ReturnType<typeof signedInClient>>;
let owner: Awaited<ReturnType<typeof signedInClient>>;
let portal: Awaited<ReturnType<typeof createClient>>;
let dueA = "", dueB = "", periodId = "";
let r1 = "", r2 = "", r3Voided = "", accsysFull = "", accsysPartial = "";
const DATE = "2026-02-10";
const today = () => q("select current_date::text");

async function receipt(amount: number, due: string, date = DATE) {
  const r = await accountant.rpc("record_payment", {
    p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: amount, p_method: "CASH",
    p_payment_date: date, p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodId, p_allocations: [{ due_id: due, amount }], p_idempotency_key: randomUUID(),
  });
  expect(r.error, r.error?.message).toBeNull();
  return r.data as string;
}

beforeAll(async () => {
  fx = await createJourneyFixture("adv-readers");
  other = await createJourneyFixture("adv-readers-b");
  const admin = adminClient();
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  periodId = (await admin.from("fiscal_periods").select("id").eq("organization_id", fx.orgId).lte("start_date", DATE).gte("end_date", DATE).single()).data!.id as string;
  const dueTypeId = (await admin.from("due_types").select("id").eq("organization_id", fx.orgId).single()).data!.id as string;
  for (const [amount, day] of [[1000, "01"], [500, "02"]] as const) {
    const issued = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: dueTypeId, p_receivable_account_id: fx.accounts["1130"], p_amount: amount, p_issue_date: `2026-02-${day}`, p_due_date: "2026-02-20", p_description: `readers ${amount}` });
    expect(issued.error, issued.error?.message).toBeNull();
  }
  const dues = (await admin.from("dues").select("id, amount").eq("organization_id", fx.orgId).order("amount", { ascending: false })).data!;
  dueA = dues[0].id as string; dueB = dues[1].id as string;

  r1 = await receipt(400, dueA);
  r2 = await receipt(600, dueA);
  r3Voided = await receipt(200, dueB);
  const voided = await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: r3Voided, p_reason: "readers equivalence: voided legacy receipt" });
  expect(voided.error, voided.error?.message).toBeNull();

  // Accsys-style receipts: POSTED, with a journal entry, unallocated_amount > 0 (imports set it), no advance
  const entry = q(`select journal_entry_id from public.payments where id='${r1}'`);
  const mk = (amount: number, unallocated: number) =>
    q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status, journal_entry_id, unallocated_amount, memo, receipt_no)
        values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', ${amount}, 'BANK_TRANSFER', '${DATE}', 'POSTED', '${entry}', ${unallocated}, 'AccSys — سند قبض', 'AS-${amount}') returning id) select id from x`).split("\n")[0];
  accsysFull = mk(300, 300);
  accsysPartial = mk(250, 150);
  q(`insert into public.payment_allocations(payment_id, due_id, amount) values('${accsysPartial}','${dueB}', 100)`);

  // a portal owner: the member is linked to an auth user (current_member_id() = members.user_id)
  const admin2 = adminClient();
  const email = `portal-owner-${fx.tag}@demo.local`;
  const created = await admin2.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(created.error).toBeNull();
  q(`update public.members set user_id='${created.data.user!.id}' where id='${fx.member.id}'`);
  portal = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await portal.auth.signInWithPassword({ email, password: PASSWORD });
  expect(login.error, login.error?.message).toBeNull();

  // the other organization has a due and a receipt of its own (RLS isolation)
  const odt = (await admin.from("due_types").select("id").eq("organization_id", other.orgId).single()).data!.id as string;
  const os = await signedInClient(other.owner.email);
  const oi = await os.rpc("issue_dues", { p_organization_id: other.orgId, p_resort_id: other.propertyId, p_unit_ids: [other.unit.id], p_due_type_id: odt, p_receivable_account_id: other.accounts["1130"], p_amount: 700, p_issue_date: "2026-02-01", p_due_date: "2026-02-20", p_description: "other org" });
  expect(oi.error, oi.error?.message).toBeNull();
  const oDue = (await admin.from("dues").select("id").eq("organization_id", other.orgId).single()).data!.id as string;
  const oPeriod = (await admin.from("fiscal_periods").select("id").eq("organization_id", other.orgId).lte("start_date", DATE).gte("end_date", DATE).single()).data!.id as string;
  const oAcc = await signedInClient(other.accountant.email);
  const orec = await oAcc.rpc("record_payment", { p_organization_id: other.orgId, p_resort_id: other.propertyId, p_member_id: other.member.id, p_unit_id: other.unit.id, p_amount: 300, p_method: "CASH", p_payment_date: DATE, p_deposit_account_id: other.accounts["1110"], p_fiscal_period_id: oPeriod, p_allocations: [{ due_id: oDue, amount: 300 }], p_idempotency_key: randomUUID() });
  expect(orec.error, orec.error?.message).toBeNull();
}, 600_000);

describe("data layer: the old query shape and the effective view agree on legacy data", () => {
  it("staff pages (cashier, dues, payments, aging, cash-flow, dashboard): whole-table select + POSTED filter == the view", async () => {
    const oldAll = (await accountant.from("payment_allocations").select("due_id, amount, payment_id")).data as Row[];
    const posted = new Set(((await accountant.from("payments").select("id").eq("organization_id", fx.orgId).eq("status", "POSTED")).data ?? []).map((p) => p.id));
    const oldPage = oldAll.filter((a) => posted.has(a.payment_id));
    const view = (await accountant.from("effective_payment_allocations").select("due_id, amount, payment_id")).data as Row[];
    expect(canon(view)).toEqual(canon(oldPage));
    // the raw old read DID contain the voided receipt's allocation; the view never does (that is why the pages filtered by status)
    expect(canon(oldAll).some((l) => l.startsWith(`${r3Voided}|`))).toBe(true);
    expect(canon(view).some((l) => l.startsWith(`${r3Voided}|`))).toBe(false);
    // 400 + 600 on A, Accsys partial 100 on B; the voided 200 is gone
    expect(canon(view)).toEqual([`${r1}|${dueA}|400.0000`, `${r2}|${dueA}|600.0000`, `${accsysPartial}|${dueB}|100.0000`].sort());
  });

  it("owner statement / property pages / unit page: .in(due_id) shapes agree, per-due paid totals agree, and match due_outstanding and units_with_financials", async () => {
    const ids = [dueA, dueB];
    const oldIn = (await accountant.from("payment_allocations").select("due_id, payment_id, amount").in("due_id", ids)).data as Row[];
    const posted = new Set(((await accountant.from("payments").select("id").eq("organization_id", fx.orgId).eq("status", "POSTED")).data ?? []).map((p) => p.id));
    const oldPaid = paidByDue(oldIn.filter((a) => posted.has(a.payment_id)));
    const viaHelper = await fetchEffectiveAllocations(accountant as never, ids);
    expect(viaHelper.error).toBeNull();
    const newPaid = paidByDue(viaHelper.data);
    expect([...newPaid.entries()].sort()).toEqual([...oldPaid.entries()].sort());
    expect(newPaid.get(dueA)).toBe(1000);
    expect(newPaid.get(dueB)).toBe(100);
    for (const [id, amount] of [[dueA, 1000], [dueB, 500]] as const) {
      const outstanding = Number(q(`select public.due_outstanding('${id}')::text`));
      expect(outstanding).toBeCloseTo(amount - (newPaid.get(id) ?? 0), 4);
    }
    const unit = q(`select total_due::text||'/'||total_paid::text||'/'||balance::text from public.units_with_financials where id='${fx.unit.id}'`);
    expect(unit).toBe("1500.0000/1100.0000/400.0000");
  });

  it("Accsys-style receipts: fully unallocated has no allocation and no credit; partly allocated counts only its allocation; neither is an advance", async () => {
    const view = (await accountant.from("effective_payment_allocations").select("payment_id, amount")).data as { payment_id: string; amount: number }[];
    expect(view.some((r) => r.payment_id === accsysFull)).toBe(false);
    expect(view.filter((r) => r.payment_id === accsysPartial).map((r) => Number(r.amount))).toEqual([100]);
    const balances = (await accountant.from("payment_credit_balances").select("payment_id")).data ?? [];
    expect(balances.filter((b) => [accsysFull, accsysPartial].includes(b.payment_id))).toEqual([]);
    expect(q(`select advance_amount::text||'/'||unallocated_amount::text from public.payments where id='${accsysFull}'`)).toBe("0.0000/300.0000"); // legacy meaning untouched
  });

  it("the voided receipt: payment REVERSED, allocation reversed, reversal date = the reversal entry date, absent from the view", () => {
    expect(q(`select p.status||'/'||(pa.reversed_at is not null)::text||'/'||(pa.reversed_on = je.entry_date)::text from public.payments p join public.payment_allocations pa on pa.payment_id=p.id join public.journal_entries je on je.id=p.reversal_journal_entry_id where p.id='${r3Voided}'`)).toBe("REVERSED/true/true");
    expect(q(`select count(*) from public.effective_payment_allocations where payment_id='${r3Voided}'`)).toBe("0");
  });

  it("organization isolation: staff of one organization see none of the other's allocations in either shape", async () => {
    expect(q(`select count(*) from public.effective_payment_allocations where organization_id='${other.orgId}'`)).toBe("1"); // it exists ...
    const mine = (await accountant.from("effective_payment_allocations").select("organization_id")).data ?? [];
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.organization_id === fx.orgId)).toBe(true);                                                     // ... and is invisible here
    const rawMine = (await accountant.from("payment_allocations").select("payment_id")).data ?? [];
    const foreign = new Set(((await adminClient().from("payments").select("id").eq("organization_id", other.orgId)).data ?? []).map((p) => p.id));
    expect(rawMine.some((r) => foreign.has(r.payment_id))).toBe(false);                                                      // old shape isolated too
  });

  it("portal owner (RLS own POSTED receipts): old shape with the reversed_at filter == the view", async () => {
    const oldRaw = (await portal.from("payment_allocations").select("due_id, amount, reversed_at").in("due_id", [dueA, dueB])).data as unknown as { due_id: string; amount: number; reversed_at: string | null }[];
    const oldPaid = paidByDue(oldRaw.filter((a) => !a.reversed_at));
    const view = (await portal.from("effective_payment_allocations").select("due_id, amount").in("due_id", [dueA, dueB])).data as { due_id: string; amount: number }[];
    const newPaid = paidByDue(view);
    expect([...newPaid.entries()].sort()).toEqual([...oldPaid.entries()].sort());
    expect(newPaid.get(dueA)).toBe(1000);
    expect(newPaid.get(dueB)).toBe(100);
    // another organization's dues are invisible through the view
    const foreignDue = q(`select id from public.dues where organization_id='${other.orgId}' limit 1`);
    expect(((await portal.from("effective_payment_allocations").select("due_id").eq("due_id", foreignDue)).data ?? []).length).toBe(0);
  });
});

describe("as-of: the same legacy figures at a date, with receipts voided later still counted before their void", () => {
  it("as_of(today) per due equals the effective view; as_of(before any receipt) is empty", async () => {
    const asToday = await fetchAllocationsAsOf(accountant as never, fx.orgId, await today());
    expect(asToday.error).toBeNull();
    const mine = paidByDue(asToday.data.filter((r) => [dueA, dueB].includes(r.due_id)));
    expect(mine.get(dueA)).toBe(1000);
    expect(mine.get(dueB)).toBe(100);                       // the voided 200 is not effective today
    const early = await fetchAllocationsAsOf(accountant as never, fx.orgId, "2026-02-09");
    expect(early.data.filter((r) => [dueA, dueB].includes(r.due_id))).toEqual([]);
  });

  it("the voided receipt counts at dates before its void and not from the void date (it was dated 2026-02-10, voided today)", async () => {
    const at = async (d: string) => paidByDue((await fetchAllocationsAsOf(accountant as never, fx.orgId, d)).data.filter((r) => r.due_id === dueB)).get(dueB) ?? 0;
    expect(await at("2026-02-10")).toBe(300);               // 200 (voided later) + Accsys partial 100
    expect(await at(await today())).toBe(100);
  });
});

describe("intended difference (new semantics, not a legacy change): a REVERSED credit application of a POSTED receipt", () => {
  it("is counted by the old whole-table shape but never by the view or as-of", async () => {
    const stand = q(`select journal_entry_id from public.payments where id='${r2}'`);
    const standDate = q(`select entry_date::text from public.journal_entries where id='${stand}'`);
    const id = q(`with x as (insert into public.payment_allocations(payment_id, due_id, amount, kind, journal_entry_id, credit_account_id, applied_on, reversed_at, reversed_by, reversed_on, reversal_journal_entry_id)
      values('${r2}','${dueB}', 40, 'CREDIT_APPLICATION', '${stand}', '${fx.accounts["2250"]}', '${DATE}', now(), '${fx.owner.id}', '${standDate}', '${stand}') returning id) select id from x`).split("\n")[0];
    const old = (await accountant.from("payment_allocations").select("id, amount").eq("id", id)).data ?? [];
    expect(old).toHaveLength(1);                                                                        // old shape would have counted it
    expect(((await accountant.from("effective_payment_allocations").select("id").eq("id", id)).data ?? [])).toHaveLength(0);
    expect(q(`select count(*) from public.payment_allocations_as_of('${fx.orgId}','${standDate}') where allocation_id='${id}'`)).toBe("0");
    expect(q(`select balance::text from public.units_with_financials where id='${fx.unit.id}'`)).toBe("400.0000"); // unchanged
  });
});
