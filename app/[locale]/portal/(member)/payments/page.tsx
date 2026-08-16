import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import { PortalPrintReceiptButton } from "./portal-print-receipt-button";
import type { Locale } from "@/i18n/routing";
import { METHOD_LABELS, type PaymentDbRow } from "@/lib/portal/row-types";

export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  // Lazy sweep: this page is where a member checks whether their online
  // payment went through, so it's the most analogous portal-request
  // touchpoint to expire any transaction that's been left PENDING past its
  // expires_at -- same rationale as createMemberInvitationAction's sweep of
  // expire_stale_member_invitations() in lib/actions/member-portal.ts.
  // expire_stale_online_payment_transactions() is service_role-only (Phase
  // 3 hardening, unlike the invitation sweep's original unguarded version),
  // so it's called via the admin client, never the per-request RLS-scoped
  // client above. Best-effort: a failure here must never block the page.
  const adminClient = createAdminClient();
  const { error: sweepError } = await adminClient.rpc("expire_stale_online_payment_transactions");
  if (sweepError) {
    console.error("[PortalPaymentsPage] expire_stale_online_payment_transactions failed:", sweepError.message);
  }

  // get_own_organization_display (SECURITY DEFINER RPC, Task 13) returns at
  // most one row for the caller's own org -- .maybeSingle() to match. No
  // resort lookup: a payment isn't tied to one resort from the portal
  // member's perspective in a way worth building for right now.
  const [{ data: orgDisplay, error: orgError }, { data: paymentsData, error: paymentsError }] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("payments")
      .select("id, amount, payment_date, method, receipt_no, receipt_number")
      .eq("member_id", member.id)
      .order("payment_date", { ascending: false }),
  ]);
  if (orgError) console.error("[PortalPaymentsPage] organization display query failed:", orgError.message);
  if (paymentsError) console.error("[PortalPaymentsPage] payments query failed:", paymentsError.message);

  const payments = (paymentsData ?? []) as unknown as PaymentDbRow[];
  const organizationName = orgDisplay?.name ?? "";
  const currency = orgDisplay?.default_currency ?? "";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "المدفوعات" : "Payments"}</h1>
      <div className="rounded-2xl border border-border bg-background divide-y divide-border">
        {payments.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مدفوعات." : "No payments."}</p>
        )}
        {payments.map((p) => {
          const methodMeta = METHOD_LABELS[p.method];
          const methodLabel = methodMeta ? (isAr ? methodMeta.ar : methodMeta.en) : p.method;
          const receiptLabel = p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : "-");
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isAr ? "إيصال" : "Receipt"} #{receiptLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.payment_date} · {methodLabel}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Money amount={Number(p.amount)} locale={locale} className="font-bold" />
                <PortalPrintReceiptButton
                  paymentId={p.id}
                  locale={locale}
                  currency={currency}
                  organizationName={organizationName}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
