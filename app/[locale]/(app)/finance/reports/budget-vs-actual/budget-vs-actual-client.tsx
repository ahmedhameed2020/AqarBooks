"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  PieChart,
  Printer,
  FileSpreadsheet,
  Calendar,
  TrendingUp,
  TrendingDown,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface FiscalPeriodOption {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface BudgetVsActualRow {
  accountId: string;
  code: string;
  name: string;
  budget: number;
  actual: number;
  variance: number;
  category: "REVENUE" | "EXPENSE";
}

export function BudgetVsActualClient({
  periods,
  selectedPeriod,
  revenueRows,
  expenseRows,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  periods: FiscalPeriodOption[];
  selectedPeriod: FiscalPeriodOption;
  revenueRows: BudgetVsActualRow[];
  expenseRows: BudgetVsActualRow[];
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const handlePeriodChange = (periodId: string) => {
    router.push(`${pathname}?period=${periodId}`);
  };

  const totalRevenueBudget = revenueRows.reduce((s, r) => s + r.budget, 0);
  const totalRevenueActual = revenueRows.reduce((s, r) => s + r.actual, 0);
  const totalRevenueVariance = totalRevenueActual - totalRevenueBudget;

  const totalExpenseBudget = expenseRows.reduce((s, r) => s + r.budget, 0);
  const totalExpenseActual = expenseRows.reduce((s, r) => s + r.actual, 0);
  const totalExpenseVariance = totalExpenseBudget - totalExpenseActual; // positive = favourable saving

  const netBudgetSurplus = totalRevenueBudget - totalExpenseBudget;
  const netActualSurplus = totalRevenueActual - totalExpenseActual;
  const netVariance = netActualSurplus - netBudgetSurplus;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    const formattedRows: Record<string, any>[] = [];

    // Revenues
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الإيرادات التشغيلية والمحققة" : "Operating Revenues",
      budget: totalRevenueBudget,
      actual: totalRevenueActual,
      variance: totalRevenueVariance,
    });
    revenueRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: r.name,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
      });
    });

    // Expenses
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "المصروفات والتكاليف التشغيلية" : "Operating Expenses",
      budget: totalExpenseBudget,
      actual: totalExpenseActual,
      variance: totalExpenseVariance,
    });
    expenseRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: r.name,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
      });
    });

    generateFinancialStatementPdf(
      {
        title: isAr ? "تقرير مقارنة الموازنة التقديرية بالفعلي" : "Budget vs Actual Variance Report",
        subtitle: `${isAr ? "الفترة المالية:" : "Fiscal Period:"} ${selectedPeriod.name} (${selectedPeriod.start_date} → ${selectedPeriod.end_date})`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${selectedPeriod.start_date} → ${selectedPeriod.end_date}`,
        columns: [
          { header: isAr ? "كود الحساب" : "Account Code", key: "code", align: "start", width: "15%" },
          { header: isAr ? "البيان / اسم الحساب" : "Particulars / Account Name", key: "name", align: "start", width: "40%" },
          { header: isAr ? "الموازنة المعتمدة" : "Budget", key: "budget", isNumber: true, width: "15%" },
          { header: isAr ? "الفعلي المحقق" : "Actual", key: "actual", isNumber: true, width: "15%" },
          { header: isAr ? "الانحراف (الوفر/العجز)" : "Variance", key: "variance", isNumber: true, width: "15%" },
        ],
        rows: formattedRows,
        totalRow: {
          code: "",
          name: isAr ? "صافي الفائض المالي (الموازنة مقابل الفعلي)" : "Net Period Variance",
          budget: netBudgetSurplus,
          actual: netActualSurplus,
          variance: netVariance,
        },
        summaries: [
          { label: isAr ? "صافي الفعلي" : "Net Actual", value: netActualSurplus, highlight: true },
          { label: isAr ? "صافي الموازنة" : "Net Budget", value: netBudgetSurplus },
          { label: isAr ? "صافي الانحراف" : "Net Variance", value: netVariance, highlight: true },
        ],
        notes: [
          isAr
            ? "الانحراف الموجب في الإيرادات يعني زيادة في التحصيل، والانحراف الموجب في المصروفات يعني وفراً في الصرف."
            : "Positive variance in revenue denotes higher collection; positive variance in expense denotes savings.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير تقرير الموازنة..." : "Exporting Budget Analysis...",
      description: isAr ? "يتم تجهيز ملف الإكسل" : "Preparing workbook",
    });

    const exportRows: Record<string, any>[] = [];
    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الإيرادات" : "Revenues",
      budget: totalRevenueBudget,
      actual: totalRevenueActual,
      variance: totalRevenueVariance,
    });
    revenueRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: r.name,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
      });
    });

    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "المصروفات" : "Expenses",
      budget: totalExpenseBudget,
      actual: totalExpenseActual,
      variance: totalExpenseVariance,
    });
    expenseRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: r.name,
        budget: r.budget,
        actual: r.actual,
        variance: r.variance,
      });
    });

    await exportFinancialStatementToExcel(
      {
        filename: `budget_vs_actual_${selectedPeriod.name.replace(/\s+/g, "_")}`,
        sheetName: isAr ? "الموازنة والفعلي" : "Budget vs Actual",
        reportTitle: `${isAr ? "مقارنة الموازنة التقديرية بالفعلي" : "Budget vs Actual Variance Report"} — ${selectedPeriod.name}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${selectedPeriod.start_date} → ${selectedPeriod.end_date}`,
        columns: [
          { header: isAr ? "كود الحساب" : "Account Code", key: "code", isNumber: false, width: 18 },
          { header: isAr ? "اسم الحساب" : "Account Name", key: "name", isNumber: false, width: 38 },
          { header: isAr ? "الموازنة" : "Budget", key: "budget", isNumber: true, width: 18 },
          { header: isAr ? "الفعلي" : "Actual", key: "actual", isNumber: true, width: 18 },
          { header: isAr ? "الانحراف" : "Variance", key: "variance", isNumber: true, width: 18 },
        ],
        rows: exportRows,
        totalRow: {
          code: "",
          name: isAr ? "صافي الفائض / الانحراف" : "Net Variance",
          budget: netBudgetSurplus,
          actual: netActualSurplus,
          variance: netVariance,
        },
        summaries: [
          { label: isAr ? "صافي الفعلي" : "Net Actual", value: netActualSurplus },
          { label: isAr ? "صافي الموازنة" : "Net Budget", value: netBudgetSurplus },
          { label: isAr ? "صافي الانحراف" : "Net Variance", value: netVariance },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل تقرير الموازنة والفعلي" : "Budget report downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR & PERIOD SELECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Calendar className="size-4 text-purple-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "الفترة المالية:" : "Fiscal Period:"}</span>
          <select
            value={selectedPeriod.id}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs font-bold text-slate-900 dark:text-white"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.start_date} → {p.end_date}) {p.status === "OPEN" ? (isAr ? "— مفتوحة" : "— Open") : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            onClick={handleExportPdf}
            variant="outline"
            size="sm"
            className="h-9 text-xs font-bold gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / تصدير PDF" : "Print / PDF"}</span>
          </Button>

          <Button
            onClick={handleExportExcel}
            size="sm"
            className="h-9 text-xs font-bold gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
          >
            <FileSpreadsheet className="size-3.5" />
            <span>{isAr ? "تصدير إكسل (Excel)" : "Export Excel"}</span>
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE VARIANCE KPIS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "صافي الفائض الفعلي المحقق" : "Actual Net Surplus"}</span>
          <div className={`mt-1 font-mono text-xl font-black ${netActualSurplus >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
            {fmt(netActualSurplus)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "صافي الفائض المستهدف بالموازنة" : "Budgeted Net Surplus"}</span>
          <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-white">
            {fmt(netBudgetSurplus)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm ${netVariance >= 0 ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/40"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${netVariance >= 0 ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
              {isAr ? "صافي الانحراف المالي" : "Net Variance (Outcome)"}
            </span>
            {netVariance >= 0 ? <TrendingUp className="size-4 text-emerald-600" /> : <TrendingDown className="size-4 text-rose-600" />}
          </div>
          <div className={`mt-1 font-mono text-lg font-black ${netVariance >= 0 ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
            {netVariance >= 0 ? (isAr ? `وفر إيجابي: +${fmt(netVariance)}` : `Favourable: +${fmt(netVariance)}`) : (isAr ? `عجز: ${fmt(netVariance)}` : `Unfavourable: ${fmt(netVariance)}`)}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STRUCTURED BUDGET VS ACTUAL TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start w-28">{isAr ? "رمز الحساب" : "Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "اسم الحساب" : "Account Name"}</th>
                <th className="p-3.5 text-end w-36">{isAr ? `الموازنة (${currency})` : `Budget (${currency})`}</th>
                <th className="p-3.5 text-end w-36">{isAr ? `الفعلي (${currency})` : `Actual (${currency})`}</th>
                <th className="p-3.5 text-end w-36">{isAr ? "الانحراف (النتيجة)" : "Variance"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* 1. REVENUES */}
              <tr className="bg-emerald-50/70 dark:bg-emerald-950/30 font-black text-emerald-950 dark:text-emerald-200 border-t border-b border-emerald-200 dark:border-emerald-900">
                <td colSpan={2} className="p-3 text-sm">
                  {isAr ? "١. الإيرادات التشغيلية (Revenues)" : "1. Operating Revenues"}
                </td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalRevenueBudget)}</td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalRevenueActual)}</td>
                <td className="p-3 text-end font-mono text-sm font-black">
                  <span className={totalRevenueVariance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {totalRevenueVariance >= 0 ? `+${fmt(totalRevenueVariance)}` : fmt(totalRevenueVariance)}
                  </span>
                </td>
              </tr>
              {revenueRows.length ? (
                revenueRows.map((r) => (
                  <tr key={r.accountId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-6">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{r.name}</td>
                    <td className="p-3 text-end font-mono text-slate-600 dark:text-slate-300">{fmt(r.budget)}</td>
                    <td className="p-3 text-end font-mono font-bold text-slate-900 dark:text-white">{fmt(r.actual)}</td>
                    <td className="p-3 text-end font-mono font-bold">
                      <span className={r.variance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {r.variance >= 0 ? `+${fmt(r.variance)}` : fmt(r.variance)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-400 text-xs ps-6">
                    {isAr ? "لا توجد بنود إيرادات معرفة في الموازنة" : "No revenue budget lines"}
                  </td>
                </tr>
              )}

              {/* 2. EXPENSES */}
              <tr className="bg-rose-50/70 dark:bg-rose-950/30 font-black text-rose-950 dark:text-rose-200 border-t border-b border-rose-200 dark:border-rose-900">
                <td colSpan={2} className="p-3 text-sm">
                  {isAr ? "٢. المصروفات والتكاليف التشغيلية (Expenses)" : "2. Operating Expenses"}
                </td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalExpenseBudget)}</td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalExpenseActual)}</td>
                <td className="p-3 text-end font-mono text-sm font-black">
                  <span className={totalExpenseVariance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {totalExpenseVariance >= 0 ? `+${fmt(totalExpenseVariance)}` : fmt(totalExpenseVariance)}
                  </span>
                </td>
              </tr>
              {expenseRows.length ? (
                expenseRows.map((r) => (
                  <tr key={r.accountId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-6">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{r.name}</td>
                    <td className="p-3 text-end font-mono text-slate-600 dark:text-slate-300">{fmt(r.budget)}</td>
                    <td className="p-3 text-end font-mono font-bold text-slate-900 dark:text-white">{fmt(r.actual)}</td>
                    <td className="p-3 text-end font-mono font-bold">
                      <span className={r.variance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {r.variance >= 0 ? `+${fmt(r.variance)}` : fmt(r.variance)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-slate-400 text-xs ps-6">
                    {isAr ? "لا توجد بنود مصروفات معرفة في الموازنة" : "No expense budget lines"}
                  </td>
                </tr>
              )}
            </tbody>

            {/* GRAND SUMMARY FOOTER */}
            <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
              <tr>
                <td colSpan={2} className="p-4 text-start font-black text-sm">
                  {isAr ? "صافي الفائض المالي المحقق / المستهدف" : "Net Period Position"}
                </td>
                <td className="p-4 text-end font-mono text-sm text-slate-300">{fmt(netBudgetSurplus)}</td>
                <td className="p-4 text-end font-mono text-sm text-slate-300">{fmt(netActualSurplus)}</td>
                <td className="p-4 text-end font-mono text-base font-black">
                  <span className={netVariance >= 0 ? "text-emerald-400" : "text-amber-400"}>
                    {netVariance >= 0 ? `+${fmt(netVariance)}` : fmt(netVariance)} {currency}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
