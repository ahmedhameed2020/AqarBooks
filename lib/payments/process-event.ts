import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateEventAgainstTransaction,
  type NormalizedPaymentEvent,
  type PaymentTransactionSnapshot,
} from "./event-envelope";

export type PaymentEventProcessResult =
  | { status: "PROCESSED" | "IDEMPOTENT" | "IGNORED"; code: string }
  | { status: "QUARANTINED" | "RETRYABLE_ERROR" | "PERMANENT_ERROR"; code: string };

export interface ProcessablePaymentEvent {
  id: string;
  transaction_id: string | null;
  signature_verified: boolean;
  processing_status: string;
  attempt_count: number;
  redacted_payload: unknown;
}

export interface PaymentEventProcessorDependencies {
  claim(eventId: string): Promise<ProcessablePaymentEvent | null>;
  getTransaction(id: string): Promise<(PaymentTransactionSnapshot & { status: string }) | null>;
  recordPayment(transactionId: string, eventId: string): Promise<{ status: string }>;
  complete(eventId: string, status: string, code: string | null, nextAttemptAt?: string): Promise<void>;
}

function retryAt(): string {
  return new Date(Date.now() + 5 * 60_000).toISOString();
}

export async function processPaymentEvent(
  eventId: string,
  dependencies: PaymentEventProcessorDependencies = defaultDependencies(),
): Promise<PaymentEventProcessResult> {
  const event = await dependencies.claim(eventId);
  if (!event) return { status: "IDEMPOTENT", code: "EVENT_ALREADY_CLAIMED_OR_COMPLETE" };

  if (event.attempt_count >= 10) {
    await dependencies.complete(event.id, "PERMANENT_ERROR", "RETRY_LIMIT_EXHAUSTED");
    return { status: "PERMANENT_ERROR", code: "RETRY_LIMIT_EXHAUSTED" };
  }

  if (!event.signature_verified) {
    await dependencies.complete(event.id, "QUARANTINED", "INVALID_SIGNATURE");
    return { status: "QUARANTINED", code: "INVALID_SIGNATURE" };
  }
  if (!event.transaction_id) {
    await dependencies.complete(event.id, "QUARANTINED", "UNKNOWN_REFERENCE");
    return { status: "QUARANTINED", code: "UNKNOWN_REFERENCE" };
  }

  const transaction = await dependencies.getTransaction(event.transaction_id);
  if (!transaction) {
    await dependencies.complete(event.id, "QUARANTINED", "UNKNOWN_REFERENCE");
    return { status: "QUARANTINED", code: "UNKNOWN_REFERENCE" };
  }
  if (transaction.status === "PAID") {
    await dependencies.complete(event.id, "IGNORED", "TRANSACTION_ALREADY_PAID");
    return { status: "IDEMPOTENT", code: "TRANSACTION_ALREADY_PAID" };
  }

  const normalized = event.redacted_payload as NormalizedPaymentEvent;
  const validation = validateEventAgainstTransaction(normalized, transaction);
  if (!validation.ok) {
    await dependencies.complete(event.id, "QUARANTINED", validation.code);
    return { status: "QUARANTINED", code: validation.code };
  }
  if (normalized.status !== "SUCCESS") {
    await dependencies.complete(event.id, "IGNORED", `PROVIDER_STATUS_${normalized.status}`);
    return { status: "IGNORED", code: `PROVIDER_STATUS_${normalized.status}` };
  }

  try {
    await dependencies.recordPayment(transaction.id, event.id);
    await dependencies.complete(event.id, "PROCESSED", null);
    return { status: "PROCESSED", code: "PAYMENT_POSTED" };
  } catch {
    await dependencies.complete(event.id, "RETRYABLE_ERROR", "PAYMENT_POSTING_FAILED", retryAt());
    return { status: "RETRYABLE_ERROR", code: "PAYMENT_POSTING_FAILED" };
  }
}

function defaultDependencies(): PaymentEventProcessorDependencies {
  const admin = createAdminClient();
  return {
    async claim(eventId) {
      const { data, error } = await admin.rpc("claim_online_payment_events", {
        p_limit: 1,
        p_event_id: eventId,
      });
      if (error) throw new Error("PAYMENT_EVENT_CLAIM_FAILED");
      return (data?.[0] as ProcessablePaymentEvent | undefined) ?? null;
    },
    async getTransaction(id) {
      const { data, error } = await admin
        .from("online_payment_transactions")
        .select("id, provider, environment, amount, currency, provider_merchant_identifier_snapshot, status")
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return {
        id: data.id,
        provider: data.provider,
        environment: data.environment,
        amount: Number(data.amount),
        currency: data.currency,
        merchantIdentifier: data.provider_merchant_identifier_snapshot ?? "",
        status: data.status,
      };
    },
    async recordPayment(transactionId, claimedEventId) {
      const { data, error } = await admin.rpc("record_online_payment", {
        p_transaction_id: transactionId,
        p_webhook_event_id: claimedEventId,
        p_provider_payload: null,
      }).single();
      if (error || !data) throw new Error("PAYMENT_POSTING_FAILED");
      return { status: data.status };
    },
    async complete(claimedEventId, status, code, nextAttemptAt) {
      const { error } = await admin.rpc("complete_online_payment_event", {
        p_event_id: claimedEventId,
        p_processing_status: status,
        p_last_error_code: code,
        p_next_attempt_at: nextAttemptAt ?? null,
      });
      if (error) throw new Error("PAYMENT_EVENT_COMPLETION_FAILED");
    },
  };
}
