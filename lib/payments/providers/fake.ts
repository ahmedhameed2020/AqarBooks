import crypto from "node:crypto";
import type {
  PaymentProviderAdapter,
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookPayload,
  WebhookRequestContext,
} from "./types";

export const FAKE_PROVIDER_SECRET = "fake-provider-test-secret-do-not-use-in-real-code";

export function signFakePayload(rawBody: string): string {
  return crypto.createHmac("sha256", FAKE_PROVIDER_SECRET).update(rawBody, "utf8").digest("hex");
}

type ProviderIdOrFake = "PAYMOB" | "FAWRY" | "FAKE";

// This adapter never touches a real network and is never wired into
// online_payment_transactions.provider (which is CHECK-constrained to
// PAYMOB/FAWRY only, per Phase 3's schema) -- it exists purely so the
// shared contract test suite (Step 4) and the webhook-route-factory tests
// (Task 5) have a provider-shaped implementation to run against without
// depending on Fawry/Paymob sandbox availability.
export const fakeProviderAdapter: Omit<PaymentProviderAdapter, "providerId"> & {
  providerId: ProviderIdOrFake;
} = {
  providerId: "FAKE" as const,
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    return {
      redirectUrl: `https://fake-provider.test/checkout?ref=${input.merchantOrderRef}`,
      providerReference: `fake-${input.transactionId}`,
    };
  },
  parseWebhookPayload(ctx: WebhookRequestContext): NormalizedWebhookPayload {
    const body = JSON.parse(ctx.rawBody);
    return {
      merchantOrderRef: body.merchantOrderRef,
      providerTransactionId: body.providerTransactionId,
      status: body.status,
      // The fake fixture body's `status` field already IS the normalized
      // value -- there's no separate raw/normalized distinction in this
      // simple fixture shape, so just mirror it. This adapter's job is only
      // to satisfy the interface shape for contract testing, not to model
      // a real provider's raw status vocabulary.
      providerStatus: body.status,
      amountMinor: body.amountMinor,
      currency: body.currency ?? "EGP",
      webhookEventId: body.webhookEventId,
    };
  },
  verifyWebhookSignature(ctx: WebhookRequestContext): boolean {
    const expected = signFakePayload(ctx.rawBody);
    const provided = ctx.headers["x-fake-signature"] ?? "";
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  },
  redactProviderPayload(ctx: WebhookRequestContext): Record<string, unknown> {
    return JSON.parse(ctx.rawBody);
  },
};
