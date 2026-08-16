export type ProviderId = "PAYMOB" | "FAWRY";

export interface ProviderCredentials {
  merchantIdentifier: string;
  publicKey: string | null;
  apiKey: string;
  hmacSecret: string;
  // Always populated by resolve-credentials.ts (both the tenant-settings
  // path and the legacy-env fallback path) -- the adapter never falls back
  // to reading env itself. Real per-environment (SANDBOX vs PRODUCTION)
  // base-URL differentiation for Fawry is NOT implemented yet (see Part 3's
  // note on the missing `environment` column on online_payment_transactions)
  // -- today this is always the sandbox/staging URL, regardless of what a
  // tenant's settings row says its `environment` is.
  baseUrl?: string;
}

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

export type NormalizedWebhookStatus = "SUCCESS" | "FAILED" | "PENDING" | "EXPIRED";

export interface NormalizedWebhookPayload {
  merchantOrderRef: string;
  providerTransactionId: string;
  status: NormalizedWebhookStatus;
  // The RAW, unmodified status string exactly as the provider sent it (e.g.
  // "REFUNDED", "UNPAID", or whatever a given provider's real wire value
  // is) -- never derived or normalized. Several distinct raw provider
  // statuses can legitimately bucket into the same coarse `status` above
  // (e.g. Fawry's REFUNDED/PARTIAL_REFUNDED and a genuinely-unrecognized
  // status both currently bucket to PENDING), and without this field that
  // information is lost the moment the webhook is parsed. A future
  // refund-handling policy (not built yet) needs to be able to distinguish
  // "this was actually refunded" from "this is a status we don't recognize
  // at all" by inspecting providerStatus, without requiring the coarse
  // `status` enum to grow a new value for every possible raw provider
  // state.
  providerStatus: string;
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
  createCheckout(input: CreateCheckoutInput, credentials: ProviderCredentials): Promise<CreateCheckoutResult>;
  parseWebhookPayload(ctx: WebhookRequestContext): NormalizedWebhookPayload; // pure parsing, needs no credentials
  verifyWebhookSignature(ctx: WebhookRequestContext, credentials: ProviderCredentials): boolean;
  // Returns a copy of the parsed payload with any sensitive fields (card
  // PAN, etc.) stripped before it's ever stored in
  // online_payment_transactions.provider_payload. Every adapter must
  // implement this explicitly (even if the answer is "return as-is because
  // this provider's webhook never carries card data") -- no adapter gets a
  // default that silently stores everything.
  redactProviderPayload(ctx: WebhookRequestContext): Record<string, unknown>;
}
