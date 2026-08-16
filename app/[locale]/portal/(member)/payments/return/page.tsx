import { redirect } from "next/navigation";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { createClient } from "@/lib/supabase/server";
import { PaymentStatusPoller } from "./payment-status-poller";

export default async function PaymentReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ txn?: string }>;
}) {
  const { locale } = await params;
  const { txn } = await searchParams;

  // getPortalMemberContext() returns a discriminated union
  // ({ status: "unauthenticated" | "not_a_member" | "org_suspended" | "ok", member? }),
  // not a bare truthy/falsy value -- matches the pattern already used in
  // lib/actions/online-payment-checkout.ts and the (member) layout. The
  // surrounding (member) layout already redirects on a non-"ok" status, but
  // this page re-checks (defense in depth), same as the dashboard/payments
  // pages under this same layout.
  const memberContext = await getPortalMemberContext();
  if (memberContext.status !== "ok") {
    redirect("/portal/login");
  }
  if (!txn) {
    redirect("/portal");
  }

  const supabase = await createClient();
  // RLS (Phase 3) already restricts this to the calling member's own
  // transactions -- no admin client, no elevated read here.
  const { data: transaction } = await supabase
    .from("online_payment_transactions")
    .select("id, status")
    .eq("id", txn)
    .single();

  if (!transaction) {
    redirect("/portal");
  }

  // Initial server-rendered state is itself derived from the DB row, never
  // from any ?status=/?success= query param the provider's redirect might
  // have appended -- those are read by nothing in this file.
  return <PaymentStatusPoller transactionId={transaction.id} initialStatus={transaction.status} locale={locale} />;
}
