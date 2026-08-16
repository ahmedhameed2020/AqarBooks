import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWebhookRouteHandler } from "@/lib/payments/webhook-handler";
import { fakeProviderAdapter, signFakePayload } from "@/lib/payments/providers/fake";
import { NextRequest } from "next/server";

// Mock createAdminClient -- this test proves the ROUTE's control flow
// (signature -> parse -> lookup -> RPC -> respond), not Phase 4's RPC
// itself (already proven in Phase 4's own suite).
const mockMaybeSingle = vi.fn();
const mockRpcSingle = vi.fn();
const mockRpc = vi.fn(() => ({ single: mockRpcSingle }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

function buildRequest(body: string, headers: Record<string, string>, url = "https://example.test/api/webhooks/fake") {
  return new NextRequest(url, { method: "POST", body, headers });
}

describe("webhook route handler (against fake adapter)", () => {
  const handler = createWebhookRouteHandler(fakeProviderAdapter as any);

  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpcSingle.mockReset();
    mockRpc.mockClear();
  });

  it("rejects an invalid signature with 401 and never queries the transaction", async () => {
    const body = JSON.stringify({ merchantOrderRef: "x", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": "wrong" }));
    expect(res.status).toBe(401);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("returns a generic 200 for an unknown reference, without a distinguishing body", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const body = JSON.stringify({ merchantOrderRef: "unknown", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json)).toHaveLength(0);
  });

  it("calls record_online_payment only on a SUCCESS status", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1" } });
    mockRpcSingle.mockResolvedValue({ data: { status: "PAID", payment_id: "pay-1" }, error: null });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body) }));
    expect(res.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(1);
  });

  it("does NOT call record_online_payment for a PENDING/FAILED status", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1" } });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "PENDING", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body) }));
    expect(res.status).toBe(200);
    expect(mockRpcSingle).not.toHaveBeenCalled();
  });

  it("returns 500 (to trigger provider retry) when record_online_payment errors unexpectedly", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1" } });
    mockRpcSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body) }));
    expect(res.status).toBe(500);
  });

  // --- Additional gates requested by the project owner ---

  it("gate 6: a malformed/non-JSON body with a well-formed-looking signature header returns 200, not a crash", async () => {
    // The fake adapter's verifyWebhookSignature HMACs the raw body itself,
    // so a non-JSON body still has a *correct* signature for that exact
    // body -- exercising the "signed but unparseable" path, not the
    // "invalid signature" path.
    const body = "not-json-at-all{{{";
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json)).toHaveLength(0);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("gate 7: no console.* call in webhook-handler.ts ever logs rawBody or the parsed payload object", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../lib/payments/webhook-handler.ts"),
      "utf8"
    );
    const consoleCalls = [...source.matchAll(/console\.(?:error|info|warn|log)\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(consoleCalls.length).toBeGreaterThan(0);

    const allowedFields = [
      "provider",
      "transaction_id",
      "status",
      "signature_verified",
      "unknown_reference",
      "parse_error",
      "rpc_error",
      "result_status",
      "provider_status",
      "error",
    ];

    for (const rawCall of consoleCalls) {
      const call = rawCall.trim();
      // Every logged call must be a JSON.stringify({...}) of an object
      // literal, not a raw variable/rawBody/parsed reference.
      expect(call).toMatch(/^JSON\.stringify\(\{[\s\S]*\}\)$/);
      // It must never reference rawBody, parsed, ctx, or result directly as
      // a value (only property key names from the allowlist below).
      expect(call).not.toMatch(/\brawBody\b/);
      expect(call).not.toMatch(/\bparsed\b(?!\.status|\.providerStatus)/);
      expect(call).not.toMatch(/\bctx\b/);

      // Extract the object literal's field names and confirm each is in the
      // allowlist.
      const fieldNames = [...call.matchAll(/(\w+):/g)].map((m) => m[1]);
      for (const field of fieldNames) {
        expect(allowedFields).toContain(field);
      }
    }
  });

  it("gate 8: a duplicate/replay of the same valid SUCCESS webhook calls record_online_payment again each time (no route-level dedup)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1" } });
    mockRpcSingle.mockResolvedValue({ data: { status: "PAID", payment_id: "pay-1" }, error: null });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const sig = signFakePayload(body);

    const res1 = await handler(buildRequest(body, { "x-fake-signature": sig }));
    const res2 = await handler(buildRequest(body, { "x-fake-signature": sig }));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(2);
    // Confirms the RPC is invoked unconditionally on every SUCCESS webhook,
    // trusting record_online_payment's own PAID-short-circuit (Phase 4) to
    // handle replay idempotently -- the route adds no extra dedup logic.
  });
});
