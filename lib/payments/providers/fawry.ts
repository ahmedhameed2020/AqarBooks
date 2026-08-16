import crypto from "node:crypto";
import { getPaymentsEnv } from "../env";
import type {
  PaymentProviderAdapter,
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedWebhookPayload,
  NormalizedWebhookStatus,
  WebhookRequestContext,
} from "./types";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function toTwoDecimals(amount: number): string {
  return amount.toFixed(2);
}

// This adapter never sends a saved customer profile ID or a forced/
// pre-selected payment method with the reference-number checkout flow, so
// both fields are always empty strings in the signature formula below --
// named here (not left as bare `${""}${""}`) so a future reader doesn't
// mistake them for leftover placeholders and "clean them up".
const EMPTY_CUST_PROF_ID = "";
const EMPTY_PAYMENT_METHOD = "";

// Per developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis:
// merchantCode + merchantRefNum + merchant_cust_prof_id + payment_method + amount + secureKey.
function buildChargeRequestSignature(params: {
  merchantCode: string;
  merchantRefNum: string;
  amount: number;
  secureKey: string;
}): string {
  const concatenated = `${params.merchantCode}${params.merchantRefNum}${EMPTY_CUST_PROF_ID}${EMPTY_PAYMENT_METHOD}${toTwoDecimals(params.amount)}${params.secureKey}`;
  return sha256Hex(concatenated);
}

// Float-unsafe: `Math.round(parseFloat(decimalString) * 100)` can lose a
// cent on inputs like "1.005" (parseFloat("1.005") * 100 === 100.49999999999999,
// which rounds down to 100 instead of 101). Fawry's amounts are always
// plain fixed-2-decimal strings, so parse the integer cents directly from
// the string instead of going through float multiplication at all.
function decimalStringToMinorUnits(decimalString: string): number {
  const [wholePart, fractionalPart = ""] = decimalString.split(".");
  const paddedFraction = (fractionalPart + "00").slice(0, 2);
  return Number(wholePart) * 100 + Number(paddedFraction);
}

// Per developer.fawrystaging.com/docs/payment-notifications/server-notification-v2:
// fawryRefNumber + merchantRefNum + paymentAmount + orderAmount + orderStatus + paymentMethod + paymentRefNumber + secureKey.
function buildNotificationSignatureInput(
  body: {
    fawryRefNumber: string;
    merchantRefNumber: string;
    paymentAmount: string;
    orderAmount: string;
    orderStatus: string;
    paymentMethod: string;
    paymentRefNumber: string;
  },
  secureKey: string
): string {
  return `${body.fawryRefNumber}${body.merchantRefNumber}${body.paymentAmount}${body.orderAmount}${body.orderStatus}${body.paymentMethod}${body.paymentRefNumber}${secureKey}`;
}

// --- Task 2, Step 1 research (2026-08-16) ---
// Source: https://developer.fawrystaging.com/docs/payment-notifications/server-notification-v2
// The page's parameter table documents `orderStatus` (type String, "The
// updated status of your transaction.") with the enum values listed
// verbatim as:
//   NEW, PAID, CANCELED, REFUNDED, EXPIRED, PARTIAL_REFUNDED, FAILED
// (spelling per the docs: "CANCELED", one L). The page does not include a
// full example JSON payload and does not define per-value semantics beyond
// that list -- it is the closest thing to a citable source available for
// this task, and it directly names FAILED, CANCELED, and EXPIRED as
// terminal-negative order statuses, so those three are added below.
//
// Notably, "UNPAID" (already mapped to PENDING before this research, per
// the project owner's Task 2 framing) does NOT appear anywhere in this
// documented enum. It is left mapped to PENDING as instructed -- that
// mapping was already in place, this step's job was only to ADD confirmed
// FAILED-branch cases, never to relax/remove existing ones -- and PENDING
// is the safe default regardless, so no behavior changes either way.
//
// REFUNDED and PARTIAL_REFUNDED are deliberately NOT mapped to FAILED:
// a refund implies the payment previously succeeded, so guessing FAILED
// for it would misclassify a paid transaction as failed, which is exactly
// the kind of silent misclassification the project owner's decision
// prohibits. They fall through to the PENDING default + logged warning
// for manual review, same as any other unrecognized value. NEW similarly
// falls through to the default (it is a pre-payment state, not a failure).
function mapFawryStatus(orderStatus: string): NormalizedWebhookStatus {
  switch (orderStatus) {
    case "PAID":
      return "SUCCESS";
    case "UNPAID":
      return "PENDING";
    case "FAILED":
    case "CANCELED":
    case "EXPIRED":
      return "FAILED";
    default:
      console.warn(
        JSON.stringify({
          provider: "FAWRY",
          unrecognized_order_status: orderStatus,
          action: "treated_as_pending_pending_manual_review",
        })
      );
      return "PENDING";
  }
}

export const fawryAdapter: PaymentProviderAdapter = {
  providerId: "FAWRY",

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const env = getPaymentsEnv();
    const signature = buildChargeRequestSignature({
      merchantCode: env.FAWRY_MERCHANT_CODE,
      merchantRefNum: input.merchantOrderRef,
      amount: input.amount,
      secureKey: env.FAWRY_SECURE_KEY,
    });

    const response = await fetch(`${env.FAWRY_BASE_URL}/ECommerceWeb/Fawry/payments/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantCode: env.FAWRY_MERCHANT_CODE,
        merchantRefNum: input.merchantOrderRef,
        customerMobile: input.memberPhone ?? "",
        customerEmail: input.memberEmail,
        amount: input.amount,
        currencyCode: "EGP",
        paymentExpiry: Date.now() + 15 * 60 * 1000,
        chargeItems: [
          {
            itemId: input.transactionId,
            description: "Owner portal dues payment",
            price: input.amount,
            quantity: 1,
          },
        ],
        returnUrl: `${env.NEXT_PUBLIC_APP_URL}/portal/payments/return?txn=${input.transactionId}`,
        signature,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`FAWRY_CHARGE_REQUEST_FAILED: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    const redirectUrl = result.nextAction?.redirectUrl ?? result.redirectUrl;
    if (!redirectUrl || typeof redirectUrl !== "string") {
      throw new Error(`FAWRY_CHARGE_RESPONSE_MISSING_REDIRECT_URL: ${JSON.stringify(result)}`);
    }
    return {
      redirectUrl,
      providerReference: result.referenceNumber ?? null,
    };
  },

  parseWebhookPayload(ctx: WebhookRequestContext): NormalizedWebhookPayload {
    const body = JSON.parse(ctx.rawBody);
    return {
      merchantOrderRef: body.merchantRefNumber,
      providerTransactionId: body.fawryRefNumber,
      status: mapFawryStatus(body.orderStatus),
      amountMinor: decimalStringToMinorUnits(body.paymentAmount),
      currency: "EGP",
      webhookEventId: body.fawryRefNumber,
    };
  },

  verifyWebhookSignature(ctx: WebhookRequestContext): boolean {
    const env = getPaymentsEnv();
    const body = JSON.parse(ctx.rawBody);
    const inputString = buildNotificationSignatureInput(
      {
        fawryRefNumber: body.fawryRefNumber,
        merchantRefNumber: body.merchantRefNumber,
        paymentAmount: body.paymentAmount,
        orderAmount: body.orderAmount,
        orderStatus: body.orderStatus,
        paymentMethod: body.paymentMethod,
        paymentRefNumber: body.paymentRefNumber,
      },
      env.FAWRY_SECURE_KEY
    );
    const expected = sha256Hex(inputString);
    const provided: string = body.messageSignature ?? "";
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  },

  redactProviderPayload(ctx: WebhookRequestContext): Record<string, unknown> {
    // Confirmed notification schema (developer.fawrystaging.com) carries
    // no raw card data -- card fields only appear in the CHARGE REQUEST
    // signing formula (outbound, not received). Stored as-is.
    return JSON.parse(ctx.rawBody);
  },
};
