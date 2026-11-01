import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { createClient, member } = vi.hoisted(() => ({ createClient: vi.fn(), member: { current: null as unknown } }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/portal-member", () => ({ getPortalMemberContext: async () => ({ status: "ok", member: member.current }) }));

import { getOwnPositionAsOfAction } from "@/lib/actions/member-portal-receipts";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * Migration 20261017100700 on the isolated stack, real user sessions.
 * D1 = 2,000 issued 1 Aug; receipt R1 = 3,000 by member M on 10 Aug (2,000 settles D1, 1,000 is advance credit); on 20 Aug M's ownership
 * ends and N takes the unit; D2 = 800 is issued on 1 Sep. N sees the unit's dues but, by RLS, none of M's receipts: before this
 * migration D1 looked UNPAID to N (2,000 + 800 = 2,800 of "arrears"). The real remaining comes from the settlement data.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
let fx: JourneyFixture, other: JourneyFixture;
let ownerSession: Client, mSession: Client, nSession: Client, otherMember: Client;
let memberM = "", memberN = "", d1 = "", d2 = "", r1 = "";
const periodAt = (d: string) => q(`select id from public.fiscal_periods where organization_id='${fx.orgId}' and start_date<='${d}' and end_date>='${d}' limit 1`);
const ok = <T,>(r: { data: T | null; error: { message: string } | null }) => {
  expect(r.error, r.error?.message).toBeNull();
  return r.data as T;
};
const as = (c: Client) => createClient.mockResolvedValue(c as never);
const dueRows = async (c: Client, asOf: string) => ok(await c.rpc("own_statement_dues", { p_org: fx.orgId, p_as_of: asOf }));

async function linkUser(f: JourneyFixture, memberId: string, label: string) {
  const email = `${label}-${f.tag}@demo.local`;
  const created = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  ok(await adminClient().from("members").update({ user_id: created.data.user!.id, email }).eq("id", memberId).select("id"));
  return signedInClient(email);
}

beforeAll(async () => {
  fx = await createJourneyFixture("stl");
  other = await createJourneyFixture("stl-other");
  ownerSession = await signedInClient(fx.owner.email);
  memberM = fx.member.id;
  mSession = await linkUser(fx, memberM, "memberM");
  otherMember = await linkUser(other, other.member.id, "memberOther");
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  const issue = async (amount: number, date: string, description: string) =>
    ok(await ownerSession.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: amount, p_issue_date: date, p_due_date: date, p_description: description }));
  await issue(2000, "2026-08-01", "D1");
  d1 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='D1'`);
  ok(await ownerSession.rpc("set_default_customer_advance_account", { p_organization_id: fx.orgId, p_property_id: fx.propertyId, p_account_id: fx.accounts["2250"] }));
  const rec = ok(await ownerSession.rpc("record_advance_payment", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_member_id: memberM, p_unit_id: fx.unit.id, p_amount: 3000, p_method: "CASH", p_payment_date: "2026-08-10", p_deposit_account_id: fx.accounts["1110"], p_fiscal_period_id: periodAt("2026-08-10"), p_allocations: [{ due_id: d1, amount: 2000 }], p_idempotency_key: randomUUID() })) as { payment_id: string };
  r1 = rec.payment_id;
  memberN = randomUUID();
  const admin = adminClient();
  ok(await admin.from("unit_ownerships").update({ end_date: "2026-08-20" }).eq("unit_id", fx.unit.id).eq("member_id", memberM).select("id"));
  ok(await admin.from("members").insert({ id: memberN, organization_id: fx.orgId, full_name: "Nora Newowner", phone: "+201000000998" }).select("id"));
  ok(await admin.from("unit_ownerships").insert({ organization_id: fx.orgId, unit_id: fx.unit.id, member_id: memberN, share_percentage: 100, is_primary_contact: true, start_date: "2026-08-21" }).select("id"));
  await issue(800, "2026-09-01", "D2");
  d2 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='D2'`);
  nSession = await linkUser(fx, memberN, "memberN");
}, 600_000);

describe("the new owner N", () => {
  it("sees D1 and D2, and D1's settled amount is the 2,000 that a previous owner's receipt paid (an amount, nothing else)", async () => {
    const rows = await dueRows(nSession, "2026-12-31");
    const byId = new Map(rows.map((r) => [r.due_id, r]));
    expect([...byId.keys()].sort()).toEqual([d1, d2].sort());
    expect(Number(byId.get(d1)!.settled_amount)).toBe(2000);
    expect(Number(byId.get(d2)!.settled_amount)).toBe(0);
    // no receipt, payer or credit information in what is returned
    expect(Object.keys(rows[0]).sort()).toEqual(["amount", "description", "due_date", "due_id", "issue_date", "settled_amount", "status", "unit_code", "unit_id"]);
  });

  it("the remaining is proved independently from the settlement data: 2,000 − 2,000 = 0 for D1 and 800 for D2, so arrears are 800, not 2,800", async () => {
    const independent = Number(q(`select coalesce(sum(d.amount - coalesce((select sum(e.amount) from public.effective_payment_allocations e where e.due_id = d.id), 0)), 0) from public.dues d where d.organization_id='${fx.orgId}' and d.unit_id='${fx.unit.id}'`));
    expect(independent).toBe(800);
    member.current = { id: memberN, full_name: "Nora Newowner", organization_id: fx.orgId };
    as(nSession);
    const p = await getOwnPositionAsOfAction("2026-12-31");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.position).toMatchObject({ outstanding: independent, arrears: independent, net: independent, credit: { received: 0, remaining: 0 } });
  });

  it("D1's settlement is a dated line with no receipt behind it; the previous owner's receipt, allocations and credit stay invisible", async () => {
    const lines = ok(await nSession.rpc("own_due_settlement_lines", { p_org: fx.orgId }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ due_id: d1, amount: 2000, applied_on: "2026-08-10", reversed_on: null });
    expect(Object.keys(lines[0]).sort()).toEqual(["allocation_id", "amount", "applied_on", "due_id", "reversed_on"]);
    expect(ok(await nSession.from("payments").select("id").eq("id", r1))).toHaveLength(0);
    expect(ok(await nSession.from("payment_allocations").select("id").eq("payment_id", r1))).toHaveLength(0);
    expect(ok(await nSession.rpc("own_statement_receipts", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await nSession.rpc("own_credit_application_lines", { p_org: fx.orgId }))).toHaveLength(0);
  });

  it("is dated: before the receipt (9 Aug) D1 is still unsettled, on 10 Aug it is settled", async () => {
    const at = async (d: string) => Number((await dueRows(nSession, d)).find((r) => r.due_id === d1)!.settled_amount);
    expect(await at("2026-08-09")).toBe(0);
    expect(await at("2026-08-10")).toBe(2000);
  });

  it("the function never hides a due that owner RLS already shows", async () => {
    const visible = ok(await nSession.from("dues").select("id")).map((r) => r.id as string);
    const listed = (await dueRows(nSession, "2026-12-31")).map((r) => r.due_id);
    for (const id of visible) expect(listed).toContain(id);
  });
});

describe("the original member M", () => {
  it("keeps D1 (charged while M owned the unit and settled by M's own receipt) and does not get D2 (issued after M left)", async () => {
    const rows = await dueRows(mSession, "2026-12-31");
    expect(rows.map((r) => r.due_id)).toEqual([d1]);
    expect(Number(rows[0].settled_amount)).toBe(2000);
    // owner RLS shows M none of the unit's dues any more: that is the gap the history route fills
    expect(ok(await mSession.from("dues").select("id"))).toHaveLength(0);
    expect(ok(await mSession.rpc("own_due_settlement_lines", { p_org: fx.orgId }))).toHaveLength(0);
  });

  it("net, ledger and credit agree after the transfer: outstanding 0 − credit 1,000 = −1,000 (= D1 2,000 − receipt 3,000)", async () => {
    member.current = { id: memberM, full_name: fx.member.name, organization_id: fx.orgId };
    as(mSession);
    const p = await getOwnPositionAsOfAction("2026-12-31");
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.position).toMatchObject({ outstanding: 0, arrears: 0, net: -1000, credit: { received: 1000, remaining: 1000 } });
    const receipts = ok(await mSession.rpc("own_statement_receipts", { p_org: fx.orgId }));
    const ledgerClosing = (await dueRows(mSession, "2026-12-31")).reduce((s, d) => s + Number(d.amount), 0) - receipts.reduce((s, r) => s + Number(r.amount), 0);
    expect(ledgerClosing).toBe(-1000);
  });
});

describe("isolation", () => {
  it("staff, another organization's member and a foreign organization id get nothing; anon is refused", async () => {
    expect(await dueRows(ownerSession, "2026-12-31")).toHaveLength(0);
    expect(ok(await ownerSession.rpc("own_due_settlement_lines", { p_org: fx.orgId }))).toHaveLength(0);
    expect(await dueRows(otherMember, "2026-12-31")).toHaveLength(0);
    expect(ok(await otherMember.rpc("own_due_settlement_lines", { p_org: fx.orgId }))).toHaveLength(0);
    expect(ok(await nSession.rpc("own_statement_dues", { p_org: other.orgId, p_as_of: "2026-12-31" }))).toHaveLength(0);
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/own_statement_dues`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
      body: JSON.stringify({ p_org: fx.orgId, p_as_of: "2026-12-31" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
