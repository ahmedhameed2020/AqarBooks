import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import { PortalPrintReceiptButton } from "./portal-print-receipt-button";
import type { Locale } from "@/i18n/routing";
import { METHOD_LABELS, type PaymentDbRow } from "@/lib/portal/row-types";

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
  // client above. Best-effort: a failure here must never block the page --
  // run it alongside the page's real data fetches in the Promise.all below
  // rather than awaiting it standalone first, so it doesn't add a serial
  // round-trip to every load.
  const adminClient = createAdminClient();

  // get_own_organization_display (SECURITY DEFINER RPC, Task 13) returns at
  // most one row for the caller's own org -- .maybeSingle() to match. No
  // resort lookup: a payment isn't tied to one resort from the portal
  // member's perspective in a way worth building for right now.
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
    // Non-terminal/failed online-payment attempts that never (yet) produced a
    // payments row -- PAID is excluded on purpose, it already shows up via
    // the payments query above and double-listing it would be confusing.
    // Only status/amount/provider/failure_message/timestamps are selected;
    // provider_payload (raw webhook JSONB) must never reach this page.
    supabase
      .from("online_payment_transactions")
      .select("id, amount, provider, status, failure_message, created_at")
      .eq("member_id", member.id)
      .in("status", ["PENDING", "FAILED", "EXPIRED"])
      .order("created_at", { ascending: false }),
  ]);
  if (sweepError) {
    console.error("[PortalPaymentsPage] expire_stale_online_payment_transactions failed:", sweepError.message);
  }
  if (orgError) console.error("[PortalPaymentsPage] organization display query failed:", orgError.message);
  if (paymentsError) console.error("[PortalPaymentsPage] payments query failed:", paymentsError.message);
  if (onlineTxnError) {
    console.error("[PortalPaymentsPage] online_payment_transactions query failed:", onlineTxnError.message);
  }

  const payments = (paymentsData ?? []) as unknown as PaymentDbRow[];
  const onlineTxns = (onlineTxnData ?? []) as unknown as OnlineTxnDbRow[];
  const organizationName = orgDisplay?.name ?? "";
  const currency = orgDisplay?.default_currency ?? "";

  const ONLINE_TXN_STATUS_META: Record<string, { ar: string; en: string; badgeClass: string }> = {
    PENDING: {
      ar: "قيد المعالجة",
      en: "Processing",
      badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    },
    FAILED: {
      ar: "فشلت عملية الدفع",
      en: "Payment failed",
      badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
    EXPIRED: {
      ar: "انتهت صلاحية عملية الدفع",
      en: "Payment session expired",
      badgeClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    },
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "المدفوعات" : "Payments"}</h1>

      {onlineTxns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {isAr ? "محاولات الدفع الإلكتروني الأخيرة" : "Recent online payment attempts"}
          </h2>
          <div className="rounded-2xl border border-border bg-background divide-y divide-border">
            {onlineTxns.map((t) => {
              const meta = ONLINE_TXN_STATUS_META[t.status] ?? {
                ar: t.status,
                en: t.status,
                badgeClass: "bg-slate-100 text-slate-600",
              };
              // failure_message is always set by record_online_payment's own
              // format(...) calls (short, human-readable text describing why
              // posting failed -- see
              // supabase/migrations/20260815000007b_record_online_payment_lock_ordering_fix.sql),
              // never raw provider payload, so it's safe to render directly.
              // Still shown only for FAILED, and only when present.
              const showFailureDetail = t.status === "FAILED" && !!t.failure_message;
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {isAr ? meta.ar : meta.en}
                      <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}>
                        {t.status}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US")} · {t.provider}
                    </p>
                    {showFailureDetail && <p className="text-xs text-red-600 dark:text-red-400">{t.failure_message}</p>}
                  </div>
                  <Money amount={Number(t.amount)} locale={locale} className="font-bold" />
                </div>
              );
            })}
          </div>
        </div>
      )}

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
