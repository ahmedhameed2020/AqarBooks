import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { adminClient, createJourneyFixture, localEnv, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Review fixes (migration 20261017100200): historical balances, posted-entry readers, one idempotency registry, and the as-of
 * functions under an owner's own portal session. Past dates only (V1 refuses future ones). Isolated stack only.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
type Rpc = { data: unknown; error: { code?: string; message: string } | null };
const ok = <T = Record<string, unknown>>(r: Rpc): T => { expect(r.error, r.error?.message).toBeNull(); return r.data as T; };
const err = (r: Rpc) => `${r.error?.code ?? ""}:${r.error?.message ?? ""}`;
const TOMORROW = () => q("select (current_date + 1)::text");

let fx: JourneyFixture, other: JourneyFixture;
let owner: Client, accountant: Client, otherOwner: Client;
let u2 = "", m2 = "", u3 = "", m3 = "";
const periodOf = (orgId: string, date: string) => q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`) || randomUUID();

async function snap(orgId: string) {
  return q(`select (select count(*) from public.payments where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}')||'/'||
    (select count(*) from public.journal_entries where organization_id='${orgId}')||'/'||
    (select count(*) from public.platform_audit_logs where organization_id='${orgId}')||'/'||
    (select count(*) from public.payment_credit_requests where organization_id='${orgId}')||'/'||
    md5(coalesce((select string_agg(d.id::text||d.status, ',' order by d.id) from public.dues d where d.organization_id='${orgId}'),'')||
        coalesce((select string_agg(p.id::text||p.status||p.unallocated_amount::text, ',' order by p.id) from public.payments p where p.organization_id='${orgId}'),'')||
        coalesce((select string_agg(pa.id::text||(pa.reversed_at is not null)::text, ',' order by pa.id) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${orgId}'),''))`);
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
const apply = (c: Client, f: JourneyFixture, payment: string, allocations: { due_id: string; amount: number }[], date: string, key = randomUUID()) =>
  c.rpc("apply_payment_credit", { p_organization_id: f.orgId, p_payment_id: payment, p_allocations: allocations, p_application_date: date, p_fiscal_period_id: periodOf(f.orgId, date), p_idempotency_key: key }) as PromiseLike<Rpc>;
const reverse = (c: Client, f: JourneyFixture, allocation: string, date: string, key = randomUUID(), reason = "undo") =>
  c.rpc("reverse_credit_application", { p_organization_id: f.orgId, p_allocation_id: allocation, p_reason: reason, p_reversal_date: date, p_fiscal_period_id: periodOf(f.orgId, date), p_idempotency_key: key }) as PromiseLike<Rpc>;
async function issueDue(f: JourneyFixture, c: Client, unit: string, amount: number, date: string, label: string) {
  const typeId = q(`select id from public.due_types where organization_id='${f.orgId}' limit 1`);
  const r = await c.rpc("issue_dues", { p_organization_id: f.orgId, p_resort_id: f.propertyId, p_unit_ids: [unit], p_due_type_id: typeId, p_receivable_account_id: f.accounts["1130"], p_amount: amount, p_issue_date: date, p_due_date: date, p_description: label });
  expect(r.error, r.error?.message).toBeNull();
  return q(`select id from public.dues where organization_id='${f.orgId}' and description='${label}'`).split("\n")[0];
}
/** credit left and amount owed on EVERY day from `from` to today, as the as-of functions compute them: none may be negative */
function assertNoNegativeHistory(orgId: string, payments: string[], dues: string[], from = "2026-08-01") {
  const pList = payments.map((p) => `'${p}'`).join(","), dList = dues.map((d) => `'${d}'`).join(",");
  const credit = q(`select d::date::text||':'||c::text from generate_series('${from}'::date, current_date, interval '1 day') d,
    lateral (select coalesce(min(remaining_amount),0) c from public.payment_credit_balances_as_of('${orgId}', d::date) where payment_id in (${pList})) x order by c limit 1`);
  expect(Number(credit.split(":")[1]), `lowest credit (${credit})`).toBeGreaterThanOrEqual(0);
  const owed = q(`select d::date::text||':'||c::text from generate_series('${from}'::date, current_date, interval '1 day') d,
    lateral (select coalesce(min(x.amount - coalesce((select sum(a.amount) from public.payment_allocations_as_of('${orgId}', d::date) a where a.due_id=x.id),0)),0) c
             from public.dues x where x.id in (${dList}) and x.issue_date <= d::date) y order by c limit 1`);
  expect(Number(owed.split(":")[1]), `lowest amount owed (${owed})`).toBeGreaterThanOrEqual(0);
}

beforeAll(async () => {
  fx = await createJourneyFixture("adv-int");
  other = await createJourneyFixture("adv-int-other");
  const admin = adminClient();
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  otherOwner = await signedInClient(other.owner.email);
  ok(await owner.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] }));
  u2 = randomUUID(); m2 = randomUUID(); u3 = randomUUID(); m3 = randomUUID();
  for (const [u, m, code] of [[u2, m2, "B-202"], [u3, m3, "C-303"]] as const) {
    await admin.from("units").insert({ id: u, organization_id: fx.orgId, property_id: fx.propertyId, code });
    await admin.from("members").insert({ id: m, organization_id: fx.orgId, full_name: `Owner ${code}` });
    await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: u, member_id: m, share_percentage: 100, is_primary_contact: true, start_date: "2026-01-01" });
  }
}, 600_000);

describe.sequential("1. a back-dated application can never overdraw a later date", () => {
  let RA = "", E1 = "", E2 = "", E3 = "", E4 = "";
  const applied: { alloc: string }[] = [];
  it("setup: advance 1,000 on 08-10; dues E1 900, E2 900, E3 500 issued 09-01", async () => {
    RA = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 1000, date: "2026-08-10" })).payment_id;
    E1 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-01", "E1");
    E2 = await issueDue(fx, owner, fx.unit.id, 900, "2026-09-01", "E2");
    E3 = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-01", "E3");
    E4 = await issueDue(fx, owner, fx.unit.id, 500, "2026-09-01", "E4");
  });
  it("the reviewer's case: apply 600 on 09-05, reverse it on 09-09, then apply 800 on 09-07 — today's balance would allow it, the 7th would be -400 => refused", async () => {
    const a600 = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, RA, [{ due_id: E1, amount: 600 }], "2026-09-05")).allocations[0].allocation_id;
    ok(await reverse(accountant, fx, a600, "2026-09-09"));
    expect(Number(q(`select unallocated_amount::text from public.payments where id='${RA}'`))).toBe(1000); // the NOW check alone would pass
    await refused(fx.orgId, () => apply(accountant, fx, RA, [{ due_id: E2, amount: 800 }], "2026-09-07"), /CREDIT_EXCEEDED_ON_DATE/);
    // the largest amount the 7th can take is the minimum credit from that day on: 400
    const ok400 = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, RA, [{ due_id: E2, amount: 400 }], "2026-09-07"));
    applied.push({ alloc: ok400.allocations[0].allocation_id });
    await refused(fx.orgId, () => apply(accountant, fx, RA, [{ due_id: E2, amount: 1 }], "2026-09-07"), /CREDIT_EXCEEDED_ON_DATE/);
    ok(await apply(accountant, fx, RA, [{ due_id: E3, amount: 300 }], "2026-09-10")); // from the 9th the freed credit makes room: 1,000 - 400 (E2) >= 300
    assertNoNegativeHistory(fx.orgId, [RA], [E1, E2, E3]);
  });
  it("reversal side: reversing an application never creates a negative anywhere", async () => {
    const [{ alloc }] = applied;
    ok(await reverse(accountant, fx, alloc, "2026-09-12"));
    assertNoNegativeHistory(fx.orgId, [RA], [E1, E2, E3]);
  });
  it("the due side: a receipt that covered the due on 09-10 and was voided later does not let a credit application pay it twice on that date", async () => {
    const cover = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 700, date: "2026-09-03", allocations: [{ due_id: E4, amount: 500 }] })).payment_id; // pays E4 fully, 200 advance
    ok(await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: cover, p_reason: "voided later" }));        // E4 owes 500 again TODAY
    expect(Number(q(`select public.due_outstanding('${E4}')::text`))).toBe(500);
    await refused(fx.orgId, () => apply(accountant, fx, RA, [{ due_id: E4, amount: 100 }], "2026-09-10"), /ALLOCATION_EXCEEDS_REMAINING_ON_DATE/);
    // today the covering receipt is no longer effective, so applying today is fine
    ok(await apply(accountant, fx, RA, [{ due_id: E4, amount: 100 }], q("select current_date::text")));
    assertNoNegativeHistory(fx.orgId, [RA], [E1, E2, E3, E4]);
  });
  it("an application cannot be dated before the due was issued", async () => {
    await refused(fx.orgId, () => apply(accountant, fx, RA, [{ due_id: E4, amount: 10 }], "2026-08-31"), /APPLICATION_BEFORE_DUE/);
  });
  it("a fixed sequence of valid and invalid applications and reversals keeps every day non-negative", async () => {
    const R2 = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 1000, date: "2026-08-12" })).payment_id;
    const F1 = await issueDue(fx, owner, fx.unit.id, 700, "2026-09-01", "F1");
    const F2 = await issueDue(fx, owner, fx.unit.id, 700, "2026-09-01", "F2");
    const live: string[] = [];
    const steps: [string, string, number, string][] = [["F1", "ap", 300, "2026-09-03"], ["F2", "ap", 600, "2026-09-04"], ["F1", "ap", 200, "2026-09-02"], ["F2", "rv", 0, "2026-09-08"], ["F1", "ap", 500, "2026-09-05"], ["F2", "ap", 900, "2026-09-06"], ["F2", "ap", 450, "2026-09-06"], ["F1", "rv", 0, "2026-09-10"], ["F2", "ap", 100, "2026-09-09"]];
    for (const [due, op, amount, date] of steps) {
      if (op === "ap") {
        const r = await apply(accountant, fx, R2, [{ due_id: due === "F1" ? F1 : F2, amount }], date);
        if (!r.error) live.push((r.data as { allocations: { allocation_id: string }[] }).allocations[0].allocation_id);
      } else if (live.length) {
        const a = live.shift()!;
        const r = await reverse(accountant, fx, a, date);
        if (r.error) live.unshift(a);
      }
      assertNoNegativeHistory(fx.orgId, [R2], [F1, F2]);
    }
  }, 600_000);
});

describe.sequential("2. readers require a POSTED receipt entry (views as well as as-of)", () => {
  it("a POSTED receipt whose entry is missing or DRAFT is invisible to the effective view, the credit view and the unit balance; with a posted entry it is counted", async () => {
    const admin = adminClient();
    const due = await issueDue(fx, owner, fx.unit.id, 300, "2026-09-02", "G1");
    const posted = q(`select journal_entry_id from public.payments where organization_id='${fx.orgId}' and advance_amount>0 and status='POSTED' limit 1`);
    const draft = (await admin.from("journal_entries").insert({ organization_id: fx.orgId, property_id: fx.propertyId, fiscal_period_id: periodOf(fx.orgId, "2026-09-02"), entry_date: "2026-09-02", description: "draft stand-in", source_type: "RECEIPT_VOUCHER", status: "DRAFT", created_by: fx.owner.id }).select("id").single());
    expect(draft.error, draft.error?.message).toBeNull();
    const mk = (entry: string | null, advance: number) =>
      q(`with x as (insert into public.payments(organization_id, property_id, member_id, unit_id, amount, method, payment_date, status, journal_entry_id, unallocated_amount, advance_amount, advance_account_id)
         values('${fx.orgId}','${fx.propertyId}','${fx.member.id}','${fx.unit.id}', 100, 'CASH', '2026-09-02', 'POSTED', ${entry ? `'${entry}'` : "null"}, ${advance}, ${advance}, ${advance ? `'${fx.accounts["2250"]}'` : "null"}) returning id) select id from x`).split("\n")[0];
    const noEntry = mk(null, 0), inDraft = mk(draft.data!.id as string, 0), good = mk(posted, 0);
    const advNoEntry = mk(null, 100), advDraft = mk(draft.data!.id as string, 100), advGood = mk(posted, 100);
    for (const p of [noEntry, inDraft, good]) q(`insert into public.payment_allocations(payment_id, due_id, amount) values('${p}','${due}', 10)`);
    const visible = (p: string) => Number(q(`select count(*) from public.effective_payment_allocations where payment_id='${p}'`));
    expect([visible(noEntry), visible(inDraft), visible(good)]).toEqual([0, 0, 1]);
    const credit = (p: string) => Number(q(`select count(*) from public.payment_credit_balances where payment_id='${p}'`));
    expect([credit(advNoEntry), credit(advDraft), credit(advGood)]).toEqual([0, 0, 1]);
    // the unit balance counts only the good receipt's 10
    expect(Number(q(`select (select sum(amount) from public.effective_payment_allocations where due_id='${due}')::text`))).toBe(10);
    // and the as-of functions agree
    expect(Number(q(`select count(*) from public.payment_allocations_as_of('${fx.orgId}', current_date) where payment_id in ('${noEntry}','${inDraft}')`))).toBe(0);
    expect(Number(q(`select count(*) from public.payment_credit_balances_as_of('${fx.orgId}', current_date) where payment_id in ('${advNoEntry}','${advDraft}')`))).toBe(0);
    expect(Number(q(`select count(*) from public.payment_credit_balances_as_of('${fx.orgId}', current_date) where payment_id = '${advGood}'`))).toBe(1);
    // tidy: these stand-ins must not distort the organization's other checks
    for (const p of [noEntry, inDraft, good, advNoEntry, advDraft, advGood]) {
      q(`delete from public.payment_allocations where payment_id='${p}'`);
      q(`update public.payments set status='REVERSED', reversed_at=now(), reversed_by='${fx.owner.id}', reversal_reason='synthetic', unallocated_amount=0 where id='${p}'`);
    }
  });
});

describe.sequential("3. one idempotency registry for record / apply / reverse", () => {
  let RB = "", EB = "";
  it("a key used by one operation is refused by the other two, in every direction, and each operation still replays itself", async () => {
    RB = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 500, date: "2026-09-01" })).payment_id;
    EB = await issueDue(fx, owner, fx.unit.id, 800, "2026-09-02", "H1");
    const kRecord = randomUUID(), kApply = randomUUID(), kReverse = randomUUID();
    const rec = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 60, date: "2026-09-02", key: kRecord }));
    const app = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, RB, [{ due_id: EB, amount: 100 }], "2026-09-05", kApply));
    const toReverse = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, RB, [{ due_id: EB, amount: 50 }], "2026-09-06")).allocations[0].allocation_id;
    ok(await reverse(accountant, fx, toReverse, "2026-09-07", kReverse));
    const spare = ok<{ allocations: { allocation_id: string }[] }>(await apply(accountant, fx, RB, [{ due_id: EB, amount: 20 }], "2026-09-08")).allocations[0].allocation_id;
    const anyDue = EB;
    // record-key reused by apply / reverse
    await refused(fx.orgId, () => apply(accountant, fx, RB, [{ due_id: anyDue, amount: 10 }], "2026-09-09", kRecord), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => reverse(accountant, fx, spare, "2026-09-09", kRecord), /IDEMPOTENCY_KEY_REUSED/);
    // apply-key reused by record / reverse
    await refused(fx.orgId, () => record(accountant, fx, { amount: 60, date: "2026-09-02", key: kApply }), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => reverse(accountant, fx, spare, "2026-09-09", kApply), /IDEMPOTENCY_KEY_REUSED/);
    // reverse-key reused by record / apply
    await refused(fx.orgId, () => record(accountant, fx, { amount: 60, date: "2026-09-02", key: kReverse }), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => apply(accountant, fx, RB, [{ due_id: anyDue, amount: 10 }], "2026-09-09", kReverse), /IDEMPOTENCY_KEY_REUSED/);
    // each operation replays itself (same key, same content) without a trace
    const before = await snap(fx.orgId);
    expect(ok<{ payment_id: string; replay: boolean }>(await record(accountant, fx, { amount: 60, date: "2026-09-02", key: kRecord }))).toMatchObject({ payment_id: rec.payment_id, replay: true });
    expect(ok<{ replay: boolean }>(await apply(accountant, fx, RB, [{ due_id: EB, amount: 100 }], "2026-09-05", kApply)).replay).toBe(true);
    expect(ok<{ replay: boolean }>(await reverse(accountant, fx, toReverse, "2026-09-07", kReverse)).replay).toBe(true);
    expect(await snap(fx.orgId)).toBe(before);
    expect(app.allocations).toHaveLength(1);
    expect(Number(q(`select count(*) from public.payment_credit_requests where organization_id='${fx.orgId}' and idempotency_key in ('${kRecord}','${kApply}','${kReverse}')`))).toBe(3);
    expect(q(`select string_agg(operation, ',' order by operation) from public.payment_credit_requests where organization_id='${fx.orgId}' and idempotency_key in ('${kRecord}','${kApply}','${kReverse}')`)).toBe("APPLY_CREDIT,RECORD_ADVANCE,REVERSE_APPLICATION");
  });
  it("a key that already identifies a receipt (recorded by the legacy record_payment) is refused by all three", async () => {
    const dueP = await issueDue(fx, owner, fx.unit.id, 200, "2026-09-02", "H2");
    const legacyKey = randomUUID();
    ok(await accountant.rpc("record_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: fx.member.id, p_unit_id: fx.unit.id, p_amount: 50, p_method: "CASH", p_payment_date: "2026-09-03", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodOf(fx.orgId, "2026-09-03"), p_allocations: [{ due_id: dueP, amount: 50 }], p_idempotency_key: legacyKey }) as Rpc);
    const live = q(`select pa.id from public.payment_allocations pa where pa.payment_id='${RB}' and pa.kind='CREDIT_APPLICATION' and pa.reversed_at is null limit 1`);
    await refused(fx.orgId, () => record(accountant, fx, { amount: 50, date: "2026-09-03", key: legacyKey }), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => apply(accountant, fx, RB, [{ due_id: dueP, amount: 10 }], "2026-09-09", legacyKey), /IDEMPOTENCY_KEY_REUSED/);
    await refused(fx.orgId, () => reverse(accountant, fx, live, "2026-09-09", legacyKey), /IDEMPOTENCY_KEY_REUSED/);
  });
  it("every advance receipt recorded before the registry took over has its registry row (backfill), in every organization", () => {
    expect(q(`select count(*) from public.payments p where p.request_hash is not null and p.idempotency_key is not null and not exists (select 1 from public.payment_credit_requests r where r.organization_id=p.organization_id and r.idempotency_key=p.idempotency_key)`)).toBe("0");
  });
});

describe.sequential("4. the as-of readers under an owner's own portal session (no wider access to the ledger)", () => {
  let mPortal: ReturnType<typeof createClient>, m2Portal: ReturnType<typeof createClient>;
  let mReceipt = "", m2Receipt = "", mVoided = "";
  const login = async (memberId: string, label: string) => {
    const admin = adminClient();
    const email = `${label}-${fx.tag}@demo.local`;
    const u = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    q(`update public.members set user_id='${u.data.user!.id}' where id='${memberId}'`);
    const c = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await c.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    return c;
  };
  it("setup: member M has an advance receipt with one application; member M2 (another unit) has its own; M also has a receipt that was voided", async () => {
    const dueM = await issueDue(fx, owner, u3, 400, "2026-09-02", "P1");
    mReceipt = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 700, date: "2026-09-02", unit: u3, member: m3 })).payment_id;
    ok(await apply(accountant, fx, mReceipt, [{ due_id: dueM, amount: 250 }], "2026-09-06"));
    m2Receipt = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 300, date: "2026-09-02", unit: u2, member: m2 })).payment_id;
    mVoided = ok<{ payment_id: string }>(await record(accountant, fx, { amount: 90, date: "2026-09-02", unit: u3, member: m3 })).payment_id;
    ok(await owner.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: mVoided, p_reason: "owner never sees voided receipts" }));
    mPortal = await login(m3, "portal-m");
    m2Portal = await login(m2, "portal-m2");
  });
  it("M sees exactly the right figures at each date, equal to the staff view for M's receipt; the ledger stays closed to M", async () => {
    const asOf = async (c: ReturnType<typeof createClient>, d: string) => (await c.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: d })).data as { payment_id: string; remaining_amount: number }[];
    const staff = async (d: string) => ((await accountant.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: d })).data as { payment_id: string; remaining_amount: number }[]).find((r) => r.payment_id === mReceipt)?.remaining_amount;
    for (const [date, expected] of [["2026-09-01", undefined], ["2026-09-03", 700], ["2026-09-05", 700], ["2026-09-06", 450], ["2026-09-30", 450]] as const) {
      const mine = (await asOf(mPortal, date)).find((r) => r.payment_id === mReceipt)?.remaining_amount;
      expect(mine === undefined ? undefined : Number(mine), `M on ${date}`).toBe(expected);
      const viaStaff = await staff(date);
      expect(mine === undefined ? undefined : Number(mine), `staff on ${date}`).toBe(viaStaff === undefined ? undefined : Number(viaStaff));
    }
    // only M's own receipts (not M2's). Before its void date the voided receipt IS part of M's figures (it was in force then); from the
    // void date (today) it is gone — the day-by-day equality with the staff view is asserted in customer-advances-review2.
    const ids = (await asOf(mPortal, "2026-09-30")).map((r) => r.payment_id).sort();
    expect(ids).toEqual([mReceipt, mVoided].sort());
    expect((await asOf(mPortal, q("select current_date::text"))).map((r) => r.payment_id)).toEqual([mReceipt]);
    expect((await mPortal.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as unknown[]).toHaveLength(1); // M's one application
    // no wider access to the ledger
    expect(((await mPortal.from("journal_entries").select("id")).data ?? [])).toHaveLength(0);
    expect(((await mPortal.from("journal_entry_lines").select("id")).data ?? [])).toHaveLength(0);
    expect((await mPortal.rpc("payment_receipt_entry_status", { p_payment_id: mReceipt })).data).toBe("POSTED");   // its own receipt: a status word only
    expect((await mPortal.rpc("payment_receipt_entry_status", { p_payment_id: m2Receipt })).data).toBeNull();      // somebody else's: nothing
    expect((await mPortal.rpc("payment_receipt_entry_status", { p_payment_id: randomUUID() })).data).toBeNull();
  });
  it("another member of the same organization, the other organization's owner and an anonymous caller see none of M's figures", async () => {
    const m2Ids = ((await m2Portal.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as { payment_id: string }[]).map((r) => r.payment_id);
    expect(m2Ids).toEqual([m2Receipt]);
    expect(((await m2Portal.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as unknown[])).toHaveLength(0);
    expect(((await otherOwner.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as unknown[])).toHaveLength(0);
    expect(((await otherOwner.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).data as unknown[])).toHaveLength(0);
    expect((await otherOwner.rpc("payment_receipt_entry_status", { p_payment_id: mReceipt })).data).toBeNull();
    const anon = createClient(localEnv().url, localEnv().anon, { auth: { persistSession: false, autoRefreshToken: false } });
    expect((await anon.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-09-30" })).error).not.toBeNull();
    expect((await anon.rpc("payment_receipt_entry_status", { p_payment_id: mReceipt })).error).not.toBeNull();
    // the views follow the same rule for the owner
    expect(((await mPortal.from("payment_credit_balances").select("payment_id")).data ?? []).map((r) => r.payment_id)).toEqual([mReceipt]);
    expect(((await m2Portal.from("effective_payment_allocations").select("payment_id").eq("payment_id", mReceipt)).data ?? [])).toHaveLength(0);
  });
  it("grants: the helper is executable by authenticated and service_role only; the minimum helpers by nobody but the owner", () => {
    const acl = (n: string) => q(`select coalesce((select string_agg(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end, ',' order by a.grantee) from aclexplode(proacl) a),'DEFAULT-PUBLIC') from pg_proc where pronamespace='public'::regnamespace and proname='${n}'`);
    expect(acl("payment_receipt_entry_status")).not.toMatch(/anon|PUBLIC/);
    expect(acl("payment_receipt_entry_status")).toContain("authenticated");
    for (const f of ["credit_min_available_from", "due_min_outstanding_from"]) expect(acl(f), f).not.toMatch(/authenticated|anon|PUBLIC/);
  });
});

describe.sequential("5. the books still agree after all of the above", () => {
  it("the 2250 ledger equals the credit left on POSTED advance receipts; every entry balances; the other organization is untouched", () => {
    const ledger = q(`select coalesce(sum(l.credit - l.debit),0)::text from public.journal_entry_lines l join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and l.account_id='${fx.accounts["2250"]}'`);
    const credit = q(`select coalesce(sum(p.unallocated_amount),0)::text from public.payments p where p.organization_id='${fx.orgId}' and p.advance_amount>0 and p.status='POSTED' and p.journal_entry_id is not null and p.advance_account_id='${fx.accounts["2250"]}'`);
    expect(Number(ledger)).toBe(Number(credit));
    expect(q(`select count(*) from (select j.id from public.journal_entries j join public.journal_entry_lines l on l.journal_entry_id=j.id where j.organization_id='${fx.orgId}' group by j.id having sum(l.debit) <> sum(l.credit)) x`)).toBe("0");
    expect(q(`select count(*) from public.payments where organization_id='${other.orgId}'`)).toBe("0");
  });
  it("(sanity) the date guard still stands: tomorrow is refused", async () => {
    const R = q(`select id from public.payments where organization_id='${fx.orgId}' and advance_amount>0 and status='POSTED' limit 1`);
    const d = q(`select id from public.dues where organization_id='${fx.orgId}' and description='E1'`);
    await refused(fx.orgId, () => apply(accountant, fx, R, [{ due_id: d, amount: 1 }], TOMORROW()), /FUTURE_DATE_NOT_ALLOWED/);
  });
});
