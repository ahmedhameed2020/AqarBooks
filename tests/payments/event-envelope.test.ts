import { describe, expect, it } from "vitest";

import {
  fallbackEventIdentifier,
  validateEventAgainstTransaction,
  type NormalizedPaymentEvent,
  type PaymentTransactionSnapshot,
} from "@/lib/payments/event-envelope";

const event: NormalizedPaymentEvent = {
  provider: "FAWRY",
  environment: "SANDBOX",
  eventIdentifier: "evt-1",
  merchantOrderRef: "txn-1",
  providerReference: "fawry-1",
  status: "SUCCESS",
  providerStatus: "PAID",
  amount: 100.125,
  currency: "EGP",
  merchantIdentifier: "merchant-1",
  occurredAt: "2026-09-24T08:00:00.000Z",
};

const transaction: PaymentTransactionSnapshot = {
  id: "txn-1",
  provider: "FAWRY",
  environment: "SANDBOX",
  amount: 100.125,
  currency: "EGP",
  merchantIdentifier: "merchant-1",
};

describe("payment event envelope", () => {
  it("accepts an event matching the immutable transaction snapshot", () => {
    expect(validateEventAgainstTransaction(event, transaction)).toEqual({ ok: true });
  });

  it.each([
    ["amount", { amount: 99 }, "AMOUNT_MISMATCH"],
    ["currency", { currency: "USD" }, "CURRENCY_MISMATCH"],
    ["merchant", { merchantIdentifier: "other" }, "MERCHANT_MISMATCH"],
    ["environment", { environment: "PRODUCTION" as const }, "ENVIRONMENT_MISMATCH"],
    ["reference", { merchantOrderRef: "txn-other" }, "REFERENCE_MISMATCH"],
  ])("quarantines %s mismatch", (_label, patch, code) => {
    expect(validateEventAgainstTransaction({ ...event, ...patch }, transaction)).toEqual({
      ok: false,
      code,
    });
  });

  it("compares amounts at the database four-decimal precision", () => {
    expect(
      validateEventAgainstTransaction({ ...event, amount: 100.12500001 }, transaction),
    ).toEqual({ ok: true });
  });

  it("builds a deterministic, byte-sensitive SHA-256 fallback identifier", () => {
    const first = fallbackEventIdentifier("FAWRY", "SANDBOX", '{"status":"PAID"}');
    const same = fallbackEventIdentifier("FAWRY", "SANDBOX", '{"status":"PAID"}');
    const changed = fallbackEventIdentifier("FAWRY", "SANDBOX", '{"status": "PAID"}');

    expect(first).toBe(same);
    expect(first).toMatch(/^fallback:FAWRY:SANDBOX:[a-f0-9]{64}$/);
    expect(changed).not.toBe(first);
  });
});
