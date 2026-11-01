import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, revalidatePath } = vi.hoisted(() => ({ createClient: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  applyPaymentCreditAction,
  recordAdvancePaymentAction,
  reverseCreditApplicationAction,
  setCustomerAdvanceAccountAction,
} from "@/lib/actions/customer-advances";
import { adminClient, createJourneyFixture, PASSWORD, signedInClient, type JourneyFixture } from "./e2e/helpers/accounting-fixture";
import { sql } from "./helpers/gate-release";

/**
 * The server actions against the real database with REAL USER SESSIONS (the mocked createClient hands the action the signed-in
 * user's client, exactly what lib/supabase/server does from cookies). Because the actions run as that user, the permission
 * checks inside the functions apply: a cashier or auditor is refused although the action code is the same.
 */
const q = (query: string) => sql(query);
type Client = Awaited<ReturnType<typeof signedInClient>>;
let fx: JourneyFixture;
let owner: Client, accountant: Client, cashier: Client, auditor: Client;
let D1 = "", D2 = "";
const as = (c: Client) => createClient.mockResolvedValue(c as never);
const rows = (table: string) => Number(q(`select count(*) from public.${table} p where p.organization_id='${fx.orgId}'`));
const snap = () =>
  `${rows("payments")}/${rows("journal_entries")}/${rows("payment_credit_requests")}/` +
  q(`select count(*) from public.payment_allocations pa join public.payments p on p.id=pa.payment_id where p.organization_id='${fx.orgId}'`);
const periodOf = (date: string, orgId = fx.orgId) =>
  q(`select id from public.fiscal_periods where organization_id='${orgId}' and start_date<='${date}' and end_date>='${date}' limit 1`);

const advance = (over: Record<string, unknown> = {}) => ({
  organizationId: fx.orgId, resortId: fx.propertyId, memberId: fx.member.id, unitId: fx.unit.id, amount: 1500, method: "CASH", paymentDate: "2026-08-12",
  depositAccountId: fx.accounts["1110"], fiscalPeriodId: periodOf("2026-08-12"), allocations: [], operationKey: randomUUID(), ...over,
});

beforeAll(async () => {
  fx = await createJourneyFixture("adv-actions");
  const admin = adminClient();
  owner = await signedInClient(fx.owner.email);
  accountant = await signedInClient(fx.accountant.email);
  auditor = await signedInClient(fx.auditor.email);
  const email = `cashier-${fx.tag}@demo.local`;
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const roleId = (await admin.from("roles").select("id").eq("organization_id", fx.orgId).eq("key", "CASHIER").single()).data!.id as string;
  await admin.from("organization_memberships").insert({ organization_id: fx.orgId, user_id: created.data.user!.id, status: "active" });
  await admin.from("user_role_assignments").insert({ user_id: created.data.user!.id, role_id: roleId, organization_id: fx.orgId });
  cashier = await signedInClient(email);
  const typeId = q(`select id from public.due_types where organization_id='${fx.orgId}' limit 1`);
  for (const [label, amount, date] of [["A1", 2000, "2026-08-01"], ["A2", 800, "2026-09-01"]] as const) {
    const r = await owner.rpc("issue_dues", { p_organization_id: fx.orgId, p_resort_id: fx.propertyId, p_unit_ids: [fx.unit.id], p_due_type_id: typeId, p_receivable_account_id: fx.accounts["1130"], p_amount: amount, p_issue_date: date, p_due_date: date, p_description: label });
    expect(r.error, r.error?.message).toBeNull();
  }
  D1 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='A1'`);
  D2 = q(`select id from public.dues where organization_id='${fx.orgId}' and description='A2'`);
}, 600_000);

beforeEach(() => {
  revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe.sequential("account approval through the action", () => {
  it("without an approved account the action reports it and creates nothing", async () => {
    as(accountant);
    const before = snap();
    expect(await recordAdvancePaymentAction(advance({ amount: 100 }))).toEqual({ ok: false, error: "ADVANCE_ACCOUNT_NOT_CONFIGURED" });
    expect(snap()).toBe(before);
  });
  it("a cashier is refused by the database (the action runs as the cashier); the owner approves; a non-liability account is refused", async () => {
    as(cashier);
    expect(await setCustomerAdvanceAccountAction({ organizationId: fx.orgId, resortId: fx.propertyId, accountId: fx.accounts["2250"] })).toEqual({ ok: false, error: "FORBIDDEN_FINANCE_PERMISSION" });
    as(owner);
    expect(await setCustomerAdvanceAccountAction({ organizationId: fx.orgId, resortId: fx.propertyId, accountId: fx.accounts["1110"] })).toEqual({ ok: false, error: "CUSTOMER_ADVANCE_ACCOUNT_INVALID" });
    expect(await setCustomerAdvanceAccountAction({ organizationId: fx.orgId, resortId: fx.propertyId, accountId: fx.accounts["2250"] })).toEqual({ ok: true });
  });
});

describe.sequential("record -> retry -> new operation", () => {
  let R1 = "";
  const key = randomUUID();
  it("R1 3,000 (2,000 to D1): ok; the response is lost and the UI retries with the SAME key: replay, same receipt, no second entry", async () => {
    as(accountant);
    const input = advance({ amount: 3000, allocations: [{ dueId: D1, amount: 2000 }], paymentDate: "2026-08-10", fiscalPeriodId: periodOf("2026-08-10"), operationKey: key });
    const first = await recordAdvancePaymentAction(input);
    expect(first).toMatchObject({ ok: true, data: { allocatedAmount: 2000, advanceAmount: 1000, replay: false } });
    R1 = (first as { data: { paymentId: string } }).data.paymentId;
    const before = snap();
    const retry = await recordAdvancePaymentAction(input);
    expect(retry).toMatchObject({ ok: true, data: { paymentId: R1, replay: true } });
    expect(snap()).toBe(before);
    expect(q(`select count(*) from public.payments where organization_id='${fx.orgId}' and idempotency_key='${key}'`)).toBe("1");
  });
  it("the same key with different content is refused and changes nothing; a NEW key is a new, second operation", async () => {
    as(accountant);
    const before = snap();
    expect(await recordAdvancePaymentAction(advance({ amount: 3001, allocations: [{ dueId: D1, amount: 2000 }], paymentDate: "2026-08-10", fiscalPeriodId: periodOf("2026-08-10"), operationKey: key }))).toEqual({ ok: false, error: "IDEMPOTENCY_KEY_REUSED" });
    expect(snap()).toBe(before);
    const second = await recordAdvancePaymentAction(advance({ amount: 1500, operationKey: randomUUID() }));
    expect(second).toMatchObject({ ok: true, data: { allocatedAmount: 0, advanceAmount: 1500, replay: false } });
    expect(rows("payments")).toBe(2);
  });
  it("an auditor session is refused by the database, a cashier session is allowed to record; invalid input never reaches the database", async () => {
    as(auditor);
    const before = snap();
    expect(await recordAdvancePaymentAction(advance({ amount: 10 }))).toEqual({ ok: false, error: "FORBIDDEN_FINANCE_PERMISSION" });
    expect(snap()).toBe(before);
    as(cashier);
    expect(await recordAdvancePaymentAction(advance({ amount: 20, paymentDate: "2026-08-13", fiscalPeriodId: periodOf("2026-08-13") }))).toMatchObject({ ok: true });
    createClient.mockClear();
    expect(await recordAdvancePaymentAction(advance({ amount: -1 }))).toEqual({ ok: false, error: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
    expect(rows("payments")).toBe(3);
  });

  describe.sequential("apply and reverse through the actions", () => {
    let allocationId = "";
    const applyKey = randomUUID();
    it("apply 600 to D2: ok; retry with the same key is a replay; a cashier is refused; an over-remaining request and a reused key are refused", async () => {
      as(accountant);
      const input = { organizationId: fx.orgId, paymentId: R1, allocations: [{ dueId: D2, amount: 600 }], applicationDate: "2026-09-05", fiscalPeriodId: periodOf("2026-09-05"), operationKey: applyKey };
      const first = await applyPaymentCreditAction(input);
      expect(first).toMatchObject({ ok: true, data: { appliedTotal: 600, remaining: 400, replay: false } });
      allocationId = (first as { data: { allocationIds: string[] } }).data.allocationIds[0];
      const before = snap();
      expect(await applyPaymentCreditAction(input)).toMatchObject({ ok: true, data: { appliedTotal: 600, replay: true } });
      expect(snap()).toBe(before);
      as(cashier);
      expect(await applyPaymentCreditAction({ ...input, operationKey: randomUUID() })).toEqual({ ok: false, error: "FORBIDDEN_FINANCE_PERMISSION" });
      as(accountant);
      expect(await applyPaymentCreditAction({ ...input, allocations: [{ dueId: D2, amount: 300 }], operationKey: randomUUID() })).toEqual({ ok: false, error: "ALLOCATION_EXCEEDS_REMAINING" });
      expect(await applyPaymentCreditAction({ ...input, operationKey: applyKey, applicationDate: "2026-09-06", fiscalPeriodId: periodOf("2026-09-06") })).toEqual({ ok: false, error: "IDEMPOTENCY_KEY_REUSED" });
    });
    it("reverse it with a reason: ok and the credit is back; the retry is a replay; reversing again with a new key says it is already reversed", async () => {
      as(accountant);
      const input = { organizationId: fx.orgId, allocationId, reason: "applied to the wrong due", reversalDate: "2026-09-09", fiscalPeriodId: periodOf("2026-09-09"), operationKey: randomUUID() };
      expect(await reverseCreditApplicationAction(input)).toMatchObject({ ok: true, data: { remaining: 1000, replay: false } });
      expect(await reverseCreditApplicationAction(input)).toMatchObject({ ok: true, data: { remaining: 1000, replay: true } });
      expect(await reverseCreditApplicationAction({ ...input, operationKey: randomUUID() })).toEqual({ ok: false, error: "ALREADY_REVERSED" });
      expect(q(`select unallocated_amount::text from public.payments where id='${R1}'`)).toBe("1000.0000");
      expect(q(`select count(*) from public.payment_credit_requests where organization_id='${fx.orgId}'`)).toBe("5"); // 3 records + 1 apply + 1 reverse: ONE registry for all three operations (migration C); replays stored nothing new
    });
    it("a reversal needs a reason (validation) and nothing is revalidated on a rejection", async () => {
      as(accountant);
      revalidatePath.mockClear();
      expect(await reverseCreditApplicationAction({ organizationId: fx.orgId, allocationId, reason: "  ", reversalDate: "2026-09-09", fiscalPeriodId: periodOf("2026-09-09"), operationKey: randomUUID() })).toEqual({ ok: false, error: "invalid_input" });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
