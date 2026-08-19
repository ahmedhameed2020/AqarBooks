import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { PieChart, AlertCircle } from "lucide-react";
import {
  BudgetVsActualClient,
  type FiscalPeriodOption,
  type BudgetVsActualRow,
} from "./budget-vs-actual-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "الموازنة التقديرية مقابل الفعلي — عقار بوكس"
      : "Budget vs Actual Analysis — AqarBooks",
    description: isAr
      ? "مقارنة الصرف والإيراد الفعلي بالموازنات المعتمدة واحتساب الانحرافات مع التصدير الرسمي للـ PDF والإكسل."
      : "Variance analysis comparing approved fiscal budget targets to actual financial activity with PDF/Excel export.",
  };
}

function varianceOf(category: "REVENUE" | "EXPENSE", budget: number, actual: number) {
  return category === "REVENUE" ? actual - budget : budget - actual;
}

export default async function BudgetVsActualPage({
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

  const supabase = await createClient();

  const { data: periodsData } = await supabase
    .from("fiscal_periods")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .order("start_date", { ascending: false });

  const periodList = (periodsData ?? []) as FiscalPeriodOption[];
  const selectedPeriod =
    periodList.find((p) => p.id === period) ??
    periodList.find((p) => p.status === "OPEN") ??
    periodList[0];

  if (!selectedPeriod) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "الموازنة التقديرية مقابل الفعلي" : "Budget vs Actual"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا توجد فترات مالية معرفة بعد. يرجى تهيئة الفترات المالية والموازنات أولاً."
            : "No fiscal periods defined yet. Please set up fiscal periods and budgets."}
        </p>
      </div>
    );
  }

  const [{ data: trialBalance, error }, { data: budgets }] = await Promise.all([
    supabase.rpc("get_trial_balance", {
      p_organization_id: organization.id,
      p_start_date: selectedPeriod.start_date,
      p_end_date: selectedPeriod.end_date,
    }),
    supabase
      .from("budgets")
      .select("account_id, amount")
      .eq("organization_id", organization.id)
      .eq("fiscal_period_id", selectedPeriod.id),
  ]);

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "الموازنة التقديرية مقابل الفعلي" : "Budget vs Actual"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "غير مصرح لك بالاطلاع على التقارير المالية. تواصل مع مدير النظام لمنحك صلاحية «قراءة التقارير المالية»."
            : "You do not have permission to view financial reports."}
        </p>
      </div>
    );
  }

  const budgetByAccount = new Map<string, number>();
  for (const b of budgets ?? []) {
    budgetByAccount.set(b.account_id, b.amount);
  }

  const actualByAccount = new Map<string, number>();
  const accountMeta = new Map<
    string,
    { code: string; name: string; category: "REVENUE" | "EXPENSE" }
  >();
  for (const r of trialBalance ?? []) {
    if (r.category !== "REVENUE" && r.category !== "EXPENSE") continue;
    actualByAccount.set(r.account_id, r.balance);
    accountMeta.set(r.account_id, {
      code: r.code,
      name: isAr ? r.name_ar : r.name_en,
      category: r.category as "REVENUE" | "EXPENSE",
    });
  }

  const revenueRows: BudgetVsActualRow[] = [];
  const expenseRows: BudgetVsActualRow[] = [];

  const allAccountIds = new Set<string>([
    ...budgetByAccount.keys(),
    ...actualByAccount.keys(),
  ]);

  for (const id of allAccountIds) {
    const meta = accountMeta.get(id);
    if (!meta) continue;
    const budget = budgetByAccount.get(id) ?? 0;
    const actual = actualByAccount.get(id) ?? 0;
    if (budget === 0 && actual === 0) continue;

    const rowItem: BudgetVsActualRow = {
      accountId: id,
      code: meta.code,
      name: meta.name,
      budget,
      actual,
      variance: varianceOf(meta.category, budget, actual),
      category: meta.category,
    };

    if (meta.category === "REVENUE") revenueRows.push(rowItem);
    else expenseRows.push(rowItem);
  }

  revenueRows.sort((a, b) => a.code.localeCompare(b.code));
  expenseRows.sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              <PieChart className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "الموازنة التقديرية مقابل الفعلي" : "Budget vs Actual Analysis"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `مقارنة الإيرادات والمصروفات الفعلية بالموازنات التقديرية للفترة ${selectedPeriod.name}`
                  : `Variance analysis comparing approved budgets to actuals for ${selectedPeriod.name}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <BudgetVsActualClient
        periods={periodList}
        selectedPeriod={selectedPeriod}
        revenueRows={revenueRows}
        expenseRows={expenseRows}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
