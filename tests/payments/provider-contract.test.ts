import { describe, it, expect } from "vitest";
import { fakeProviderAdapter, signFakePayload } from "@/lib/payments/providers/fake";
import type { PaymentProviderAdapter } from "@/lib/payments/providers/types";

// Parameterized so Task 2/3 can import and reuse this exact suite against
// the real Fawry/Paymob adapters with provider-specific fixtures, proving
// every adapter satisfies the same shape/behavior contract.
function runProviderContractTests(
  name: string,
  adapter: Pick<PaymentProviderAdapter, "verifyWebhookSignature" | "parseWebhookPayload">,
  fixtures: {
    validWebhookBody: string;
    validHeaders: Record<string, string>;
    validUrl: string;
    expectedMerchantOrderRef: string;
  }
) {
  describe(`${name} provider contract`, () => {
    it("verifies a genuinely valid signature", () => {
      const ctx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      expect(adapter.verifyWebhookSignature(ctx)).toBe(true);
    });

    it("rejects a corrupted signature", () => {
      const corruptedHeaders = { ...fixtures.validHeaders };
      for (const key of Object.keys(corruptedHeaders)) {
        if (key.toLowerCase().includes("signature") || key.toLowerCase() === "hmac") {
          corruptedHeaders[key] = "0".repeat(corruptedHeaders[key]?.length ?? 10);
        }
      }
      const corruptedUrl = fixtures.validUrl.includes("hmac=")
        ? fixtures.validUrl.replace(/hmac=[^&]+/, "hmac=" + "0".repeat(128))
        : fixtures.validUrl;
      const ctx = { rawBody: fixtures.validWebhookBody, headers: corruptedHeaders, url: corruptedUrl };
      expect(adapter.verifyWebhookSignature(ctx)).toBe(false);
    });

    it("rejects a tampered payload with the original (now-stale) signature", () => {
      const tamperedBody = fixtures.validWebhookBody.replace(/"amount[^"]*":\s*"?[\d.]+"?/, (m) =>
        m.replace(/[\d.]+/, "999999")
      );
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
  });
});

export { runProviderContractTests };
