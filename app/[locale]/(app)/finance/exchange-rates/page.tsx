import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { RatesClient, type RateRow } from "./rates-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "أسعار الصرف | AqarBooks" : "Exchange Rates | AqarBooks",
    description: isAr
      ? "سجل أسعار الصرف المستعملة في تحويل المبالغ الأجنبية إلى عملة المؤسسة."
      : "The rate registry used to convert foreign amounts into the organisation's currency.",
  };
}

export default async function ExchangeRatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.fx.manage"),
    hasPermission(organization.id, "finance.fx.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-start">
        <h1 className="text-xl font-bold text-red-900">
          {isAr ? "أسعار الصرف" : "Exchange Rates"}
        </h1>
        <p className="text-sm text-red-700">
          {isAr
            ? "لا تملك صلاحية الاطلاع على أسعار الصرف."
            : "You do not have permission to view exchange rates."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("list_exchange_rates", {
    p_organization_id: organization.id,
  });
  const rates = (data ?? []) as unknown as RateRow[];
  const base = organization.default_currency ?? "EGP";

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 text-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "أسعار الصرف والعملات المتعددة" : "Multi-Currency & Exchange Rates"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {base} (Base)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? `سجل أسعار صرف العملات الأجنبية مقابل عملة المؤسسة الأساسية (${base}) لتقييم القيود والفواتير بدقة.`
              : `Exchange rates registry against your organization's base currency (${base}) for multi-currency transaction valuation.`}
          </p>
        </div>
      </div>

      {/* Main Interactive Rates Client */}
      <RatesClient
        rates={rates}
        baseCurrency={base}
        canManage={canManage}
        locale={locale}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </div>
  );
}
