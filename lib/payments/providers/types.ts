export type ProviderId = "PAYMOB" | "FAWRY";

export interface CreateCheckoutInput {
  transactionId: string;
  amount: number; // EGP major units
  memberEmail: string;
  memberPhone: string | null;
  merchantOrderRef: string; // always = transactionId
}

export interface CreateCheckoutResult {
  redirectUrl: string;
  providerReference: string | null;
}

export type NormalizedWebhookStatus = "SUCCESS" | "FAILED" | "PENDING";

export interface NormalizedWebhookPayload {
  merchantOrderRef: string;
  providerTransactionId: string;
  status: NormalizedWebhookStatus;
  amountMinor: number;
  currency: string;
  webhookEventId: string;
}

// Paymob's signature lives in a URL query parameter (`hmac`); Fawry's
// lives inside the JSON body (`messageSignature`). Passing the full
// request context (not just headers) lets each adapter read from wherever
// its provider actually puts the signature, rather than forcing a
// header-only interface that would silently be wrong for Paymob.
export interface WebhookRequestContext {
  rawBody: string;
  headers: Record<string, string>;
  url: string;
}

export interface PaymentProviderAdapter {
  readonly providerId: ProviderId;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  parseWebhookPayload(ctx: WebhookRequestContext): NormalizedWebhookPayload;
  verifyWebhookSignature(ctx: WebhookRequestContext): boolean;
  // Returns a copy of the parsed payload with any sensitive fields (card
  // PAN, etc.) stripped before it's ever stored in
  // online_payment_transactions.provider_payload. Every adapter must
  // implement this explicitly (even if the answer is "return as-is because
  // this provider's webhook never carries card data") -- no adapter gets a
  // default that silently stores everything.
  redactProviderPayload(ctx: WebhookRequestContext): Record<string, unknown>;
}
