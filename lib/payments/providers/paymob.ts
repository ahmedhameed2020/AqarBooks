import crypto from "node:crypto";
import type {
  PaymentProviderAdapter,
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookPayload,
  NormalizedWebhookStatus,
  WebhookRequestContext,
  ProviderCredentials,
} from "./types";

// Confirmed from Paymob's own official GitHub org repo
// (github.com/PaymobAccept/Paymob-AI-Integration-Skill,
// skills/paymob-integration/references/hmac-verification.md), which cites
// and mirrors developers.paymob.com/.../webhook-callbacks-and-hmac/hmac
// (unreachable via direct fetch -- Cloudflare 403 -- across every attempt
// during Phase 5's research, including one more retry as part of this
// task's Step 0, which also 403'd). Project owner explicitly approved
// proceeding on this source for CONTRACT-TEST COVERAGE ONLY, not
// production (2026-08-16 decision) -- see Task 3's status note in the
// plan. If a real sandbox webhook's HMAC ever fails to verify against this
// exact field list/order, treat that as evidence this list is stale --
// re-attempt live-docs access before assuming the bug is anywhere else in
// this file.
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

function computeHmac(transaction: Record<string, unknown>, secret: string): string {
  const concatenated = HMAC_FIELD_ORDER.map((field) => stringifyHmacValue(getNestedValue(transaction, field))).join("");
  return crypto.createHmac("sha512", secret).update(concatenated, "utf8").digest("hex");
}

// Derive a single descriptive raw-status string from Paymob's multi-boolean
// transaction shape, for providerStatus (Paymob has no single "status"
// field the way Fawry has orderStatus -- this synthesizes an equivalent).
function derivePaymobProviderStatus(obj: {
  success: boolean;
  pending: boolean;
  is_voided: boolean;
  is_refunded: boolean;
}): string {
  if (obj.is_refunded) return "REFUNDED";
  if (obj.is_voided) return "VOIDED";
  if (obj.pending) return "PENDING";
  return obj.success ? "SUCCESS" : "FAILED";
}

// Consistent with Fawry's revised philosophy (see fawry.ts, mapFawryStatus):
// is_refunded implies the payment previously SUCCEEDED -- must never be
// conflated with a genuine failure. No refund/reversal settlement policy
// exists yet, so refunded transactions are excluded from the settlement
// path (bucketed to PENDING, never triggers record_online_payment) rather
// than guessed into FAILED. is_voided is treated differently: a Paymob
// void means the transaction never completed/settled (closer to a
// cancellation than a reversal of received funds), so it's safe to treat
// as a genuine FAILED -- money was never actually received for a voided
// transaction the way it was for a refunded one.
//
// This switch is exhaustive over all four boolean flags -- every branch
// below is reachable and every combination resolves to a value, so there
// is no "unrecognized status" fallthrough case the way Fawry's string-enum
// mapping has, and therefore nothing here to console.warn about.
function mapPaymobStatus(obj: {
  success: boolean;
  pending: boolean;
  is_voided: boolean;
  is_refunded: boolean;
}): NormalizedWebhookStatus {
  if (obj.is_refunded) return "PENDING";
  if (obj.is_voided) return "FAILED";
  if (obj.pending) return "PENDING";
  return obj.success ? "SUCCESS" : "FAILED";
}

export const paymobAdapter: PaymentProviderAdapter = {
  providerId: "PAYMOB",

  async createCheckout(_input: CreateCheckoutInput, _credentials: ProviderCredentials): Promise<CreateCheckoutResult> {
    // Deliberate runtime guard, not decorative: this adapter's HMAC
    // verification has no vendor-published known-answer test to confirm
    // it against (see Task 3's status note in the plan). Calling this in
    // production would post real checkout requests -- against Paymob's
    // Intention API (`POST https://accept.paymob.com/v1/intention/`),
    // rendered via Paymob's Unified Checkout page -- under a webhook
    // signature scheme we cannot yet prove matches Paymob's real
    // implementation. Remove this guard ONLY as part of the explicit
    // follow-up task that re-enables Paymob for production, never as an
    // incidental part of an unrelated change. This guard is unconditional
    // and MUST remain the first statement in this function body regardless
    // of what credentials object is passed in -- it does not matter how
    // "valid-looking" _credentials is.
    throw new Error(
      "PAYMOB_ADAPTER_NOT_ENABLED_FOR_PRODUCTION: HMAC field order is confirmed from Paymob's own GitHub repo, " +
        "but no known-answer test vector (real input+secret+expected-hash) exists to verify correctness against. " +
        "See docs/superpowers/plans/2026-08-16-owner-portal-phase-5-provider-integrations.md Task 3."
    );
  },

  parseWebhookPayload(ctx: WebhookRequestContext): NormalizedWebhookPayload {
    const payload = JSON.parse(ctx.rawBody);
    const obj = payload.obj ?? payload;
    const merchantOrderRef = obj.order?.merchant_order_id ?? obj.merchant_order_id;
    return {
      merchantOrderRef,
      providerTransactionId: String(obj.id),
      status: mapPaymobStatus(obj),
      providerStatus: derivePaymobProviderStatus(obj),
      amountMinor: obj.amount_cents,
      currency: obj.currency,
      webhookEventId: String(obj.id),
    };
  },

  verifyWebhookSignature(ctx: WebhookRequestContext, credentials: ProviderCredentials): boolean {
    const payload = JSON.parse(ctx.rawBody);
    const obj = payload.obj ?? payload;
    const expected = computeHmac(obj, credentials.hmacSecret);
    const url = new URL(ctx.url);
    const provided = (url.searchParams.get("hmac") ?? "").toLowerCase();
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  },

  redactProviderPayload(ctx: WebhookRequestContext): Record<string, unknown> {
    const payload = JSON.parse(ctx.rawBody);
    const obj = payload.obj ?? payload;
    if (obj && typeof obj === "object" && "source_data" in obj && obj.source_data) {
      const sourceData = { ...obj.source_data };
      delete sourceData.pan;
      obj.source_data = sourceData;
    }
    return payload;
  },
};
