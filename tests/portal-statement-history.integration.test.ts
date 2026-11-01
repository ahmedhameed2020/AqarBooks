import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { createClient, member } = vi.hoisted(() => ({ createClient: vi.fn(), member: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/portal-member", () => ({
  getPortalMemberContext: async () => ({ status: "ok", member: member.current }),
}));

import { getOwnPaymentReceiptAction, getOwnPositionAsOfAction } from "@/lib/actions/member-portal-receipts";
import { receiptAllocatedTotal } from "@/lib/reports/payment-receipt-pdf";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Owner statement history (migration 20261017100500) and the owner's receipt document, on the isolated stack with real user sessions.
 * Scenario: due 600 (09-01); advance 1000 (09-05); 400 applied (09-08) and reversed (09-10); the receipt is then voided (reversal
 * entry dated by the database). Owner RLS only exposes POSTED receipts, so the history must come from the two owner-scoped readers.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
let fx: JourneyFixture, other: JourneyFixture;
let ownerSession: Client, accountant: Client, memberSession: Client, otherMemberSession: Client, otherStaff: Client;
let paymentId = "", memberId = "", applicationId = "", voidEntryDate = "";
const periodAt = (d: string, org = fx.orgId) => q(`select id from public.fiscal_periods where organization_id='${org}' and start_date<='${d}' and end_date>='${d}' limit 1`);
const as = (c: Client) => createClient.mockResolvedValue(c as never);
const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => {
  expect(r.error, r.error?.message).toBeNull();
  return r.data as T;
};

async function memberUser(f: JourneyFixture, label: string) {
  const email = `${label}-${f.tag}@demo.local`;
  const created = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  ok(await adminClient().from("members").update({ user_id: created.data.user!.id, email }).eq("id", f.member.id).select("id"));
  return signedInClient(email);
}

beforeAll(async () => {
  fx = await createJourneyFixture("stmt-hist");
  other = await createJourneyFixture("stmt-hist-other");
  ownerSession = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  otherStaff = await signedInClient(other.owner.email);
  memberSession = await memberUser(fx, "member");
  otherMemberSession = await memberUser(other, "member");
  memberId = fx.member.id;
  member.current = { id: fx.member.id, full_name: fx.member.name, organization_id: fx.orgId };

  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  ok(await ownerSession.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: 600, p_issue_date: "2026-09-01", p_due_date: "2026-09-15", p_description: "H1" }));
  const dueId = q(`select id from public.dues where organization_id='${fx.orgId}' and description='H1'`);
  ok(await ownerSession.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2200"] }));
  const rec = ok(await ownerSession.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: memberId, p_unit_id: fx.unit.id, p_amount: 1000, p_method: "CASH", p_payment_date: "2026-09-05", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodAt("2026-09-05"), p_allocations: [], p_idempotency_key: randomUUID() })) as { payment_id: string };
  paymentId = rec.payment_id;
  ok(await ownerSession.rpc("apply_payment_credit", { p_organization_id: fx.orgId, p_payment_id: paymentId, p_allocations: [{ due_id: dueId, amount: 400 }], p_application_date: "2026-09-08", p_fiscal_period_id: periodAt("2026-09-08"), p_idempotency_key: randomUUID() }));
  applicationId = q(`select id from public.payment_allocations where payment_id='${paymentId}' and kind='CREDIT_APPLICATION'`);
}, 600_000);

describe("the owner's receipt document (print) after an application and its reversal", () => {
  it("while the application is in force: it is listed, flagged as advance credit, and counted", async () => {
    as(memberSession);
    const r = await getOwnPaymentReceiptAction(paymentId, "en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.details.advanceAmount).toBe(1000);
    expect(r.details.allocations).toHaveLength(1);
    expect(r.details.allocations[0]).toMatchObject({ allocatedAmount: 400, credit: true, appliedOn: "2026-09-08" });
    expect(r.details.allocations[0].reversedOn).toBeUndefined();
    expect(receiptAllocatedTotal(r.details.allocations)).toBe(400);
  });

  it("after the reversal: the reversed line is shown for history with its date and is NOT in the total", async () => {
    ok(await ownerSession.rpc("reverse_credit_application", { p_organization_id: fx.orgId, p_allocation_id: applicationId, p_reason: "wrong due", p_reversal_date: "2026-09-10", p_fiscal_period_id: periodAt("2026-09-10"), p_idempotency_key: randomUUID() }));
    as(memberSession);
    const r = await getOwnPaymentReceiptAction(paymentId, "en");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inForce = r.details.allocations.filter((a) => !a.reversedOn);
    const reversed = r.details.allocations.filter((a) => a.reversedOn);
    expect(inForce).toHaveLength(0);
    expect(reversed).toHaveLength(1);
    expect(reversed[0]).toMatchObject({ allocatedAmount: 400, reversedOn: "2026-09-10" });
    expect(receiptAllocatedTotal(r.details.allocations)).toBe(0);
  });

  it("another owner cannot print this receipt", async () => {
    as(otherMemberSession);
    member.current = { id: other.member.id, full_name: other.member.name, organization_id: other.orgId };
    const r = await getOwnPaymentReceiptAction(paymentId, "en");
    member.current = { id: fx.member.id, full_name: fx.member.name, organization_id: fx.orgId };
    expect(r.ok).toBe(false);
  });
});

describe("statement history readers (owner-scoped, history-bounded)", () => {
  it("before the void: the receipt is a POSTED row with no reversal date", async () => {
    const r = ok(await memberSession.rpc("own_statement_receipts", { p_org: fx.orgId }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ payment_id: paymentId, status: "POSTED", reversed_on: null, payment_date: "2026-09-05", amount: 1000, advance_amount: 1000 });
  });

  it("after the void: the owner still sees the receipt, REVERSED, dated at the actual reversal entry", async () => {
    const v = await accountant.rpc("void_payment", { p_organization_id: fx.orgId, p_payment_id: paymentId, p_reason: "customer cancelled", p_ip_address: null, p_user_agent: null });
    expect(v.error, v.error?.message).toBeNull();
    voidEntryDate = q(`select je.entry_date from public.payments p join public.journal_entries je on je.id = p.reversal_journal_entry_id where p.id='${paymentId}'`);
    const r = ok(await memberSession.rpc("own_statement_receipts", { p_org: fx.orgId }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ payment_id: paymentId, status: "REVERSED", reversed_on: voidEntryDate, payment_date: "2026-09-05" });
    // the owner's plain RLS read no longer shows it: that is exactly why the reader exists
    const plain = ok(await memberSession.from("payments").select("id").eq("id", paymentId));
    expect(plain).toHaveLength(0);
    const apps = ok(await memberSession.rpc("own_credit_application_lines", { p_org: fx.orgId }));
    expect(apps).toHaveLength(1);
    expect(apps[0]).toMatchObject({ allocation_id: applicationId, amount: 400, applied_on: "2026-09-08", reversed_on: "2026-09-10" });
  });

  it("isolation: staff of the organization, another organization's owner and another organization's id get nothing; anon is refused", async () => {
    expect(ok(await ownerSession.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await ownerSession.rpc("own_credit_application_lines", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherMemberSession.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherMemberSession.rpc("own_credit_application_lines", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await otherStaff.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    // the owner passing someone else's organization id
    expect(ok(await memberSession.rpc("own_statement_receipts", { p_org: other.orgId }))).toHaveLength(0);
    const anon = adminClient();
    void anon;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const res = await fetch(`${url}/rest/v1/rpc/own_statement_receipts`, { method: "POST", headers: { "content-type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` }, body: JSON.stringify({ p_org: fx.orgId }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("the position as of a date before the void still counts the receipt; after it, it does not (net 600 again)", async () => {
    as(memberSession);
    const before = await getOwnPositionAsOfAction("2026-09-11");
    const after = await getOwnPositionAsOfAction(voidEntryDate);
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(before.position).toMatchObject({ outstanding: 600, net: -400, credit: { remaining: 1000 } });
    expect(after.position).toMatchObject({ outstanding: 600, net: 600, credit: { remaining: 0 } });
  });
});
