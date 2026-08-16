import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "node:crypto";

// See fawry-adapter.test.ts for why this stub is required: `server-only`
// throws unconditionally outside a Next.js bundler, which vitest is not.
vi.mock("server-only", () => ({}));

import { paymobAdapter } from "@/lib/payments/providers/paymob";
import { runProviderContractTests } from "./provider-contract.test";

const TEST_HMAC_SECRET = "test-paymob-hmac-secret";

beforeAll(() => {
  process.env.PAYMOB_SECRET_KEY = "unused-in-this-file";
  process.env.PAYMOB_PUBLIC_KEY = "unused-in-this-file";
  process.env.PAYMOB_HMAC_SECRET = TEST_HMAC_SECRET;
  process.env.PAYMOB_INTEGRATION_ID = "0";
  process.env.FAWRY_MERCHANT_CODE = "unused-in-this-file";
  process.env.FAWRY_SECURE_KEY = "unused-in-this-file";
  process.env.FAWRY_BASE_URL = "https://atfawry.fawrystaging.com";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

// SELF-GENERATED FIXTURE -- NOT a vendor-verified known-answer test.
// Paymob's own official GitHub doc (PaymobAccept/Paymob-AI-Integration-Skill)
// publishes the concatenation field order/format ("to validate your
// concatenation logic") but explicitly does NOT publish a computed
// HMAC-SHA512 hash for any worked example, so there is no real (input,
// secret, expected-hash) triple to pin this fixture to. These values are
// plausible-shaped placeholders constructed to match Paymob's documented
// transaction webhook shape; the "expected" HMAC below is always computed
// by this test file's own crypto call (mirroring the adapter's algorithm),
// never hardcoded, so these tests prove internal self-consistency of the
// adapter's implementation -- not that the implementation matches Paymob's
// real server. See lib/payments/providers/paymob.ts's header comment and
// docs/superpowers/plans/2026-08-16-owner-portal-phase-5-provider-integrations.md
// Task 3.
const HMAC_FIELD_ORDER = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
  "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
  "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
  "source_data.pan", "source_data.sub_type", "source_data.type", "success",
] as const;

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function stringifyHmacValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "";
  return String(value);
}

function computeExpectedHmac(transaction: Record<string, unknown>, secret: string): string {
  const concatenated = HMAC_FIELD_ORDER.map((field) => stringifyHmacValue(getNestedValue(transaction, field))).join("");
  return crypto.createHmac("sha512", secret).update(concatenated, "utf8").digest("hex");
}

function buildFixtureObj(
  overrides: Partial<{
    amount_cents: number;
    created_at: string;
    currency: string;
    error_occured: boolean;
    has_parent_transaction: boolean;
    id: number;
    integration_id: number;
    is_3d_secure: boolean;
    is_auth: boolean;
    is_capture: boolean;
    is_refunded: boolean;
    is_standalone_payment: boolean;
    is_voided: boolean;
    order: { id: number; merchant_order_id: string };
    owner: number;
    pending: boolean;
    source_data: { pan: string; sub_type: string; type: string };
    success: boolean;
  }> = {}
) {
  return {
    amount_cents: 50000,
    created_at: "2026-08-16T12:00:00Z",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    id: 123456789,
    integration_id: 987654,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 55555, merchant_order_id: "33333333-3333-3333-3333-333333333333" },
    owner: 111222,
    pending: false,
    source_data: { pan: "2345", sub_type: "MASTERCARD", type: "card" },
    success: true,
    ...overrides,
  };
}

function buildFixtureRequest(objOverrides: Parameters<typeof buildFixtureObj>[0] = {}) {
  const obj = buildFixtureObj(objOverrides);
  const hmac = computeExpectedHmac(obj as unknown as Record<string, unknown>, TEST_HMAC_SECRET);
  const rawBody = JSON.stringify({ type: "TRANSACTION", obj });
  const url = `https://example.test/api/webhooks/paymob?hmac=${hmac}`;
  return { obj, rawBody, url, hmac };
}

const validFixture = buildFixtureRequest();

runProviderContractTests("Paymob", paymobAdapter, {
  validWebhookBody: validFixture.rawBody,
  validHeaders: {},
  validUrl: validFixture.url,
  expectedMerchantOrderRef: "33333333-3333-3333-3333-333333333333",
  // Paymob's signature lives in the URL query string (`hmac`), not the
  // body or headers -- corrupt it there, keeping the same length so this
  // tests "wrong signature", not "malformed/short signature".
  corruptSignature: (ctx) => {
    const url = new URL(ctx.url);
    const original = url.searchParams.get("hmac") ?? "";
    const corrupted = (original[0] === "0" ? "1" : "0") + original.slice(1);
    url.searchParams.set("hmac", corrupted);
    return { ...ctx, url: url.toString() };
  },
  // Change a field that feeds the HMAC formula while leaving the URL's
  // `hmac` query param at its original (now-stale) value, so the
  // recomputed signature no longer matches.
  tamperPayload: (validBody) => {
    const parsed = JSON.parse(validBody);
    parsed.obj.amount_cents = 999999;
    return JSON.stringify(parsed);
  },
});

describe("Paymob adapter HMAC verification -- additional cases beyond the generic contract suite", () => {
  it("rejects when exactly one field (amount_cents) is modified, all else unchanged, signature kept from before the change", () => {
    const { obj, hmac } = validFixture;
    const tamperedObj = { ...obj, amount_cents: obj.amount_cents + 1 };
    const rawBody = JSON.stringify({ type: "TRANSACTION", obj: tamperedObj });
    const url = `https://example.test/api/webhooks/paymob?hmac=${hmac}`;
    expect(paymobAdapter.verifyWebhookSignature({ rawBody, headers: {}, url })).toBe(false);
  });

  it("rejects the stale (pre-swap) signature for the generic contract suite's corruptSignature case, specifically via the URL query param", () => {
    const url = new URL(validFixture.url);
    const corrupted = "0".repeat(128);
    url.searchParams.set("hmac", corrupted);
    expect(
      paymobAdapter.verifyWebhookSignature({ rawBody: validFixture.rawBody, headers: {}, url: url.toString() })
    ).toBe(false);
  });

  // Proves internal sensitivity to field identity/order, NOT vendor-verified
  // correctness (see file header comment) -- there is no external
  // known-answer test to check the real algorithm against, so this test
  // instead demonstrates that the concatenation genuinely depends on WHICH
  // field holds which value, not just an order-invariant function of the
  // same set of values (e.g. a sum or an unordered hash would still pass
  // here, which would mean the "field order" part of the implementation
  // was dead weight -- this test guards against that regression).
  it("proves internal sensitivity, not vendor-verified correctness: swapping the values of id and integration_id invalidates the old signature", () => {
    const { obj, hmac: oldSignature } = validFixture;
    expect(typeof obj.id).toBe("number");
    expect(typeof obj.integration_id).toBe("number");
    expect(obj.id).not.toBe(obj.integration_id);

    const swappedObj = { ...obj, id: obj.integration_id, integration_id: obj.id };
    const rawBody = JSON.stringify({ type: "TRANSACTION", obj: swappedObj });
    const url = `https://example.test/api/webhooks/paymob?hmac=${oldSignature}`;

    expect(paymobAdapter.verifyWebhookSignature({ rawBody, headers: {}, url })).toBe(false);

    // Sanity check: the freshly-recomputed signature for the swapped object
    // DOES validate against itself, confirming the rejection above is
    // specifically because of the swap (not some unrelated fixture bug).
    const newHmac = computeExpectedHmac(swappedObj as unknown as Record<string, unknown>, TEST_HMAC_SECRET);
    const newUrl = `https://example.test/api/webhooks/paymob?hmac=${newHmac}`;
    expect(paymobAdapter.verifyWebhookSignature({ rawBody, headers: {}, url: newUrl })).toBe(true);
    expect(newHmac).not.toBe(oldSignature);
  });
});

describe("Paymob adapter malformed/incomplete webhook handling", () => {
  it("parseWebhookPayload throws (JSON.parse failure) on non-JSON rawBody, rather than crashing further downstream", () => {
    expect(() => paymobAdapter.parseWebhookPayload({ rawBody: "not json", headers: {}, url: "" })).toThrow();
  });

  it("verifyWebhookSignature throws (JSON.parse failure) on non-JSON rawBody, rather than crashing further downstream", () => {
    expect(() =>
      paymobAdapter.verifyWebhookSignature({ rawBody: "not json", headers: {}, url: "https://example.test/x" })
    ).toThrow();
  });

  it("verifyWebhookSignature returns false gracefully (not a throw) when the `hmac` query param is entirely absent", () => {
    expect(
      paymobAdapter.verifyWebhookSignature({
        rawBody: validFixture.rawBody,
        headers: {},
        url: "https://example.test/api/webhooks/paymob",
      })
    ).toBe(false);
  });

  it("parseWebhookPayload does not crash when `obj` is entirely absent (payload is just `{}`) -- returns a payload with undefined-ish fields instead of throwing", () => {
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody: "{}", headers: {}, url: "" });
    expect(parsed.merchantOrderRef).toBeUndefined();
    expect(parsed.providerTransactionId).toBe("undefined");
    // All four status-driving booleans are undefined/falsy in this case,
    // which mapPaymobStatus's exhaustive boolean chain resolves to FAILED
    // (success is falsy) rather than throwing.
    expect(parsed.status).toBe("FAILED");
    expect(parsed.providerStatus).toBe("FAILED");
  });

  it("verifyWebhookSignature returns false gracefully (not a throw) when `obj` is entirely absent -- HMAC over an empty-ish transaction just won't match a real hmac param", () => {
    expect(
      paymobAdapter.verifyWebhookSignature({
        rawBody: "{}",
        headers: {},
        url: `https://example.test/x?hmac=${"a".repeat(128)}`,
      })
    ).toBe(false);
  });
});

describe("Paymob adapter status mapping", () => {
  it("maps success:true, pending:false, is_voided:false, is_refunded:false to SUCCESS/SUCCESS", () => {
    const { rawBody, url } = buildFixtureRequest({ success: true, pending: false, is_voided: false, is_refunded: false });
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody, headers: {}, url });
    expect(parsed.status).toBe("SUCCESS");
    expect(parsed.providerStatus).toBe("SUCCESS");
  });

  it("maps pending:true to PENDING/PENDING", () => {
    const { rawBody, url } = buildFixtureRequest({ success: false, pending: true, is_voided: false, is_refunded: false });
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody, headers: {}, url });
    expect(parsed.status).toBe("PENDING");
    expect(parsed.providerStatus).toBe("PENDING");
  });

  it("maps is_voided:true to FAILED/VOIDED, even when success:true", () => {
    const { rawBody, url } = buildFixtureRequest({ success: true, pending: false, is_voided: true, is_refunded: false });
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody, headers: {}, url });
    expect(parsed.status).toBe("FAILED");
    expect(parsed.providerStatus).toBe("VOIDED");
  });

  it("maps is_refunded:true to PENDING/REFUNDED -- NOT FAILED (a refund implies the payment previously succeeded)", () => {
    const { rawBody, url } = buildFixtureRequest({ success: true, pending: false, is_voided: false, is_refunded: true });
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody, headers: {}, url });
    expect(parsed.status).toBe("PENDING");
    expect(parsed.status).not.toBe("FAILED");
    expect(parsed.providerStatus).toBe("REFUNDED");
  });

  it("maps plain success:false (no pending/voided/refunded) to FAILED/FAILED", () => {
    const { rawBody, url } = buildFixtureRequest({ success: false, pending: false, is_voided: false, is_refunded: false });
    const parsed = paymobAdapter.parseWebhookPayload({ rawBody, headers: {}, url });
    expect(parsed.status).toBe("FAILED");
    expect(parsed.providerStatus).toBe("FAILED");
  });
});

describe("Paymob adapter redaction", () => {
  it("strips source_data.pan from the redacted payload", () => {
    const { rawBody, url } = validFixture;
    const redacted = paymobAdapter.redactProviderPayload({ rawBody, headers: {}, url });
    const obj = (redacted as any).obj;
    expect(obj.source_data.pan).toBeUndefined();
    // Other source_data fields are preserved -- this is a targeted
    // redaction, not a wholesale strip of the whole object.
    expect(obj.source_data.sub_type).toBe("MASTERCARD");
    expect(obj.source_data.type).toBe("card");
  });
});

describe("Paymob adapter createCheckout guard", () => {
  it("throws PAYMOB_ADAPTER_NOT_ENABLED_FOR_PRODUCTION and never attempts a network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      paymobAdapter.createCheckout({
        transactionId: "txn-1",
        amount: 500,
        memberEmail: "owner@example.test",
        memberPhone: null,
        merchantOrderRef: "33333333-3333-3333-3333-333333333333",
      })
    ).rejects.toThrow("PAYMOB_ADAPTER_NOT_ENABLED_FOR_PRODUCTION");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
