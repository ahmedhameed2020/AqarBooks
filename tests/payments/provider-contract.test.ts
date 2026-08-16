import { describe } from "vitest";
import { fakeProviderAdapter, signFakePayload, FAKE_PROVIDER_SECRET } from "@/lib/payments/providers/fake";
import type { ProviderCredentials } from "@/lib/payments/providers/types";
import { runProviderContractTests } from "./contract-test-helper";

const TEST_CREDENTIALS: ProviderCredentials = {
  merchantIdentifier: "fake-merchant",
  publicKey: null,
  apiKey: "fake-api-key",
  hmacSecret: FAKE_PROVIDER_SECRET,
};

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
    validHeaders: { "x-fake-signature": signFakePayload(body, TEST_CREDENTIALS.hmacSecret) },
    validUrl: "https://example.test/api/webhooks/fake",
    expectedMerchantOrderRef: "11111111-1111-1111-1111-111111111111",
    credentials: TEST_CREDENTIALS,
    corruptSignature: (ctx) => ({
      ...ctx,
      headers: { ...ctx.headers, "x-fake-signature": "0".repeat(64) },
    }),
    tamperPayload: (validBody) => validBody.replace('"amountMinor":50000', '"amountMinor":999999'),
  });
});
