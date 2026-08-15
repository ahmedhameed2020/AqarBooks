import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

type MemberSummaryRow = {
  units_count: number;
  total_balance: number;
  has_arrears: boolean;
  last_payment_amount: number | null;
  last_payment_date: string | null;
};

export default async function PortalDashboardPage({
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

  // members_with_financials is security_invoker = true (verified against
  // 20260810000043) and composes through units_with_financials (also
  // security_invoker) -- this query runs under the requesting user's RLS.
  // The .eq("id", member.id) is defense in depth on top of that, not the
  // actual boundary: members_select_self already restricts visibility to
  // the caller's own row.
  const { data: summaryData, error: summaryError } = await supabase
    .from("members_with_financials")
    .select("units_count, total_balance, has_arrears, last_payment_amount, last_payment_date")
    .eq("id", member.id)
    .maybeSingle();
  if (summaryError) console.error("[PortalDashboardPage] summary query failed:", summaryError.message);

  const summary = summaryData as MemberSummaryRow | null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">
        {isAr ? `مرحبًا، ${member.full_name}` : `Welcome, ${member.full_name}`}
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-bold text-primary">{isAr ? "الرصيد الحالي" : "Current Balance"}</p>
          <Money
            amount={Number(summary?.total_balance ?? 0)}
            locale={locale}
            tone="auto"
            className="text-lg font-bold"
          />
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "عدد الوحدات" : "Units"}</p>
          <p className="text-lg font-bold text-foreground">{summary?.units_count ?? 0}</p>
        </div>
        {summary?.last_payment_amount != null && (
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{isAr ? "آخر دفعة" : "Last Payment"}</p>
            <Money amount={Number(summary.last_payment_amount)} locale={locale} className="text-lg font-bold" />
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <Link href="/portal/dues" locale={locale as Locale} className="text-sm font-medium text-primary underline">
          {isAr ? "عرض المستحقات" : "View dues"}
        </Link>
        <Link
          href="/portal/statement"
          locale={locale as Locale}
          className="text-sm font-medium text-primary underline"
        >
          {isAr ? "عرض كشف الحساب" : "View statement"}
        </Link>
        <Link href="/portal/units" locale={locale as Locale} className="text-sm font-medium text-primary underline">
          {isAr ? "عرض وحداتي" : "View units"}
        </Link>
      </div>
    </div>
  );
}
