import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { createClient, member } = vi.hoisted(() => ({ createClient: vi.fn(), member: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/portal-member", () => ({ getPortalMemberContext: async () => ({ status: "ok", member: member.current }) }));

import { getOwnPositionAsOfAction } from "@/lib/actions/member-portal-receipts";
import { buildLedger, type LedgerMovement } from "@/lib/portal/statement-ledger";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Compatibility of a LEGACY receipt -- one with an unallocated remainder that is NOT a customer advance (Accsys-style: advance_amount 0,
 * unallocated_amount > 0) and a valid, independent, posted journal entry -- with the customer-advances work.
 *
 *   D1 = 2,000 (issued 1 Feb). LEG = 1,000 on 10 Mar by member M: 600 allocated to D1, 400 left unallocated
 *   (entry: Dr cash 1,000 / Cr receivables 600 / Cr unearned revenue 400 -- nothing to do with the advance account).
 *   20 Mar: M's ownership ends, new owner N. Then the receipt is voided.
 *
 * Meaning kept: the 400 is still "paid on account", still not credit, still not applicable. Statement = position, before and after the void.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
let fx: JourneyFixture, other: JourneyFixture;
let owner: Client, accountant: Client, mSession: Client, nSession: Client, otherMember: Client;
let memberM = "", memberN = "", d1 = "", leg = "", voidDate = "";
const as = (c: Client) => createClient.mockResolvedValue(c as never);
const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => {
  expect(r.error, r.error?.message).toBeNull();
  return r.data as T;
};

async function linkUser(f: JourneyFixture, memberId: string, label: string) {
  const email = `${label}-${f.tag}@demo.local`;
  const created = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  ok(await adminClient().from("members").update({ user_id: created.data.user!.id, email }).eq("id", memberId).select("id"));
  return signedInClient(email);
}

/** The statement's closing balance, built from exactly the readers the page uses. */
async function ledgerClosing(c: Client, asOf: string) {
  const dues = ok(await c.rpc("own_statement_dues", { p_org: fx.orgId, p_as_of: asOf }));
  const receipts = ok(await c.rpc("own_statement_receipts", { p_org: fx.orgId }));
  const settlements = ok(await c.rpc("own_due_settlement_lines", { p_org: fx.orgId }));
  const mv: LedgerMovement[] = [
    ...dues.map((d) => ({ id: `d-${d.due_id}`, date: d.issue_date, kind: "CHARGE" as const, amount: Number(d.amount) })),
    ...receipts.flatMap((r) => [
      { id: `p-${r.payment_id}`, date: r.payment_date, kind: "PAYMENT" as const, amount: Number(r.amount) },
      ...(r.reversed_on ? [{ id: `pr-${r.payment_id}`, date: r.reversed_on, kind: "PAYMENT_REVERSAL" as const, amount: Number(r.amount) }] : []),
    ]),
    ...settlements.flatMap((s) => [
      { id: `s-${s.allocation_id}`, date: s.applied_on, kind: "SETTLEMENT" as const, amount: Number(s.amount) },
      ...(s.reversed_on ? [{ id: `sr-${s.allocation_id}`, date: s.reversed_on, kind: "SETTLEMENT_REVERSAL" as const, amount: Number(s.amount) }] : []),
    ]),
  ];
  return buildLedger(mv, "", asOf).closingBalance;
}
async function net(c: Client, m: { id: string; name: string }, asOf: string) {
  member.current = { id: m.id, full_name: m.name, organization_id: fx.orgId };
  as(c);
  const r = await getOwnPositionAsOfAction(asOf);
  expect(r.ok).toBe(true);
  return r.ok ? r.position : (null as never);
}
const snapshot = () =>
  `${q(`select count(*) from public.payments where organization_id='${fx.orgId}'`)}/${q(`select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}'`)}/${q(`select count(*) from public.journal_entries where organization_id='${fx.orgId}'`)}/${q(`select count(*) from public.payment_credit_requests where organization_id='${fx.orgId}'`)}`;

beforeAll(async () => {
  fx = await createJourneyFixture("legacy");
  other = await createJourneyFixture("legacy-other");
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  memberM = fx.member.id;
  mSession = await linkUser(fx, memberM, "memberM");
  otherMember = await linkUser(other, other.member.id, "memberOther");
  const admin = adminClient();
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  ok(await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 2000, p_issue_date: "2026-02-01", p_due_date: "2026-02-15", p_description: "D1" }));
  d1 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='D1'`);

  // the legacy receipt, laid down the way an import would: a payment row, its own posted entry, a partial allocation
  leg = randomUUID();
  const period = q(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date<='2026-03-10' and end_date>='2026-03-10' limit 1`);
  ok(await admin.from("payments").insert({ id: leg, organization_id: fx.orgId, property_id: fx.propertyId, member_id: memberM, unit_id: fx.unit.id, amount: 1000, unallocated_amount: 400, advance_amount: 0, method: "CASH", payment_date: "2026-03-10", status: "POSTED", receipt_no: "LEG-1", deposit_account_id: fx.accounts["1110"] }).select("id"));
  const entry = ok(await admin.from("journal_entries").insert({ organization_id: fx.orgId, property_id: fx.propertyId, fiscal_period_id: period, entry_date: "2026-03-10", description: "legacy receipt LEG-1", source_type: "RECEIPT_VOUCHER", status: "POSTED" }).select("id").single()) as { id: string };
  ok(await admin.from("journal_entry_lines").insert([
    { journal_entry_id: entry.id, line_number: 1, account_id: fx.accounts["1110"], debit: 1000, credit: 0 },
    { journal_entry_id: entry.id, line_number: 2, account_id: fx.accounts["1130"], debit: 0, credit: 600 },
    { journal_entry_id: entry.id, line_number: 3, account_id: fx.accounts["2200"], debit: 0, credit: 400 },
  ]).select("id"));
  ok(await admin.from("payments").update({ journal_entry_id: entry.id }).eq("id", leg).select("id"));
  ok(await admin.from("payment_allocations").insert({ payment_id: leg, due_id: d1, amount: 600 }).select("id"));

  // 20 Mar: M leaves, N takes over
  memberN = randomUUID();
  ok(await admin.from("unit_ownerships").update({ end_date: "2026-03-20" }).eq("unit_id", fx.unit.id).eq("member_id", memberM).select("id"));
  ok(await admin.from("members").insert({ id: memberN, organization_id: fx.orgId, full_name: "Nora Newowner", phone: "+201000000997" }).select("id"));
  ok(await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: fx.unit.id, member_id: memberN, share_percentage: 100, is_primary_contact: true, start_date: "2026-03-21" }).select("id"));
  nSession = await linkUser(fx, memberN, "memberN");
}, 600_000);

const M = () => ({ id: memberM, name: fx.member.name });
const N = () => ({ id: memberN, name: "Nora Newowner" });

describe("the old meaning is kept: not an advance, not credit, not applicable", () => {
  it("advance_amount stays 0 and unallocated_amount stays 400; the books are the original three lines, none on the advance account", () => {
    expect(q(`select advance_amount::numeric(19,2)||'/'||unallocated_amount::numeric(19,2) from public.payments where id='${leg}'`)).toBe("0.00/400.00");
    expect(q(`select string_agg(a.code||':'||l.debit::numeric(19,2)||'/'||l.credit::numeric(19,2), ' | ' order by a.code, l.debit desc) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id join public.payments p on p.journal_entry_id=l.journal_entry_id where p.id='${leg}'`)).toBe("1110:1000.00/0.00 | 1130:0.00/600.00 | 2200:0.00/400.00");
    expect(q(`select count(*) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and a.code='2250'`)).toBe("0");
  });

  it("it is not a credit balance anywhere: no row in the balances view, none in the as-of function, no credit card figure", async () => {
    expect(q(`select count(*) from public.payment_credit_balances where payment_id='${leg}'`)).toBe("0");
    const asOf = ok(await owner.rpc("payment_credit_balances_as_of", { p_org: fx.orgId, p_as_of: "2026-12-31" }));
    expect(asOf.filter((r) => r.payment_id === leg)).toHaveLength(0);
    const p = await net(mSession, M(), "2026-12-31");
    expect(p.credit).toEqual({ received: 0, applied: 0, remaining: 0 });
  });

  it("the new apply authority is refused for it, by the owner with allocations.manage too, and nothing changes", async () => {
    const before = snapshot();
    const refused = await owner.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: leg, p_allocations: [{ due_id: d1, amount: 100 }], p_application_date: "2026-03-25", p_fiscal_period_id: q(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date<='2026-03-25' and end_date>='2026-03-25' limit 1`), p_idempotency_key: randomUUID() });
    expect(refused.error?.message ?? "").toContain("NOT_AN_ADVANCE_RECEIPT");
    expect(snapshot()).toBe(before);
  });
});

describe("statement = position, before and after the void, for both members (the 400 stays M's)", () => {
  it("M, as of dates before the void: net 2,000 → 1,000, equal to the ledger, with the 400 shown as legacy and credit 0", async () => {
    for (const [date, want] of [["2026-02-20", 2000], ["2026-03-09", 2000], ["2026-03-10", 1000], ["2026-03-31", 1000]] as const) {
      const p = await net(mSession, M(), date);
      expect(p.net, `M net ${date}`).toBe(want);
      expect(await ledgerClosing(mSession, date), `M ledger ${date}`).toBe(want);
      expect(p.credit.remaining).toBe(0);
    }
    const p = await net(mSession, M(), "2026-03-31");
    expect(p).toMatchObject({ outstanding: 1400, legacyUnallocated: 400, net: 1000 });
  });

  it("N, who owns the unit now, sees only what settled D1 (600), none of the legacy remainder: net = ledger = 1,400", async () => {
    const p = await net(nSession, N(), "2026-03-31");
    expect(p).toMatchObject({ outstanding: 1400, legacyUnallocated: 0, credit: { remaining: 0 }, net: 1400 });
    expect(await ledgerClosing(nSession, "2026-03-31")).toBe(1400);
    const settlements = ok(await nSession.rpc("own_due_settlement_lines", { p_org: fx.orgId }));
    expect(settlements).toHaveLength(1);
    expect(Number(settlements[0].amount)).toBe(600); // the allocated part only: neither the receipt total nor the unallocated 400
    expect(ok(await nSession.from("payments").select("id").eq("id", leg))).toHaveLength(0);
    expect(ok(await nSession.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
  });

  it("the void: reversal dated at the real entry; before it both statements still count the receipt, from it they do not", async () => {
    const v = await accountant.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: leg, p_reason: "legacy receipt cancelled", p_ip_address: null, p_user_agent: null });
    expect(v.error, v.error?.message).toBeNull();
    voidDate = q(`select je.entry_date::text from public.payments p join public.journal_entries je on je.id = p.reversal_journal_entry_id where p.id='${leg}'`);
    const dayBefore = new Date(Date.parse(`${voidDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

    const mBefore = await net(mSession, M(), dayBefore);
    expect(mBefore).toMatchObject({ outstanding: 1400, legacyUnallocated: 400, net: 1000 });
    expect(await ledgerClosing(mSession, dayBefore)).toBe(1000);
    const mAfter = await net(mSession, M(), voidDate);
    expect(mAfter).toMatchObject({ outstanding: 2000, legacyUnallocated: 0, net: 2000 });
    expect(await ledgerClosing(mSession, voidDate)).toBe(2000);

    const nBefore = await net(nSession, N(), dayBefore);
    expect(nBefore.net).toBe(1400);
    expect(await ledgerClosing(nSession, dayBefore)).toBe(1400);
    const nAfter = await net(nSession, N(), voidDate);
    expect(nAfter.net).toBe(2000);
    expect(await ledgerClosing(nSession, voidDate)).toBe(2000);
  });

  it("after the void the receipt is still not credit and still carries its original meaning in the books (the reversal mirrors the three lines)", () => {
    expect(q(`select advance_amount::numeric(19,2)||'/'||status from public.payments where id='${leg}'`)).toBe("0.00/REVERSED");
    expect(Number(q(`select coalesce(sum(l.credit - l.debit),0) from public.journal_entry_lines l join public.chart_of_accounts a on a.id=l.account_id join public.journal_entries j on j.id=l.journal_entry_id where j.organization_id='${fx.orgId}' and a.code='2200'`))).toBe(0);
    expect(q(`select count(*) from public.payment_credit_balances where payment_id='${leg}'`)).toBe("0");
  });
});

describe("isolation", () => {
  it("staff, another organization's member and a foreign organization id read nothing of the legacy receipt", async () => {
    expect(ok(await owner.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherMember.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherMember.rpc("own_due_settlement_lines", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherMember.rpc("own_statement_dues", { p_org: fx.orgId, p_as_of: "2026-12-31" }))).toHaveLength(0);
    expect(ok(await nSession.rpc("own_statement_receipts", { p_org: other.orgId }))).toHaveLength(0);
    // the as-of allocations function, used by the position, scopes the owner to their own receipts
    const mine = ok(await nSession.rpc("payment_allocations_as_of", { p_org: fx.orgId, p_as_of: "2026-12-31" }));
    expect(mine.filter((a) => a.payment_id === leg)).toHaveLength(0);
  });
});
