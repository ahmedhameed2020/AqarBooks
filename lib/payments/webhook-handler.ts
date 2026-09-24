import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackEventIdentifier } from "./event-envelope";
import { processPaymentEvent } from "./process-event";
import { resolveProviderCredentialsBySettings } from "./resolve-credentials";
import type { PaymentProviderAdapter } from "./providers/types";

export function createWebhookRouteHandler(adapter: PaymentProviderAdapter) {
  return async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const ctx = { rawBody, headers: Object.fromEntries(request.headers.entries()), url: request.url };
    let parsed;
    try {
      parsed = adapter.parseWebhookPayload(ctx);
    } catch (error) {
      console.error(JSON.stringify({ provider: adapter.providerId, code: "MALFORMED_WEBHOOK", error_type: error instanceof Error ? error.constructor.name : typeof error }));
      return NextResponse.json({}, { status: 200 });
    }

    const admin = createAdminClient();
    const { data: txn } = await admin.from("online_payment_transactions")
      .select("id, organization_id, property_id, provider, environment, provider_settings_id")
      .eq("id", parsed.merchantOrderRef).eq("provider", adapter.providerId).maybeSingle();
    if (!txn?.provider_settings_id) {
      console.error(JSON.stringify({ provider: adapter.providerId, code: "UNKNOWN_REFERENCE" }));
      return NextResponse.json({}, { status: 200 });
    }

    let credentials;
    try {
      credentials = await resolveProviderCredentialsBySettings(txn.provider_settings_id, {
        organizationId: txn.organization_id, propertyId: txn.property_id,
        provider: txn.provider, environment: txn.environment,
      });
    } catch (error) {
      console.error(JSON.stringify({ provider: adapter.providerId, transaction_id: txn.id, code: "CREDENTIAL_RESOLUTION_FAILED", error_type: error instanceof Error ? error.constructor.name : typeof error }));
      return NextResponse.json({}, { status: 500 });
    }

    let verified = false;
    try { verified = adapter.verifyWebhookSignature(ctx, credentials); } catch { verified = false; }
    if (!verified) {
      console.error(JSON.stringify({ provider: adapter.providerId, code: "INVALID_SIGNATURE" }));
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    const normalized = adapter.normalizeWebhookEvent?.(ctx, txn.environment) ?? {
      provider: adapter.providerId, environment: txn.environment,
      eventIdentifier: parsed.webhookEventId, merchantOrderRef: parsed.merchantOrderRef,
      providerReference: parsed.providerTransactionId, status: parsed.status,
      providerStatus: parsed.providerStatus, amount: parsed.amountMinor / 100,
      currency: parsed.currency, merchantIdentifier: credentials.merchantIdentifier, occurredAt: null,
    };
    const eventIdentifier = normalized.eventIdentifier || fallbackEventIdentifier(adapter.providerId, txn.environment, rawBody);
    const payloadHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
    const { data: event, error: enqueueError } = await admin.rpc("enqueue_online_payment_event", {
      p_organization_id: txn.organization_id, p_property_id: txn.property_id,
      p_transaction_id: txn.id, p_provider: adapter.providerId,
      p_environment: txn.environment, p_event_identifier: eventIdentifier,
      p_event_type: normalized.status, p_provider_status: normalized.providerStatus,
      p_signature_verified: true, p_redacted_payload: normalized, p_payload_hash: payloadHash,
    });
    if (enqueueError || !event) {
      console.error(JSON.stringify({ provider: adapter.providerId, transaction_id: txn.id, code: "EVENT_ENQUEUE_FAILED" }));
      return NextResponse.json({}, { status: 500 });
    }

    const result = await processPaymentEvent(event.id);
    console.info(JSON.stringify({ provider: adapter.providerId, transaction_id: txn.id, event_id: event.id, result_status: result.status, result_code: result.code }));
    return NextResponse.json({}, { status: 200 });
  };
}
