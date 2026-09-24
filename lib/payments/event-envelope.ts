import crypto from "node:crypto";

import type {
  NormalizedPaymentEvent,
  PaymentEnvironment,
  ProviderId,
} from "./providers/types";

export type { NormalizedPaymentEvent, PaymentEnvironment } from "./providers/types";

export type EventMismatchCode =
  | "REFERENCE_MISMATCH"
  | "PROVIDER_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "MERCHANT_MISMATCH"
  | "ENVIRONMENT_MISMATCH";

export interface PaymentTransactionSnapshot {
  id: string;
  provider: ProviderId;
  environment: PaymentEnvironment;
  amount: number;
  currency: string;
  merchantIdentifier: string;
}

export type EventValidationResult =
  | { ok: true }
  | { ok: false; code: EventMismatchCode };

function toFourDecimalUnits(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 10_000);
}

export function validateEventAgainstTransaction(
  event: NormalizedPaymentEvent,
  transaction: PaymentTransactionSnapshot,
): EventValidationResult {
  if (event.merchantOrderRef !== transaction.id) {
    return { ok: false, code: "REFERENCE_MISMATCH" };
  }
  if (event.provider !== transaction.provider) {
    return { ok: false, code: "PROVIDER_MISMATCH" };
  }
  if (event.environment !== transaction.environment) {
    return { ok: false, code: "ENVIRONMENT_MISMATCH" };
  }
  if (event.currency !== transaction.currency) {
    return { ok: false, code: "CURRENCY_MISMATCH" };
  }
  if (event.merchantIdentifier !== transaction.merchantIdentifier) {
    return { ok: false, code: "MERCHANT_MISMATCH" };
  }
  const eventAmount = toFourDecimalUnits(event.amount);
  const transactionAmount = toFourDecimalUnits(transaction.amount);
  if (eventAmount === null || transactionAmount === null || eventAmount !== transactionAmount) {
    return { ok: false, code: "AMOUNT_MISMATCH" };
  }
  return { ok: true };
}

export function fallbackEventIdentifier(
  provider: ProviderId,
  environment: PaymentEnvironment,
  rawBody: string,
): string {
  const digest = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  return `fallback:${provider}:${environment}:${digest}`;
}
