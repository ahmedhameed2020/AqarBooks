import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeProviderAdapter, signFakePayload, FAKE_PROVIDER_SECRET } from "@/lib/payments/providers/fake";
import { createWebhookRouteHandler } from "@/lib/payments/webhook-handler";

const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

const mockResolve = vi.fn();
vi.mock("@/lib/payments/resolve-credentials", () => ({
  resolveProviderCredentialsBySettings: (...args: unknown[]) => mockResolve(...args),
}));
const mockProcess = vi.fn();
vi.mock("@/lib/payments/process-event", () => ({
  processPaymentEvent: (...args: unknown[]) => mockProcess(...args),
}));

const transaction = {
  id: "txn-1", organization_id: "org-1", property_id: "property-1",
  provider: "FAWRY", environment: "SANDBOX", provider_settings_id: "settings-1",
};
const credentials = { merchantIdentifier: "fake-merchant", publicKey: null, apiKey: "", hmacSecret: FAKE_PROVIDER_SECRET };

function request(body: string, signature: string) {
  return new NextRequest("https://example.test/api/webhooks/fake", {
    method: "POST", body, headers: { "x-fake-signature": signature },
  });
}

describe("durable webhook route", () => {
  const handler = createWebhookRouteHandler(fakeProviderAdapter as never);
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: transaction });
    mockResolve.mockResolvedValue(credentials);
    mockRpc.mockResolvedValue({ data: { id: "event-1" }, error: null });
    mockProcess.mockResolvedValue({ status: "PROCESSED", code: "PAYMENT_POSTED" });
  });

  it("rejects invalid signatures before enqueueing", async () => {
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "ref", status: "SUCCESS", providerStatus: "PAID", amountMinor: 100, currency: "EGP", webhookEventId: "evt" });
    const response = await handler(request(body, "wrong"));
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns a non-enumerating 200 for an unknown reference", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const body = JSON.stringify({ merchantOrderRef: "unknown", providerTransactionId: "ref", status: "SUCCESS", providerStatus: "PAID", amountMinor: 100, currency: "EGP", webhookEventId: "evt" });
    const response = await handler(request(body, signFakePayload(body, FAKE_PROVIDER_SECRET)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("enqueues verified evidence then processes by durable event id", async () => {
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "ref", status: "SUCCESS", providerStatus: "PAID", amountMinor: 100, currency: "EGP", webhookEventId: "evt" });
    const response = await handler(request(body, signFakePayload(body, FAKE_PROVIDER_SECRET)));
    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("enqueue_online_payment_event", expect.objectContaining({ p_transaction_id: "txn-1", p_signature_verified: true }));
    expect(mockProcess).toHaveBeenCalledWith("event-1");
  });

  it("acknowledges a durable event even when inline processing is retryable", async () => {
    mockProcess.mockResolvedValue({ status: "RETRYABLE_ERROR", code: "PAYMENT_POSTING_FAILED" });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "ref", status: "SUCCESS", providerStatus: "PAID", amountMinor: 100, currency: "EGP", webhookEventId: "evt" });
    const response = await handler(request(body, signFakePayload(body, FAKE_PROVIDER_SECRET)));
    expect(response.status).toBe(200);
  });
});
