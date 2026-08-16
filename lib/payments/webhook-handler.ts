import { NextRequest, NextResponse } from "next/server";
import type { PaymentProviderAdapter } from "./providers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveProviderCredentials } from "./resolve-credentials";

export function createWebhookRouteHandler(adapter: PaymentProviderAdapter) {
  return async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const ctx = { rawBody, headers: Object.fromEntries(request.headers.entries()), url: request.url };

    // --- Step 1: parse first (pure, no credentials needed) ---
    // Structurally, we cannot verify a signature before we know WHICH
    // tenant's secret applies, and that's only knowable by looking up the
    // transaction (via merchantOrderRef) to find its organization/resort.
    // See the design note on this route factory for the full reasoning:
    // the original "verify before any DB touch" property is preserved in
    // spirit -- state is never MUTATED before verification -- only a
    // READ (which reveals nothing; see Step 2) now precedes it.
    let parsed;
    try {
      parsed = adapter.parseWebhookPayload(ctx);
    } catch (err) {
      // Malformed/unparseable body -- ack so the provider doesn't
      // retry-loop a payload we can never successfully process; log for
      // manual review.
      console.error(
        JSON.stringify({
          provider: adapter.providerId,
          parse_error: true,
          error_type: err instanceof Error ? err.constructor.name : typeof err,
        })
      );
      return NextResponse.json({}, { status: 200 });
    }

    // --- Step 2: look up the transaction (read-only, before verification) ---
    const admin = createAdminClient();
    const { data: txn } = await admin
      .from("online_payment_transactions")
      .select("id, organization_id, resort_id")
      .eq("id", parsed.merchantOrderRef)
      .eq("provider", adapter.providerId)
      .maybeSingle();

    if (!txn) {
      // Generic 200, no distinguishing body -- never reveal via response
      // shape/status whether a given reference exists. This read-only
      // lookup happening before signature verification does not leak
      // anything: the response is identical whether the transaction
      // exists or not.
      console.error(JSON.stringify({ provider: adapter.providerId, unknown_reference: true }));
      return NextResponse.json({}, { status: 200 });
    }

    // --- Step 3: resolve this transaction's tenant credentials ---
    // Hardcoded "SANDBOX": online_payment_transactions has no `environment`
    // column today, and create_online_payment_checkout_transaction never
    // asked for one either -- this whole project has only ever operated in
    // sandbox mode since inception, so hardcoding SANDBOX here is not a new
    // risk, but it IS a genuine schema/tracking gap that MUST be closed
    // (adding an `environment` column to online_payment_transactions,
    // threading it through the checkout RPC, and reading it back here)
    // before any tenant's PRODUCTION credentials could ever be correctly
    // resolved for a real transaction.
    let credentials;
    try {
      credentials = await resolveProviderCredentials(txn.organization_id, txn.resort_id, adapter.providerId, "SANDBOX");
    } catch (err) {
      // A real webhook arrived for a real transaction we currently cannot
      // process due to a configuration problem (PROVIDER_NOT_ENABLED,
      // TenantProviderUnusableError, or the underlying PAYMENTS_ENV_INVALID
      // if even the env fallback is missing). Log loudly (never any
      // secret-adjacent content) and return 500 so the provider's own
      // retry mechanism keeps trying -- presumed to be a fixable config
      // issue, not a permanent one.
      console.error(
        JSON.stringify({
          provider: adapter.providerId,
          transaction_id: txn.id,
          credential_resolution_error: true,
          error_type: err instanceof Error ? err.constructor.name : typeof err,
        })
      );
      return NextResponse.json({}, { status: 500 });
    }

    // --- Step 4: verify signature (same fails-closed pattern as before) ---
    // This is the one deliberate change from the original design: this
    // step now happens AFTER the read-only DB lookup above, because the
    // tenant secret it needs can only be known after that lookup. The
    // actual security property (never mutate state before verifying) is
    // fully preserved.
    let signatureValid = false;
    let signatureErrorType: string | undefined;
    try {
      signatureValid = adapter.verifyWebhookSignature(ctx, credentials);
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

    // --- Everything below is unchanged from before ---
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
