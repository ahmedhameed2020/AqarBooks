import { describe, it, expect } from "vitest";
import { fakeProviderAdapter, signFakePayload } from "@/lib/payments/providers/fake";
import type { PaymentProviderAdapter } from "@/lib/payments/providers/types";

// Parameterized so Task 2/3 can import and reuse this exact suite against
// the real Fawry/Paymob adapters with provider-specific fixtures, proving
// every adapter satisfies the same shape/behavior contract.
//
// `corruptSignature`/`tamperPayload` are supplied by each fixture rather
// than guessed at generically: signature location and field-naming
// conventions differ per provider (Fawry: `messageSignature` inside the
// JSON body, no header/query signature at all; Paymob: `hmac` in the URL
// query string), so Task 2/3 MUST write real, provider-specific callbacks
// that actually corrupt/tamper that provider's fixture -- copying the fake
// adapter's callbacks below would silently no-op against a different
// provider's payload shape.
function runProviderContractTests(
  name: string,
  adapter: Pick<PaymentProviderAdapter, "verifyWebhookSignature" | "parseWebhookPayload">,
  fixtures: {
    validWebhookBody: string;
    validHeaders: Record<string, string>;
    validUrl: string;
    expectedMerchantOrderRef: string;
    corruptSignature: (ctx: {
      rawBody: string;
      headers: Record<string, string>;
      url: string;
    }) => { rawBody: string; headers: Record<string, string>; url: string };
    tamperPayload: (validBody: string) => string;
  }
) {
  describe(`${name} provider contract`, () => {
    it("verifies a genuinely valid signature", () => {
      const ctx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      expect(adapter.verifyWebhookSignature(ctx)).toBe(true);
    });

    it("rejects a corrupted signature", () => {
      const validCtx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      const ctx = fixtures.corruptSignature(validCtx);
      expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
    });

    it("rejects a tampered payload with the original (now-stale) signature", () => {
      const tamperedBody = fixtures.tamperPayload(fixtures.validWebhookBody);
      const ctx = { rawBody: tamperedBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
    });

    it("parses the merchant order reference correctly from a valid payload", () => {
      const ctx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      const parsed = adapter.parseWebhookPayload(ctx);
      expect(parsed.merchantOrderRef).toBe(fixtures.expectedMerchantOrderRef);
    });
  });
}

describe("fake adapter (contract suite self-test)", () => {
  const body = JSON.stringify({
    merchantOrderRef: "11111111-1111-1111-1111-111111111111",
    providerTransactionId: "fake-txn-1",
    status: "SUCCESS",
    amountMinor: 50000,
    currency: "EGP",
    webhookEventId: "fake-evt-1",
  });
  runProviderContractTests("Fake", fakeProviderAdapter, {
    validWebhookBody: body,
    validHeaders: { "x-fake-signature": signFakePayload(body) },
    validUrl: "https://example.test/api/webhooks/fake",
    expectedMerchantOrderRef: "11111111-1111-1111-1111-111111111111",
    corruptSignature: (ctx) => ({
      ...ctx,
      headers: { ...ctx.headers, "x-fake-signature": "0".repeat(64) },
    }),
    tamperPayload: (validBody) => validBody.replace('"amountMinor":50000', '"amountMinor":999999'),
  });
});

export { runProviderContractTests };
