import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWebhookRouteHandler } from "@/lib/payments/webhook-handler";
import { fakeProviderAdapter, signFakePayload, FAKE_PROVIDER_SECRET } from "@/lib/payments/providers/fake";
import type { ProviderCredentials } from "@/lib/payments/providers/types";
import { NextRequest } from "next/server";

// Mock createAdminClient -- this test proves the ROUTE's control flow
// (parse -> lookup -> resolve credentials -> verify signature -> RPC ->
// respond), not Phase 4's RPC itself (already proven in Phase 4's own
// suite) nor Task 2's resolver (already proven in resolve-credentials.test.ts
// against real Supabase data).
const mockMaybeSingle = vi.fn();
const mockRpcSingle = vi.fn();
const mockRpc = vi.fn((..._args: unknown[]) => ({ single: mockRpcSingle }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

// The webhook handler now calls resolveProviderCredentials internally
// (Task 3 restructuring) -- mock the whole module rather than exercising
// the real resolver/RPC here.
const mockResolveProviderCredentials = vi.fn();
vi.mock("@/lib/payments/resolve-credentials", () => ({
  resolveProviderCredentials: (...args: unknown[]) => mockResolveProviderCredentials(...args),
}));

const DEFAULT_CREDENTIALS: ProviderCredentials = {
  merchantIdentifier: "fake-merchant",
  publicKey: null,
  apiKey: "fake-api-key",
  hmacSecret: FAKE_PROVIDER_SECRET,
};

function buildRequest(body: string, headers: Record<string, string>, url = "https://example.test/api/webhooks/fake") {
  return new NextRequest(url, { method: "POST", body, headers });
}

describe("webhook route handler (against fake adapter)", () => {
  const handler = createWebhookRouteHandler(fakeProviderAdapter as any);

  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockRpcSingle.mockReset();
    mockRpc.mockClear();
    mockResolveProviderCredentials.mockReset();
    mockResolveProviderCredentials.mockResolvedValue(DEFAULT_CREDENTIALS);
  });

  it("rejects an invalid signature with 401, AFTER looking up the transaction (needed to resolve whose secret applies) but never calling record_online_payment", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": "wrong" }));
    expect(res.status).toBe(401);
    // The DB lookup and credential resolution DO happen before signature
    // verification now (Task 3's deliberate, documented change) -- only
    // the mutating RPC never runs on an unverified signature.
    expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mockResolveProviderCredentials).toHaveBeenCalledTimes(1);
    expect(mockRpcSingle).not.toHaveBeenCalled();
  });

  it("returns a generic 200 for an unknown reference, without a distinguishing body, and never resolves credentials", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    const body = JSON.stringify({ merchantOrderRef: "unknown", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Object.keys(json)).toHaveLength(0);
    expect(mockResolveProviderCredentials).not.toHaveBeenCalled();
  });

  it("calls record_online_payment only on a SUCCESS status", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    mockRpcSingle.mockResolvedValue({ data: { status: "PAID", payment_id: "pay-1" }, error: null });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
    expect(res.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(1);
  });

  it("does NOT call record_online_payment for a PENDING/FAILED status", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "PENDING", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
    expect(res.status).toBe(200);
    expect(mockRpcSingle).not.toHaveBeenCalled();
  });

  it("returns 500 (to trigger provider retry) when record_online_payment errors unexpectedly", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    mockRpcSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
    expect(res.status).toBe(500);
  });

  // --- Additional gates requested by the project owner ---

  it("gate 6: a malformed/non-JSON body returns 200, not a crash, and never looks up a transaction (parse happens first, before any DB touch)", async () => {
    const body = "not-json-at-all{{{";
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
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
      "error_type",
      "credential_resolution_error",
    ];

    for (const rawCall of consoleCalls) {
      const call = rawCall.trim();
      // Every logged call must be a JSON.stringify({...}) of an object
      // literal, not a raw variable/rawBody/parsed reference.
      expect(call).toMatch(/^JSON\.stringify\(\{[\s\S]*\}\)$/);
      // It must never reference rawBody, parsed, ctx, or result directly as
      // a value (only property key names from the allowlist below), and
      // never reference credentials/txn (whole objects) either -- only
      // specific already-allowlisted fields off them.
      expect(call).not.toMatch(/\brawBody\b/);
      expect(call).not.toMatch(/\bparsed\b(?!\.status|\.providerStatus)/);
      expect(call).not.toMatch(/\bctx\b/);
      expect(call).not.toMatch(/\bcredentials\b/);

      // Extract the object literal's field names and confirm each is in the
      // allowlist.
      const fieldNames = [...call.matchAll(/(\w+):/g)].map((m) => m[1]);
      for (const field of fieldNames) {
        expect(allowedFields).toContain(field);
      }
    }
  });

  it("gate 8: a duplicate/replay of the same valid SUCCESS webhook calls record_online_payment again each time (no route-level dedup)", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    mockRpcSingle.mockResolvedValue({ data: { status: "PAID", payment_id: "pay-1" }, error: null });
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const sig = signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret);

    const res1 = await handler(buildRequest(body, { "x-fake-signature": sig }));
    const res2 = await handler(buildRequest(body, { "x-fake-signature": sig }));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(2);
    // Confirms the RPC is invoked unconditionally on every SUCCESS webhook,
    // trusting record_online_payment's own PAID-short-circuit (Phase 4) to
    // handle replay idempotently -- the route adds no extra dedup logic.
  });

  // --- Task 3, Part 6: required regression scenarios (credential wiring) ---

  it("scenario 3: a DRAFT/not-enabled tenant setting (credential resolution throws) surfaces as 500, not a silent env fallback or crash", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: "txn-1", organization_id: "org-1", resort_id: null } });
    mockResolveProviderCredentials.mockRejectedValue(new Error("TenantProviderUnusableError: PROVIDER_NOT_ENABLED"));
    const body = JSON.stringify({ merchantOrderRef: "txn-1", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e1" });
    const res = await handler(buildRequest(body, { "x-fake-signature": signFakePayload(body, DEFAULT_CREDENTIALS.hmacSecret) }));
    expect(res.status).toBe(500);
    // Never reaches signature verification or the settlement RPC.
    expect(mockRpcSingle).not.toHaveBeenCalled();
  });

  it("scenario 6: two different tenants' credentials never blend -- transaction A's webhook only verifies against transaction A's resolved secret", async () => {
    const secretA = "tenant-a-secret";
    const secretB = "tenant-b-secret";

    const bodyA = JSON.stringify({ merchantOrderRef: "txn-a", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e-a" });
    const bodyB = JSON.stringify({ merchantOrderRef: "txn-b", providerTransactionId: "y", status: "SUCCESS", amountMinor: 100, webhookEventId: "e-b" });

    // Transaction A resolves to tenant A's secret.
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "txn-a", organization_id: "org-a", resort_id: null } });
    mockResolveProviderCredentials.mockResolvedValueOnce({ ...DEFAULT_CREDENTIALS, hmacSecret: secretA });
    mockRpcSingle.mockResolvedValueOnce({ data: { status: "PAID" }, error: null });
    // Signed with tenant B's secret, but this webhook is for tenant A's
    // transaction -- must be rejected as an invalid signature, proving
    // tenant B's secret cannot be used to forge a payment for tenant A.
    const resCrossTenant = await handler(buildRequest(bodyA, { "x-fake-signature": signFakePayload(bodyA, secretB) }));
    expect(resCrossTenant.status).toBe(401);
    expect(mockRpcSingle).not.toHaveBeenCalled();

    // Correctly signed with tenant A's own secret -- succeeds.
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "txn-a", organization_id: "org-a", resort_id: null } });
    mockResolveProviderCredentials.mockResolvedValueOnce({ ...DEFAULT_CREDENTIALS, hmacSecret: secretA });
    mockRpcSingle.mockResolvedValueOnce({ data: { status: "PAID" }, error: null });
    const resOwnTenant = await handler(buildRequest(bodyA, { "x-fake-signature": signFakePayload(bodyA, secretA) }));
    expect(resOwnTenant.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(1);

    // Transaction B (a different tenant) resolves to its own, different
    // secret, and is verified independently of A.
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: "txn-b", organization_id: "org-b", resort_id: null } });
    mockResolveProviderCredentials.mockResolvedValueOnce({ ...DEFAULT_CREDENTIALS, hmacSecret: secretB });
    mockRpcSingle.mockResolvedValueOnce({ data: { status: "PAID" }, error: null });
    const resB = await handler(buildRequest(bodyB, { "x-fake-signature": signFakePayload(bodyB, secretB) }));
    expect(resB.status).toBe(200);
    expect(mockRpcSingle).toHaveBeenCalledTimes(2);
  });
});
