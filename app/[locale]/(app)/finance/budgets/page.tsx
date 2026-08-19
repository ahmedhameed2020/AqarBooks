import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import { BudgetForm, type BudgetAccount } from "./budget-form";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Layers,
  BarChart3,
  PieChart,
} from "lucide-react";

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
    title: isAr ? "الموازنات التقديرية والتخطيط المالي | AqarBooks" : "Financial Budgets | AqarBooks",
    description: isAr
      ? "إعداد وتخطيط الموازنات التقديرية للإيرادات والمصروفات حسب الفترات المالية."
      : "Planning financial budgets for revenues and expenses per fiscal period.",
  };
}

export default async function BudgetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.budgets.manage"),
    hasPermission(organization.id, "finance.reports.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "الموازنات التقديرية" : "Budgets"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على الموازنات. تواصل مع مدير النظام."
            : "You don't have permission to view budgets. Contact an administrator."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch Fiscal Periods & Default Currency
  const [{ data: periods }, { data: orgData }] = await Promise.all([
    supabase
      .from("fiscal_periods")
      .select("id, name, start_date, end_date, status")
      .eq("organization_id", organization.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const periodList = periods ?? [];
  const selectedPeriod =
    periodList.find((p) => p.id === period) ??
    periodList.find((p) => p.status === "OPEN") ??
    periodList[0];

  if (!selectedPeriod) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <h1 className="text-lg font-bold mb-1">{isAr ? "لا توجد فترات مالية معرفة" : "No Fiscal Periods Found"}</h1>
        <p className="text-xs">
          {isAr
            ? "يرجى إنشاء سنة مالية وفترات دورية من صفحة إدارة السنوات المالية أولاً."
            : "Please create a fiscal year and periods from Fiscal Periods management first."}
        </p>
      </div>
    );
  }

  // 2. Fetch Accounts & Budgets for Selected Period
  const [{ data: accounts }, { data: budgets }] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["REVENUE", "EXPENSE"])
      .order("code"),
    supabase
      .from("budgets")
      .select("account_id, amount")
      .eq("organization_id", organization.id)
      .eq("fiscal_period_id", selectedPeriod.id),
  ]);

  const budgetByAccount = new Map((budgets ?? []).map((b) => [b.account_id, Number(b.amount)]));
  const rows: BudgetAccount[] = (accounts ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name_ar: a.name_ar,
    name_en: a.name_en,
    category: a.category as "REVENUE" | "EXPENSE",
    amount: budgetByAccount.get(a.id) ?? null,
  }));

  // KPI Calculations
  let totalRevenue = 0;
  let totalExpense = 0;
  let budgetedAccountsCount = 0;

  rows.forEach((r) => {
    if (r.amount !== null && r.amount > 0) {
      budgetedAccountsCount += 1;
      if (r.category === "REVENUE") totalRevenue += r.amount;
      if (r.category === "EXPENSE") totalExpense += r.amount;
    }
  });

  const netSurplus = totalRevenue - totalExpense;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER & PERIOD SELECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "الموازنات التقديرية (Financial Budgets)" : "Financial Budgets"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {selectedPeriod.name} · {selectedPeriod.start_date} → {selectedPeriod.end_date} ·{" "}
            {isAr
              ? `تم تحديد ${budgetedAccountsCount} من ${rows.length} حساب`
              : `${budgetedAccountsCount} of ${rows.length} accounts configured`}
          </p>
        </div>

        {/* Period Switcher Form */}
        <form className="flex items-center gap-2">
          <label htmlFor="periodSelect" className="text-xs font-bold text-slate-600 dark:text-slate-400">
            {isAr ? "الفترة المالية:" : "Period:"}
          </label>
          <select
            id="periodSelect"
            name="period"
            defaultValue={selectedPeriod.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {periodList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status === "OPEN" ? (isAr ? "مفتوحة" : "Open") : p.status})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-bold px-3.5 py-2 text-xs transition-colors"
          >
            {isAr ? "عرض" : "Select"}
          </button>
        </form>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Planned Revenue */}
        <KpiCard
          label={isAr ? "إجمالي الإيرادات المقدرة" : "Planned Revenue"}
          value={
            <>
              {totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `المستهدف المالي للفترة ${selectedPeriod.name}`
              : `Target for ${selectedPeriod.name}`
          }
          icon={<TrendingUp className="size-5" />}
          tone="positive"
        />

        {/* 2. Planned Expenses */}
        <KpiCard
          label={isAr ? "إجمالي المصروفات المقدرة" : "Planned Expenses"}
          value={
            <>
              {totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `سقف الإنفاق التشغيلي والإداري المخطط`
              : `Total operating budget cap`
          }
          icon={<TrendingDown className="size-5" />}
          tone="warning"
        />

        {/* 3. Projected Surplus */}
        <KpiCard
          label={isAr ? "صافي الفائض التقديري المتوقع" : "Projected Net Margin"}
          value={
            <>
              {netSurplus >= 0 ? "+" : ""}{netSurplus.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? netSurplus >= 0 ? "فائض تشغيلي متوقع" : "عجز تقديري مخطط"
              : `Expected bottom line surplus`
          }
          icon={<Scale className="size-5" />}
          tone={netSurplus >= 0 ? "positive" : "negative"}
        />

        {/* 4. Accounts Coverage */}
        <KpiCard
          label={isAr ? "تغطية بنود الموازنة" : "Configured Accounts"}
          value={`${budgetedAccountsCount} / ${rows.length}`}
          hint={
            isAr
              ? `${Math.round((budgetedAccountsCount / (rows.length || 1)) * 100)}% من بنود الدخل محددة الأهداف`
              : `${Math.round((budgetedAccountsCount / (rows.length || 1)) * 100)}% coverage ratio`
          }
          icon={<Layers className="size-5" />}
          tone="info"
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN BUDGET FORM MATRIX
          ────────────────────────────────────────────────────────────────────────── */}
      <BudgetForm
        key={selectedPeriod.id}
        organizationId={organization.id}
        fiscalPeriodId={selectedPeriod.id}
        accounts={rows}
        currency={currency}
        locale={locale}
        canManage={canManage}
      />
    </div>
  );
}
