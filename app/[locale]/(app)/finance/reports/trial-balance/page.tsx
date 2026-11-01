import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Scale, AlertCircle } from "lucide-react";
import { TrialBalanceClient, type TrialBalanceRow } from "./trial-balance-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "ميزان المراجعة بالأرصدة الافتتاحية — AqarBooks"
      : "Trial Balance with Opening Balances — AqarBooks",
    description: isAr
      ? "رصيد أول المدة + حركة الفترة = رصيد آخر المدة لكل حساب، مع فحص التوازن والتصدير."
      : "Opening + period movement = closing for every account, with balance checks and export.",
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asOf?: string; from?: string }>;
}) {
  const { locale } = await params;
  const { asOf, from } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.reports.read", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const endDate = asOf && ISO_DATE.test(asOf) ? asOf : new Date().toISOString().slice(0, 10);

  // Default period start: the first day of the fiscal year that contains the end date, else 1 January.
  let startDate = from && ISO_DATE.test(from) ? from : "";
  if (!startDate) {
    const { data: fy } = await supabase
      .from("fiscal_years")
      .select("start_date")
      .eq("organization_id", organization.id)
      .lte("start_date", endDate)
      .gte("end_date", endDate)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    startDate = fy?.start_date ?? `${endDate.slice(0, 4)}-01-01`;
  }

  const { data: rowsData, error } = await supabase.rpc("get_trial_balance_with_opening", {
    p_organization_id: organization.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    return (
      <div role="alert" className="p-8 text-center space-y-2" data-testid="tb-error">
        <AlertCircle className="mx-auto size-8 text-rose-600" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? "تعذّر تحميل ميزان المراجعة" : "The trial balance could not be loaded"}
        </p>
        <p className="text-xs text-slate-500">
          {error.code === "22023"
            ? isAr ? "الفترة المختارة غير صحيحة: تاريخ النهاية قبل تاريخ البداية." : "The selected period is invalid: the end date is before the start date."
            : isAr ? "حدث خطأ أثناء قراءة البيانات. لم يُعرض أي رقم." : "An error occurred while reading the data. No figures are shown."}
        </p>
      </div>
    );
  }

  const num = (v: unknown) => Number(v ?? 0);
  const rows: TrialBalanceRow[] = ((rowsData ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => ({
      account_id: (r.account_id as string | null) ?? null,
      code: String(r.code),
      name_ar: String(r.name_ar),
      name_en: String(r.name_en),
      category: String(r.category),
      normal_balance: String(r.normal_balance),
      opening_debit: num(r.opening_debit),
      opening_credit: num(r.opening_credit),
      period_debit: num(r.period_debit),
      period_credit: num(r.period_credit),
      closing_debit: num(r.closing_debit),
      closing_credit: num(r.closing_credit),
      opening_balance: num(r.opening_balance),
      closing_balance: num(r.closing_balance),
      is_synthetic: Boolean(r.is_synthetic),
      fiscal_year_known: Boolean(r.fiscal_year_known),
    }))
    .filter((r) => r.opening_debit !== 0 || r.opening_credit !== 0 || r.period_debit !== 0 || r.period_credit !== 0 || r.closing_debit !== 0 || r.closing_credit !== 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Scale className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
              {isAr ? "ميزان المراجعة بالأرصدة الافتتاحية" : "Trial Balance with Opening Balances"}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5" data-testid="tb-period">
              {isAr
                ? `الفترة من ${startDate} إلى ${endDate}: رصيد أول المدة + حركة الفترة = رصيد آخر المدة`
                : `Period ${startDate} to ${endDate}: opening + period movement = closing`}
            </p>
          </div>
        </div>
      </div>

      <TrialBalanceClient
        rows={rows}
        startDate={startDate}
        endDate={endDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
