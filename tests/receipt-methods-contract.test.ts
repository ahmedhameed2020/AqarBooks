import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Receipt methods contract (replaces the old source-text pin that forbade BANK_TRANSFER).
 *
 * The database already allows CASH / BANK_TRANSFER / CHEQUE / OTHER / ONLINE (payments_method_check) and the receipts
 * screen, filters and dashboard already display BANK_TRANSFER; the receipt form now offers it too. This exercises the
 * real server action: each offered method is forwarded unchanged to record_payment, and anything else is refused
 * BEFORE any database call. The dialog itself is covered by tests/e2e/accounting-bank-reconciliation.spec.ts (the
 * transfer is created through the dialog and classified in the receipts list).
 */
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { recordPaymentAction } = await import("@/lib/actions/receivables");

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const form = (method?: string) => {
  const f = new FormData();
  f.set("organizationId", uuid(1));
  f.set("resortId", uuid(2));
  f.set("memberId", uuid(3));
  f.set("amount", "2000");
  if (method !== undefined) f.set("method", method);
  f.set("paymentDate", "2026-03-10");
  f.set("depositAccountId", uuid(4));
  f.set("fiscalPeriodId", uuid(5));
  f.set("allocations", JSON.stringify([{ dueId: uuid(6), amount: 2000 }]));
  return f;
};

beforeEach(() => rpc.mockClear());

describe("recordPaymentAction — receipt methods", () => {
  for (const method of ["CASH", "BANK_TRANSFER", "CHEQUE", "ONLINE"]) {
    it(`${method} is accepted and forwarded unchanged to record_payment`, async () => {
      const res = await recordPaymentAction({ ok: true }, form(method));
      expect(res.ok).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc.mock.calls[0][0]).toBe("record_payment");
      expect(rpc.mock.calls[0][1]).toMatchObject({ p_method: method, p_amount: 2000 });
    });
  }

  it("defaults to CASH when no method is sent", async () => {
    await recordPaymentAction({ ok: true }, form());
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_method: "CASH" });
  });

  for (const method of ["OTHER", "CRYPTO", "bank_transfer", "BANK TRANSFER", ""]) {
    it(`"${method}" is refused before any database call`, async () => {
      const res = await recordPaymentAction({ ok: true }, form(method === "" ? undefined : method));
      if (method === "") {
        expect(res.ok).toBe(true); // empty means "not sent": defaults to CASH
        return;
      }
      expect(res).toEqual({ ok: false, error: "invalid_input" });
      expect(rpc).not.toHaveBeenCalled();
    });
  }
});
