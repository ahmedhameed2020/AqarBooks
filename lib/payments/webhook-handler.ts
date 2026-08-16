import { NextRequest, NextResponse } from "next/server";
import type { PaymentProviderAdapter } from "./providers/types";
import { createAdminClient } from "@/lib/supabase/admin";

export function createWebhookRouteHandler(adapter: PaymentProviderAdapter) {
  return async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const ctx = { rawBody, headers: Object.fromEntries(request.headers.entries()), url: request.url };

    let signatureValid = false;
    let signatureErrorType: string | undefined;
    try {
      signatureValid = adapter.verifyWebhookSignature(ctx);
    } catch (err) {
      signatureValid = false;
      signatureErrorType = err instanceof Error ? err.constructor.name : typeof err;
    }

    if (!signatureValid) {
      console.error(
        JSON.stringify({
          provider: adapter.providerId,
          signature_verified: false,
          ...(signatureErrorType ? { error_type: signatureErrorType } : {}),
        })
      );
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    let parsed;
    try {
      parsed = adapter.parseWebhookPayload(ctx);
    } catch (err) {
      // Signed but unparseable -- ack so the provider doesn't retry-loop a
      // payload we can never successfully process; log for manual review.
      console.error(
        JSON.stringify({
          provider: adapter.providerId,
          parse_error: true,
          error_type: err instanceof Error ? err.constructor.name : typeof err,
        })
      );
      return NextResponse.json({}, { status: 200 });
    }

    const admin = createAdminClient();
    const { data: txn } = await admin
      .from("online_payment_transactions")
      .select("id")
      .eq("id", parsed.merchantOrderRef)
      .eq("provider", adapter.providerId)
      .maybeSingle();

    if (!txn) {
      // Generic 200, no distinguishing body -- never reveal via response
      // shape/status whether a given reference exists.
      console.error(JSON.stringify({ provider: adapter.providerId, unknown_reference: true }));
      return NextResponse.json({}, { status: 200 });
    }

    if (parsed.status !== "SUCCESS") {
      // PENDING/FAILED/EXPIRED notifications are acknowledged but never
      // call record_online_payment -- that RPC only ever moves a
      // transaction forward on a provider-confirmed success. This
      // includes REFUNDED/PARTIAL_REFUNDED (which map to PENDING per the
      // adapter's status model -- see fawry.ts's mapFawryStatus) and
      // EXPIRED (its own distinct status, also never triggers the RPC).
      console.info(
        JSON.stringify({
          provider: adapter.providerId,
          transaction_id: txn.id,
          status: parsed.status,
          provider_status: parsed.providerStatus,
        })
      );
      return NextResponse.json({}, { status: 200 });
    }

    const redacted = adapter.redactProviderPayload(ctx);
    const { data: result, error } = await admin
      .rpc("record_online_payment", {
        p_transaction_id: txn.id,
        p_webhook_event_id: parsed.webhookEventId,
        p_provider_payload: redacted,
      })
      .single();

    if (error) {
      console.error(JSON.stringify({ provider: adapter.providerId, transaction_id: txn.id, rpc_error: true }));
      return NextResponse.json({}, { status: 500 }); // provider's own retry mechanism re-delivers
    }

    console.info(
      JSON.stringify({
        provider: adapter.providerId,
        transaction_id: txn.id,
        result_status: result?.status,
      })
    );
    return NextResponse.json({}, { status: 200 });
  };
}
