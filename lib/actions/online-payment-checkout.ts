"use server";

import { z } from "zod";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fawryAdapter } from "@/lib/payments/providers/fawry";
import { selectCheckoutProviderCredentials } from "@/lib/payments/resolve-credentials";
// paymobAdapter intentionally NOT imported here -- see Task 3's status
// note. Wiring it in requires an explicit follow-up task, not just adding
// an import here.

const inputSchema = z.object({
  dueIds: z.array(z.string().uuid()).min(1),
  // "PAYMOB" intentionally excluded from this enum -- Task 3 ships the
  // adapter as contract-tests-only. Add it back only alongside the
  // follow-up task that re-enables it for production.
  provider: z.enum(["FAWRY"]),
  clientRequestId: z.string().uuid(),
});

// The RPC's shape (see supabase/migrations/20260816000001_...):
// returns table (transaction_id uuid, amount numeric(19,4))
interface CheckoutTransactionRow {
  transaction_id: string;
  amount: number | string;
  is_replay: boolean;
  provider_reference: string | null;
}

export async function createOnlinePaymentCheckoutAction(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "INVALID_INPUT" as const };
  }

  // getPortalMemberContext() returns a discriminated union
  // ({ status: "unauthenticated" | "not_a_member" | "org_suspended" | "ok", member? })
  // -- not a bare truthy/falsy value, and its "ok" member shape is only
  // { id, full_name, organization_id } (no email/phone). Adapted below:
  // treat any non-"ok" status as unauthenticated for this action's
  // purposes, and fetch email/phone separately.
  const memberContext = await getPortalMemberContext();
  if (memberContext.status !== "ok") {
    return { error: "NOT_AUTHENTICATED" as const };
  }

  const supabase = await createClient();

  const { data: dueScopes, error: dueScopeError } = await supabase
    .from("dues")
    .select("id, organization_id, property_id")
    .in("id", parsed.data.dueIds);
  const propertyIds = new Set((dueScopes ?? []).map((due) => due.property_id));
  if (
    dueScopeError ||
    dueScopes?.length !== parsed.data.dueIds.length ||
    propertyIds.size !== 1 ||
    dueScopes.some((due) => due.organization_id !== memberContext.member.organization_id)
  ) {
    return { error: "INVALID_DUE_SCOPE" as const };
  }
  const propertyId = propertyIds.values().next().value as string;

  let credentials;
  try {
    credentials = await selectCheckoutProviderCredentials(
      memberContext.member.organization_id,
      propertyId,
      "FAWRY",
    );
  } catch (err) {
    return { error: "PROVIDER_CHECKOUT_FAILED" as const, message: (err as Error).message };
  }

  // members.email/members.phone are both nullable columns and aren't
  // selected by getPortalMemberContext() -- fetch them directly (covered by
  // the same members_select_self RLS policy that already lets this member
  // read their own row). Fall back to the authenticated user's auth email
  // (always present for a signed-in session) if members.email is null,
  // since Fawry's createCheckout requires a non-null memberEmail.
  const { data: contactRow } = await supabase
    .from("members")
    .select("email, phone")
    .eq("id", memberContext.member.id)
    .maybeSingle();

  let memberEmail = contactRow?.email ?? null;
  if (!memberEmail) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    memberEmail = user?.email ?? null;
  }
  if (!memberEmail) {
    return { error: "MEMBER_EMAIL_MISSING" as const };
  }

  const { data, error } = await supabase
    .rpc("create_online_payment_checkout_transaction", {
      p_due_ids: parsed.data.dueIds,
      p_provider: parsed.data.provider,
      p_environment: credentials.environment,
      p_provider_settings_id: credentials.settingsId,
      p_client_request_id: parsed.data.clientRequestId,
    })
    .single<CheckoutTransactionRow>();

  if (error || !data) {
    return { error: "CHECKOUT_TRANSACTION_FAILED" as const, message: error?.message };
  }

  if (data.is_replay) {
    return {
      error: "CHECKOUT_ALREADY_PENDING" as const,
      providerReference: data.provider_reference,
    };
  }

  // Only FAWRY is wired -- parsed.data.provider is already narrowed to
  // the "FAWRY" literal by inputSchema's z.enum(["FAWRY"]) above.
  const adapter = fawryAdapter;

  let checkout;
  try {
    checkout = await adapter.createCheckout(
      {
        transactionId: data.transaction_id,
        amount: Number(data.amount),
        memberEmail,
        memberPhone: contactRow?.phone ?? null,
        merchantOrderRef: data.transaction_id,
      },
      credentials
    );
  } catch (err) {
    // The transaction row already exists as PENDING with a set expires_at
    // -- it will be swept to EXPIRED by expire_stale_online_payment_transactions()
    // if the provider call keeps failing. No compensating delete needed;
    // Phase 3's immutability trigger already treats this as the correct
    // terminal outcome for an unusable checkout attempt.
    return { error: "PROVIDER_CHECKOUT_FAILED" as const, message: (err as Error).message };
  }

  const { error: finalizeError } = await createAdminClient().rpc(
    "mark_online_payment_checkout_created",
    {
      p_transaction_id: data.transaction_id,
      p_provider_reference: checkout.providerReference,
    },
  );
  if (finalizeError) {
    return { error: "CHECKOUT_FINALIZATION_FAILED" as const };
  }

  return { redirectUrl: checkout.redirectUrl };
}
