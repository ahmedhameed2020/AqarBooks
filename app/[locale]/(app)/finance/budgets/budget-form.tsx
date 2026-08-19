"use client";

import { Fragment, useActionState, useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveBudgets } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Layers,
} from "lucide-react";
import { getCurrencyLabel } from "@/lib/currency";

export type BudgetAccount = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category: "REVENUE" | "EXPENSE";
  amount: number | null;
};

const GROUPS = [
  { category: "REVENUE" as const, labelAr: "بنود الإيرادات التقديرية", labelEn: "Planned Revenue", icon: TrendingUp, color: "text-emerald-600" },
  { category: "EXPENSE" as const, labelAr: "بنود المصروفات التقديرية", labelEn: "Planned Expenses", icon: TrendingDown, color: "text-rose-600" },
];

export function BudgetForm({
  organizationId,
  fiscalPeriodId,
  accounts,
  currency = "EGP",
  locale,
  canManage,
}: {
  organizationId: string;
  fiscalPeriodId: string;
  accounts: BudgetAccount[];
  currency?: string;
  locale: string;
  canManage: boolean;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveBudgets, {
    ok: true,
  });

  // Track live input amounts for instant summary calculation
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    accounts.forEach((a) => {
      if (a.amount !== null && a.amount !== undefined) {
        initial[a.id] = a.amount.toString();
      }
    });
    return initial;
  });

  const liveTotals = useMemo(() => {
    let totalRevenue = 0;
    let totalExpense = 0;

    accounts.forEach((a) => {
      const val = parseFloat(amounts[a.id] || "0");
      if (!isNaN(val) && val > 0) {
        if (a.category === "REVENUE") totalRevenue += val;
        if (a.category === "EXPENSE") totalExpense += val;
      }
    });

    const netSurplus = totalRevenue - totalExpense;
    return { totalRevenue, totalExpense, netSurplus };
  }, [accounts, amounts]);

  const handleAmountChange = (accountId: string, value: string) => {
    setAmounts((prev) => ({ ...prev, [accountId]: value }));
  };

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId} />

      {/* ──────────────────────────────────────────────────────────────────────────
          LIVE BUDGET PROJECTION BAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 text-xs">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-bold block mb-1">{isAr ? "إجمالي الإيرادات المقدرة:" : "Total Planned Revenue:"}</span>
            <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
              {fmt(liveTotals.totalRevenue)} <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
            </span>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <TrendingUp className="size-4" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-bold block mb-1">{isAr ? "إجمالي المصروفات المقدرة:" : "Total Planned Expenses:"}</span>
            <span className="font-mono text-base font-black text-rose-600 dark:text-rose-400">
              {fmt(liveTotals.totalExpense)} <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
            </span>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <TrendingDown className="size-4" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 flex items-center justify-between">
          <div>
            <span className="text-slate-500 font-bold block mb-1">{isAr ? "صافي الفائض التقديري المتوقع:" : "Projected Net Surplus:"}</span>
            <span className={`font-mono text-base font-black ${liveTotals.netSurplus >= 0 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
              {liveTotals.netSurplus >= 0 ? "+" : ""}{fmt(liveTotals.netSurplus)} <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
            </span>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Scale className="size-4" />
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          BUDGET ACCOUNTS TABLES
          ────────────────────────────────────────────────────────────────────────── */}
      {GROUPS.map((group) => {
        const groupAccounts = accounts.filter((a) => a.category === group.category);
        const Icon = group.icon;

        return (
          <div
            key={group.category}
            className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
          >
            <div className="bg-slate-900 text-white dark:bg-slate-800/95 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={`size-4 ${group.color}`} />
                <h3 className="font-bold text-xs">{isAr ? group.labelAr : group.labelEn}</h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-slate-700 text-slate-300">
                {groupAccounts.length} {isAr ? "حساب" : "accounts"}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="p-3 text-start w-32">{isAr ? "كود الحساب" : "Code"}</th>
                    <th className="p-3 text-start">{isAr ? "اسم الحساب (دليل الحسابات)" : "Account Name"}</th>
                    <th className="p-3 text-end w-56">{isAr ? "الموازنة التقديرية للفترة" : "Planned Budget Amount"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {groupAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد حسابات معرفة تحت هذا البند" : "No accounts found under this category"}
                      </td>
                    </tr>
                  ) : (
                    groupAccounts.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                          {a.code}
                        </td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                          {isAr ? a.name_ar : a.name_en}
                        </td>
                        <td className="p-2 text-end">
                          <div className="relative inline-block w-full max-w-[200px]">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              name={`amount_${a.id}`}
                              value={amounts[a.id] ?? ""}
                              onChange={(e) => handleAmountChange(a.id, e.target.value)}
                              disabled={!canManage}
                              placeholder={isAr ? "غير محدد" : "0.00"}
                              className="font-mono text-xs font-bold text-end ps-3 pe-12 h-9"
                              dir="ltr"
                            />
                            <div className="absolute inset-y-0 end-0 flex items-center pe-2.5 pointer-events-none text-[10px] font-bold text-slate-400">
                              {currencyLabel}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Save Action Footer */}
      {canManage && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <Link href="/finance/reports/budget-vs-actual">
            <Button type="button" variant="outline" className="text-xs font-bold gap-1.5 h-9">
              <BarChart3 className="size-3.5 text-blue-600" />
              <span>{isAr ? "تقرير مقارنة الموازنة بالفعلي (Budget vs Actual)" : "Budget vs Actual Report"}</span>
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            {state.ok === false && (
              <span className="text-xs font-semibold text-rose-600">
                {state.error === "invalid_amount"
                  ? isAr
                    ? "المبالغ يجب أن تكون أرقامًا موجبة."
                    : "Amounts must be positive numbers."
                  : isAr
                    ? `تعذّر الحفظ: ${state.error}`
                    : `Could not save: ${state.error}`}
              </span>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs gap-1.5 h-10 px-6 shadow-sm dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {pending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>{isAr ? "حفظ وتثبيت الموازنة التقديرية" : "Save Budget"}</span>
            </Button>
          </div>
        </div>
      )}

      {!canManage && (
        <p className="text-xs text-slate-500 text-center">
          {isAr
            ? "لديك صلاحية الاطلاع فقط. تحتاج صلاحية «إدارة الموازنات» لتعديل الأرقام التقديرية."
            : "You have read-only access. The manage budgets permission is required to edit figures."}
        </p>
      )}
    </form>
  );
}
