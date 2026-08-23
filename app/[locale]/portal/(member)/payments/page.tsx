import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalPaymentsClient, type OnlineTxnItem, type PortalPaymentItem } from "./portal-payments-client";

type PaymentRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  receipt_no: string | null;
  receipt_number: number | null;
  memo: string | null;
  unallocated_amount: number | null;
  unit_id: string | null;
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
    { data: unitsData, error: unitsError },
  ] = await Promise.all([
    adminClient.rpc("expire_stale_online_payment_transactions"),
    supabase.rpc("get_own_organization_display").maybeSingle(),
    // payments_select_own RLS already restricts this to the member's own
    // POSTED receipts, so a reversed payment can never inflate this ledger.
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number, memo, unallocated_amount, unit_id")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("online_payment_transactions")
      .select("id, amount, provider, status, failure_message, created_at")
      .eq("member_id", member.id)
      .in("status", ["PENDING", "FAILED", "EXPIRED"])
      .order("created_at", { ascending: false }),
    supabase.from("units_with_financials").select("id, code"),
  ]);

  if (sweepError) console.error("[PortalPaymentsPage] sweepError:", sweepError.message);
  if (orgError) console.error("[PortalPaymentsPage] orgError:", orgError.message);
  if (paymentsError) console.error("[PortalPaymentsPage] paymentsError:", paymentsError.message);
  if (onlineTxnError) console.error("[PortalPaymentsPage] onlineTxnError:", onlineTxnError.message);
  if (unitsError) console.error("[PortalPaymentsPage] unitsError:", unitsError.message);

  const unitCodeById = new Map<string, string>(
    ((unitsData ?? []) as { id: string; code: string }[]).map((u) => [u.id, u.code]),
  );

  const payments: PortalPaymentItem[] = ((paymentsData ?? []) as unknown as PaymentRow[]).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    method: p.method,
    receiptNo:
      p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : `PAY-${p.id.slice(0, 8)}`),
    memo: p.memo,
    // What the cashier received but has not yet applied to a specific charge:
    // an owner seeing a payment they believe settled a due deserves to know it
    // is still sitting unallocated.
    unallocated: Number(p.unallocated_amount ?? 0),
    unitCode: p.unit_id ? (unitCodeById.get(p.unit_id) ?? null) : null,
  }));

  return (
    <PortalPaymentsClient
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      payments={payments}
      onlineTxns={(onlineTxnData ?? []) as unknown as OnlineTxnItem[]}
      locale={locale}
    />
  );
}
