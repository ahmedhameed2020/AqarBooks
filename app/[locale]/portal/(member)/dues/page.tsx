import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";
import type { DueDbRow } from "@/lib/portal/row-types";
import { DuesCheckout } from "./dues-checkout";
import { CreditCard, Landmark, ShieldCheck } from "lucide-react";

export default async function PortalDuesPage({
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

  const [
    { data: orgDisplay },
    { data: duesData, error: duesError },
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .order("due_date", { ascending: true }),
  ]);

  if (duesError) console.error("[PortalDuesPage] dues query failed:", duesError.message);

  const dues = (duesData ?? []) as unknown as DueDbRow[];
  const totalOpen = dues.reduce((sum, d) => sum + Number(d.amount), 0);
  const organizationName = orgDisplay?.name ?? "AqarBooks";
  const currency = orgDisplay?.default_currency ?? "EGP";

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAr ? "المستحقات والفواتير المفتوحة" : "Open Financial Dues"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAr
              ? "استعراض المطالبات المالية وسدادها مباشرة عبر بوابات الدفع الإلكتروني المعتمدة."
              : "Review outstanding dues and pay directly through certified secure gateways."}
          </p>
        </div>

        {totalOpen > 0 && (
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
            <div className="size-10 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Landmark className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {isAr ? "إجمالي المستحق المفتوح" : "Total Open Dues"}
              </p>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums">
                <Money amount={totalOpen} locale={locale} tone="negative" />
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Checkout Component */}
      <DuesCheckout
        dues={dues}
        organizationName={organizationName}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
