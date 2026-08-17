import { describe, it, expect } from "vitest";
import type { PaymentProviderAdapter, ProviderCredentials } from "@/lib/payments/providers/types";

// Deliberately NOT named `*.test.ts` -- vitest's test-file glob only matches
// `*.test.ts`/`*.spec.ts` (see vitest.config.ts), so this helper is never
// itself collected and executed as a test file. It previously lived inside
// `provider-contract.test.ts`, which IS collected as a test file; every
// other test file that imported `runProviderContractTests` from there also
// re-executed that file's own top-level "fake adapter (contract suite
// self-test)" describe block as an import side effect, multiplying its 4
// tests once per importing file. Moving the shared helper out to its own
// non-test module fixes that at the source: the self-test describe block
// now lives only in provider-contract.test.ts, which nothing else imports.
//
// `corruptSignature`/`tamperPayload` are supplied by each fixture rather
// than guessed at generically: signature location and field-naming
// conventions differ per provider (Fawry: `messageSignature` inside the
// JSON body, no header/query signature at all; Paymob: `hmac` in the URL
// query string), so every caller MUST write real, provider-specific
// callbacks that actually corrupt/tamper that provider's fixture --
// copying another provider's callbacks would silently no-op against a
// different provider's payload shape.
export function runProviderContractTests(
  name: string,
  adapter: Pick<PaymentProviderAdapter, "verifyWebhookSignature" | "parseWebhookPayload">,
  fixtures: {
    validWebhookBody: string;
    validHeaders: Record<string, string>;
    validUrl: string;
    expectedMerchantOrderRef: string;
    credentials: ProviderCredentials;
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
      expect(adapter.verifyWebhookSignature(ctx, fixtures.credentials)).toBe(true);
    });

    it("rejects a corrupted signature", () => {
      const validCtx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      const ctx = fixtures.corruptSignature(validCtx);
      expect(adapter.verifyWebhookSignature(ctx, fixtures.credentials)).toBe(false);
    });

    it("rejects a tampered payload with the original (now-stale) signature", () => {
      const tamperedBody = fixtures.tamperPayload(fixtures.validWebhookBody);
      const ctx = { rawBody: tamperedBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      expect(adapter.verifyWebhookSignature(ctx, fixtures.credentials)).toBe(false);
    });

    it("parses the merchant order reference correctly from a valid payload", () => {
      const ctx = { rawBody: fixtures.validWebhookBody, headers: fixtures.validHeaders, url: fixtures.validUrl };
      const parsed = adapter.parseWebhookPayload(ctx);
      expect(parsed.merchantOrderRef).toBe(fixtures.expectedMerchantOrderRef);
    });
  });
}
