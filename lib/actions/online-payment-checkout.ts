"use server";

import { z } from "zod";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { createClient } from "@/lib/supabase/server";
import { fawryAdapter } from "@/lib/payments/providers/fawry";
import { resolveProviderCredentials } from "@/lib/payments/resolve-credentials";
// paymobAdapter intentionally NOT imported here -- see Task 3's status
// note. Wiring it in requires an explicit follow-up task, not just adding
// an import here.

const inputSchema = z.object({
  dueIds: z.array(z.string().uuid()).min(1),
  // "PAYMOB" intentionally excluded from this enum -- Task 3 ships the
  // adapter as contract-tests-only. Add it back only alongside the
  // follow-up task that re-enables it for production.
  provider: z.enum(["FAWRY"]),
});

// The RPC's shape (see supabase/migrations/20260816000001_...):
// returns table (transaction_id uuid, amount numeric(19,4))
interface CheckoutTransactionRow {
  transaction_id: string;
  amount: number | string;
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
    })
    .single<CheckoutTransactionRow>();

  if (error || !data) {
    return { error: "CHECKOUT_TRANSACTION_FAILED" as const, message: error?.message };
  }

  // Only FAWRY is wired -- parsed.data.provider is already narrowed to
  // the "FAWRY" literal by inputSchema's z.enum(["FAWRY"]) above.
  const adapter = fawryAdapter;

  // property_id is read back off the transaction row that
  // create_online_payment_checkout_transaction just inserted -- not
  // supplied by the client. That RPC (SECURITY INVOKER) derives it
  // entirely from public.current_member_id() and the requested dues'
  // already-validated unit_ownerships/resort matching, never from
  // unvalidated request input, and the row is only readable here via the
  // online_payment_transactions_select_own RLS policy (this member's own
  // session, own row). organizationId (memberContext.member.organization_id)
  // is equally trustworthy, coming straight from getPortalMemberContext()'s
  // own membership lookup. So both IDs passed to resolveProviderCredentials
  // below are safe: neither is unvalidated client input.
  const { data: txnScope } = await supabase
    .from("online_payment_transactions")
    .select("property_id")
    .eq("id", data.transaction_id)
    .single();

  let credentials;
  try {
    // Hardcoded "SANDBOX": online_payment_transactions has no `environment`
    // column yet (see lib/payments/webhook-handler.ts's matching note) --
    // this project has only ever operated in sandbox mode, so this is not
    // a new risk, but it is a real gap that must be closed before any
    // tenant's PRODUCTION credentials could be resolved here.
    credentials = await resolveProviderCredentials(
      memberContext.member.organization_id,
      txnScope?.property_id ?? null,
      "FAWRY",
      "SANDBOX"
    );
  } catch (err) {
    return {
      error: "PROVIDER_CHECKOUT_FAILED" as const,
      message: (err as Error).message,
    };
  }

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

  if (checkout.providerReference) {
    await supabase
      .from("online_payment_transactions")
      .update({ provider_reference: checkout.providerReference })
      .eq("id", data.transaction_id);
  }

  return { redirectUrl: checkout.redirectUrl };
}
