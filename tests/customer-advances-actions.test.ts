import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath, createClient } = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, revalidatePath: vi.fn(), createClient: vi.fn(async () => ({ rpc })) };
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  applyPaymentCreditAction,
  recordAdvancePaymentAction,
  reverseCreditApplicationAction,
  setCustomerAdvanceAccountAction,
} from "@/lib/actions/customer-advances";
import { ADVANCE_ERROR_CODES, ADVANCE_MESSAGE_KEYS, advanceErrorCode, advanceErrorMessage } from "@/lib/finance/customer-advances";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KEY = u(900);
const record = { organizationId: u(1), resortId: u(2), memberId: u(3), unitId: u(4), amount: 1500, method: "CASH", paymentDate: "2026-08-12", depositAccountId: u(5), fiscalPeriodId: u(6), allocations: [], operationKey: KEY };
const apply = { organizationId: u(1), paymentId: u(7), allocations: [{ dueId: u(8), amount: 600 }], applicationDate: "2026-09-05", fiscalPeriodId: u(6), operationKey: KEY };
const reverse = { organizationId: u(1), allocationId: u(9), reason: "wrong due", reversalDate: "2026-09-09", fiscalPeriodId: u(6), operationKey: KEY };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("input validation: nothing reaches the database on bad input", () => {
  const bad: [string, () => Promise<unknown>][] = [
    ["record: amount 0", () => recordAdvancePaymentAction({ ...record, amount: 0 })],
    ["record: negative amount", () => recordAdvancePaymentAction({ ...record, amount: -5 })],
    ["record: 5 decimals", () => recordAdvancePaymentAction({ ...record, amount: 1.00001 })],
    ["record: NaN", () => recordAdvancePaymentAction({ ...record, amount: "abc" })],
    ["record: ONLINE method", () => recordAdvancePaymentAction({ ...record, method: "ONLINE" })],
    ["record: not a calendar date", () => recordAdvancePaymentAction({ ...record, paymentDate: "2026-02-30" })],
    ["record: wrong date format", () => recordAdvancePaymentAction({ ...record, paymentDate: "10/08/2026" })],
    ["record: member missing", () => recordAdvancePaymentAction({ ...record, memberId: undefined })],
    ["record: unit not a uuid", () => recordAdvancePaymentAction({ ...record, unitId: "A-101" })],
    ["record: duplicate due", () => recordAdvancePaymentAction({ ...record, allocations: [{ dueId: u(8), amount: 1 }, { dueId: u(8), amount: 2 }] })],
    ["record: no operation key", () => recordAdvancePaymentAction({ ...record, operationKey: undefined })],
    ["record: operation key not a uuid", () => recordAdvancePaymentAction({ ...record, operationKey: "retry-1" })],
    ["apply: no allocations", () => applyPaymentCreditAction({ ...apply, allocations: [] })],
    ["apply: duplicate due", () => applyPaymentCreditAction({ ...apply, allocations: [{ dueId: u(8), amount: 1 }, { dueId: u(8), amount: 1 }] })],
    ["apply: zero amount", () => applyPaymentCreditAction({ ...apply, allocations: [{ dueId: u(8), amount: 0 }] })],
    ["apply: no key", () => applyPaymentCreditAction({ ...apply, operationKey: "" })],
    ["reverse: blank reason", () => reverseCreditApplicationAction({ ...reverse, reason: "   " })],
    ["reverse: reason over 1000", () => reverseCreditApplicationAction({ ...reverse, reason: "x".repeat(1001) })],
    ["reverse: no key", () => reverseCreditApplicationAction({ ...reverse, operationKey: undefined })],
    ["setAccount: not a uuid", () => setCustomerAdvanceAccountAction({ organizationId: u(1), resortId: u(2), accountId: "2250" })],
    ["a non-object", () => applyPaymentCreditAction(null)],
  ];
  it.each(bad)("%s => invalid_input, no client, no rpc, no revalidation", async (_name, call) => {
    await expect(call()).resolves.toEqual({ ok: false, error: "invalid_input" });
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("trims the reason, accepts string numbers from a form, and accepts 4 decimals", async () => {
    rpc.mockResolvedValue({ data: { payment_id: u(70), allocated_amount: 0, advance_amount: 12.3456, replay: false }, error: null });
    const r = await recordAdvancePaymentAction({ ...record, amount: "12.3456" });
    expect(r.ok).toBe(true);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_amount: 12.3456 });
    rpc.mockResolvedValue({ data: { remaining: 1, reversal_journal_entry_id: u(71), replay: false }, error: null });
    await reverseCreditApplicationAction({ ...reverse, reason: "  spaced  " });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_reason: "spaced" });
  });
});

describe("the user's session and the arguments", () => {
  it("record: forwards every argument and the CALLER's operation key unchanged (snake_case, no extra keys)", async () => {
    rpc.mockResolvedValue({ data: { payment_id: u(70), allocated_amount: 2000, advance_amount: 1000, replay: false }, error: null });
    const r = await recordAdvancePaymentAction({ ...record, amount: 3000, allocations: [{ dueId: u(8), amount: 2000 }], cashierSessionId: u(11) });
    expect(r).toEqual({ ok: true, data: { paymentId: u(70), allocatedAmount: 2000, advanceAmount: 1000, replay: false } });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_advance_payment", {
      p_organization_id: u(1), p_resort_id: u(2), p_member_id: u(3), p_unit_id: u(4), p_amount: 3000, p_method: "CASH", p_payment_date: "2026-08-12",
      p_deposit_account_id: u(5), p_fiscal_period_id: u(6), p_allocations: [{ due_id: u(8), amount: 2000 }], p_idempotency_key: KEY, p_cashier_session_id: u(11),
    });
    expect(revalidatePath).toHaveBeenCalled();
  });
  it("apply and reverse forward their keys unchanged", async () => {
    rpc.mockResolvedValue({ data: { applied_total: 600, remaining: 400, allocations: [{ allocation_id: u(12) }], replay: false }, error: null });
    expect(await applyPaymentCreditAction(apply)).toEqual({ ok: true, data: { appliedTotal: 600, remaining: 400, allocationIds: [u(12)], replay: false } });
    expect(rpc).toHaveBeenLastCalledWith("apply_payment_credit", { p_organization_id: u(1), p_payment_id: u(7), p_allocations: [{ due_id: u(8), amount: 600 }], p_application_date: "2026-09-05", p_fiscal_period_id: u(6), p_idempotency_key: KEY });
    rpc.mockResolvedValue({ data: { remaining: 800, reversal_journal_entry_id: u(13), replay: false }, error: null });
    expect(await reverseCreditApplicationAction(reverse)).toEqual({ ok: true, data: { remaining: 800, reversalJournalEntryId: u(13), replay: false } });
    expect(rpc).toHaveBeenLastCalledWith("reverse_credit_application", { p_organization_id: u(1), p_allocation_id: u(9), p_reason: "wrong due", p_reversal_date: "2026-09-09", p_fiscal_period_id: u(6), p_idempotency_key: KEY });
  });
  it("the module uses only the session client: no service-role or admin client is imported", () => {
    const src = readFileSync("lib/actions/customer-advances.ts", "utf8");
    expect(src).toContain('from "@/lib/supabase/server"');
    expect(src).not.toMatch(/supabase\/admin|createAdminClient|SERVICE_ROLE|service_role|randomUUID|crypto\.randomUUID/);
  });
});

describe("idempotency key: the same retry keeps it, a new operation gets its own (the action never mints one)", () => {
  it("retrying the same request sends the SAME key every time; a different operation key is passed through as is", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } })
       .mockResolvedValue({ data: { applied_total: 600, remaining: 400, allocations: [], replay: true }, error: null });
    const first = await applyPaymentCreditAction(apply);               // the first attempt fails (timeout): the UI will retry the SAME operation
    expect(first).toEqual({ ok: false, error: "unexpected" });
    const retry = await applyPaymentCreditAction(apply);
    expect(retry.ok).toBe(true);
    const other = await applyPaymentCreditAction({ ...apply, operationKey: u(901) });  // a NEW operation, new key chosen by the caller
    expect(other.ok).toBe(true);
    const keys = rpc.mock.calls.map((c) => c[1].p_idempotency_key);
    expect(keys).toEqual([KEY, KEY, u(901)]);
  });
  it("a thrown exception (network) is 'unexpected', the key is untouched and the caller can retry with it", async () => {
    rpc.mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue({ data: { remaining: 1, reversal_journal_entry_id: u(13), replay: true }, error: null });
    expect(await reverseCreditApplicationAction(reverse)).toEqual({ ok: false, error: "unexpected" });
    const again = await reverseCreditApplicationAction(reverse);
    expect(again).toMatchObject({ ok: true, data: { replay: true } });
    expect(rpc.mock.calls.map((c) => c[1].p_idempotency_key)).toEqual([KEY, KEY]);
    expect(revalidatePath).toHaveBeenCalled(); // only after the successful attempt
  });
});

describe("error conversion", () => {
  it.each(ADVANCE_ERROR_CODES.map((c) => [c] as const))("%s (with the database's Arabic text after the colon) => that code, nothing else leaks", async (code) => {
    rpc.mockResolvedValue({ data: null, error: { message: `${code}: رسالة عربية فيها معرّف 123e4567-e89b-12d3-a456-426614174000`, code: "22023" } });
    const r = await applyPaymentCreditAction(apply);
    expect(r).toEqual({ ok: false, error: code });
    expect(JSON.stringify(r)).not.toMatch(/123e4567|رسالة/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("SQLSTATE 42501 is a permission error; a bare code works; unknown database text becomes 'unexpected' without leaking", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied for function x", code: "42501" } });
    expect(await applyPaymentCreditAction(apply)).toEqual({ ok: false, error: "FORBIDDEN_FINANCE_PERMISSION" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "ALREADY_REVERSED", code: "22023" } });
    expect(await reverseCreditApplicationAction(reverse)).toEqual({ ok: false, error: "ALREADY_REVERSED" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'duplicate key value violates unique constraint "payments_pkey" (id)=(abc)', code: "23505" } });
    const r = await recordAdvancePaymentAction(record);
    expect(r).toEqual({ ok: false, error: "unexpected" });
    expect(JSON.stringify(r)).not.toMatch(/payments_pkey|duplicate/);
  });
  it("only the stable code is logged, never the database text", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "CREDIT_EXCEEDED: المبلغ 9999 أكبر من الرصيد", code: "22023" } });
    await applyPaymentCreditAction(apply);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("CREDIT_EXCEEDED");
    expect(logged).not.toMatch(/9999|المبلغ/);
  });
  it("every code has an Arabic and an English message; unknown codes fall back to the generic one", () => {
    for (const code of [...ADVANCE_ERROR_CODES, "invalid_input", "unexpected"]) {
      for (const loc of ["ar", "en"] as const) {
        const m = advanceErrorMessage(code, loc);
        expect(m.length, `${code}/${loc}`).toBeGreaterThan(4);
        expect(m).not.toMatch(/undefined|\[object/);
      }
    }
    expect(advanceErrorMessage("SOMETHING_NEW", "en")).toBe(advanceErrorMessage("unexpected", "en"));
    expect(ADVANCE_MESSAGE_KEYS).toHaveLength(ADVANCE_ERROR_CODES.length + 2);
    expect(advanceErrorCode(null)).toBe("unexpected");
  });
  it("the catalogue covers every code the migrations raise for these functions", () => {
    const sources = ["20261017100000_phase3a_customer_advances_schema.sql", "20261017100100_phase3b_customer_advances_functions.sql", "20261017100200_phase3c_customer_advances_integrity.sql", "20261017100300_phase3d_customer_advances_review2.sql", "20261017100400_phase3e_customer_advances_trusted_backend.sql"].map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"));
    const b = sources[1];
    const ownFunctions = b.slice(0, b.indexOf("-- 5. void_payment")); // void_payment's inherited codes are mapped by the existing void action
    const raised = new Set([...[sources[0], ownFunctions, sources[2], sources[3].slice(0, sources[3].indexOf("CREATE OR REPLACE FUNCTION public.void_payment"))].join("\n").matchAll(/RAISE EXCEPTION '([A-Z][A-Z0-9_]{2,})/g)].map((m) => m[1]));
    expect(raised.size, "the scan must actually find the raised codes").toBeGreaterThan(25);
    const inherited = new Set(["PAYMENT_JOURNAL_ENTRY_MISSING"]);
    const missing = [...raised].filter((c) => !(ADVANCE_ERROR_CODES as readonly string[]).includes(c) && !inherited.has(c) && c !== "PAYMENT_ALLOCATION_REVERSAL_DATE_MISMATCH");
    expect(missing, "a code raised by the SQL has no message").toEqual([]);
  });
});

describe("set account", () => {
  it("forwards the three ids with the user's session and revalidates", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await setCustomerAdvanceAccountAction({ organizationId: u(1), resortId: u(2), accountId: u(3) })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_default_customer_advance_account", { p_organization_id: u(1), p_property_id: u(2), p_account_id: u(3) });
  });
  it("maps the validation trigger's refusal", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "CUSTOMER_ADVANCE_ACCOUNT_INVALID: حساب", code: "22023" } });
    expect(await setCustomerAdvanceAccountAction({ organizationId: u(1), resortId: u(2), accountId: u(3) })).toEqual({ ok: false, error: "CUSTOMER_ADVANCE_ACCOUNT_INVALID" });
  });
});
