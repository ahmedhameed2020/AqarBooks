import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { PaymentDbRow } from "@/lib/portal/row-types";
import {
  PortalPaymentsClient,
  type OnlineTxnItem,
} from "./portal-payments-client";

type OnlineTxnDbRow = {
  id: string;
  amount: number;
  provider: string;
  status: string;
  failure_message: string | null;
  created_at: string;
};

export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;
  const adminClient = createAdminClient();

  const [
    { error: sweepError },
    { data: orgDisplay, error: orgError },
    { data: paymentsData, error: paymentsError },
    { data: onlineTxnData, error: onlineTxnError },
  ] = await Promise.all([
    adminClient.rpc("expire_stale_online_payment_transactions"),
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("online_payment_transactions")
      .select("id, amount, provider, status, failure_message, created_at")
      .eq("member_id", member.id)
      .in("status", ["PENDING", "FAILED", "EXPIRED"])
      .order("created_at", { ascending: false }),
  ]);

  if (sweepError) console.error("[PortalPaymentsPage] sweepError:", sweepError.message);
  if (orgError) console.error("[PortalPaymentsPage] orgError:", orgError.message);
  if (paymentsError) console.error("[PortalPaymentsPage] paymentsError:", paymentsError.message);
  if (onlineTxnError) console.error("[PortalPaymentsPage] onlineTxnError:", onlineTxnError.message);

  const payments = (paymentsData ?? []) as unknown as PaymentDbRow[];
  const onlineTxns = (onlineTxnData ?? []) as unknown as OnlineTxnItem[];
  const organizationName = orgDisplay?.name ?? "AqarBooks";
  const currency = orgDisplay?.default_currency ?? "EGP";

  return (
    <PortalPaymentsClient
      organizationName={organizationName}
      currency={currency}
      memberName={member.full_name ?? ""}
      payments={payments}
      onlineTxns={onlineTxns}
      locale={locale}
    />
  );
}
