import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  processPaymentEvent,
  type PaymentEventProcessorDependencies,
  type ProcessablePaymentEvent,
} from "@/lib/payments/process-event";

const normalized = {
  provider: "FAWRY" as const,
  environment: "SANDBOX" as const,
  eventIdentifier: "evt-1",
  merchantOrderRef: "txn-1",
  providerReference: "ref-1",
  status: "SUCCESS" as const,
  providerStatus: "PAID",
  amount: 100,
  currency: "EGP",
  merchantIdentifier: "merchant-1",
  occurredAt: null,
};

function harness(overrides: Partial<PaymentEventProcessorDependencies> = {}) {
  const event: ProcessablePaymentEvent = {
    id: "evt-db-1",
    transaction_id: "txn-1",
    signature_verified: true,
    processing_status: "PROCESSING",
    redacted_payload: normalized,
  };
  const dependencies: PaymentEventProcessorDependencies = {
    claim: vi.fn(async () => event),
    getTransaction: vi.fn(async () => ({
      id: "txn-1",
      provider: "FAWRY",
      environment: "SANDBOX",
      amount: 100,
      currency: "EGP",
      merchantIdentifier: "merchant-1",
      status: "PENDING",
    })),
    recordPayment: vi.fn(async () => ({ status: "PAID" })),
    complete: vi.fn(async () => undefined),
    ...overrides,
  };
  return { event, dependencies };
}

describe("durable payment event processing", () => {
  it("posts one valid success and completes the inbox event", async () => {
    const { dependencies } = harness();
    await expect(processPaymentEvent("evt-db-1", dependencies)).resolves.toEqual({
      status: "PROCESSED",
      code: "PAYMENT_POSTED",
    });
    expect(dependencies.recordPayment).toHaveBeenCalledOnce();
    expect(dependencies.complete).toHaveBeenCalledWith("evt-db-1", "PROCESSED", null);
  });

  it("treats duplicate delivery as idempotent", async () => {
    const { dependencies } = harness({ claim: vi.fn(async () => null) });
    await expect(processPaymentEvent("evt-db-1", dependencies)).resolves.toEqual({
      status: "IDEMPOTENT",
      code: "EVENT_ALREADY_CLAIMED_OR_COMPLETE",
    });
    expect(dependencies.recordPayment).not.toHaveBeenCalled();
  });

  it("ignores an out-of-order event after the transaction is paid", async () => {
    const { dependencies } = harness({
      getTransaction: vi.fn(async () => ({
        id: "txn-1", provider: "FAWRY", environment: "SANDBOX", amount: 100,
        currency: "EGP", merchantIdentifier: "merchant-1", status: "PAID",
      })),
    });
    const result = await processPaymentEvent("evt-db-1", dependencies);
    expect(result.status).toBe("IDEMPOTENT");
    expect(dependencies.recordPayment).not.toHaveBeenCalled();
  });

  it.each([
    ["amount", { ...normalized, amount: 99 }, "AMOUNT_MISMATCH"],
    ["currency", { ...normalized, currency: "USD" }, "CURRENCY_MISMATCH"],
    ["merchant", { ...normalized, merchantIdentifier: "other" }, "MERCHANT_MISMATCH"],
  ])("quarantines %s mismatch without posting", async (_label, payload, code) => {
    const { event, dependencies } = harness();
    event.redacted_payload = payload;
    await expect(processPaymentEvent("evt-db-1", dependencies)).resolves.toEqual({
      status: "QUARANTINED", code,
    });
    expect(dependencies.recordPayment).not.toHaveBeenCalled();
  });

  it("schedules a fixed-code retry when financial posting fails", async () => {
    const { dependencies } = harness({
      recordPayment: vi.fn(async () => { throw new Error("raw database detail"); }),
    });
    const result = await processPaymentEvent("evt-db-1", dependencies);
    expect(result).toEqual({ status: "RETRYABLE_ERROR", code: "PAYMENT_POSTING_FAILED" });
    expect(dependencies.complete).toHaveBeenCalledWith(
      "evt-db-1", "RETRYABLE_ERROR", "PAYMENT_POSTING_FAILED", expect.any(String),
    );
  });
});
