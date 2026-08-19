"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  TrendingUp,
  TrendingDown,
  Printer,
  FileSpreadsheet,
  Calendar,
  DollarSign,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface IncomeStatementRow {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category: "REVENUE" | "EXPENSE" | string;
  balance: number;
}

export function IncomeStatementClient({
  revenueRows,
  expenseRows,
  startDate,
  endDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  revenueRows: IncomeStatementRow[];
  expenseRows: IncomeStatementRow[];
  startDate: string;
  endDate: string;
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [currentStart, setCurrentStart] = useState(startDate);
  const [currentEnd, setCurrentEnd] = useState(endDate);

  const handleDateChange = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${pathname}?start=${currentStart}&end=${currentEnd}`);
  };

  const totalRevenue = revenueRows.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.balance, 0);
  const netSurplus = totalRevenue - totalExpense;
  const marginPct = totalRevenue > 0 ? Math.round((netSurplus / totalRevenue) * 100) : 0;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    const formattedRows: Record<string, any>[] = [];

    // Header 1: Revenue
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الإيرادات التشغيلية والمحققة (Revenues)" : "Operating Revenues",
      amount: totalRevenue,
    });
    revenueRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    // Header 2: Expenses
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "المصروفات والتكاليف التشغيلية (Expenses)" : "Operating Expenditures",
      amount: totalExpense,
    });
    expenseRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    generateFinancialStatementPdf(
      {
        title: isAr ? "قائمة الدخل والأرباح والخسائر" : "Income Statement (P&L)",
        subtitle: isAr ? `للفترة من ${startDate} إلى ${endDate}` : `For the period from ${startDate} to ${endDate}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", align: "start", width: "20%" },
          { header: isAr ? "البيان / اسم الحساب" : "Particulars / Account Name", key: "name", align: "start", width: "55%" },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: "25%" },
        ],
        rows: formattedRows,
        totalRow: {
          code: "",
          name: isAr ? "صافي الفائض / العجز المالي" : "Net Period Surplus / Deficit",
          amount: netSurplus,
        },
        summaries: [
          { label: isAr ? "إجمالي الإيرادات" : "Total Revenue", value: totalRevenue, highlight: true },
          { label: isAr ? "إجمالي المصروفات" : "Total Expenses", value: totalExpense },
          { label: isAr ? "صافي الفائض / العجز" : "Net Surplus", value: netSurplus, highlight: true },
          { label: isAr ? "هامش الفائض التشغيلي" : "Net Margin", value: `${marginPct}%` },
        ],
        notes: [
          isAr
            ? "تم إعداد قائمة الدخل وفقاً لمبدأ الاستحقاق المحاسبي ومعايير التقارير المالية الدولية."
            : "Prepared under the accrual basis of accounting in conformity with statutory reporting standards.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير قائمة الدخل..." : "Exporting Income Statement...",
      description: isAr ? "يتم تجهيز ملف الإكسل المنسق" : "Preparing workbook",
    });

    const exportRows: Record<string, any>[] = [];
    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الإيرادات التشغيلية" : "Operating Revenues",
      amount: totalRevenue,
    });
    revenueRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "المصروفات والتكاليف" : "Operating Expenses",
      amount: totalExpense,
    });
    expenseRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    await exportFinancialStatementToExcel(
      {
        filename: "income_statement",
        sheetName: isAr ? "قائمة الدخل" : "Income Statement",
        reportTitle: isAr ? "قائمة الدخل والأرباح والخسائر" : "Income Statement (P&L)",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", isNumber: false, width: 20 },
          { header: isAr ? "البيان / الحساب" : "Particulars / Account Name", key: "name", isNumber: false, width: 40 },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: 25 },
        ],
        rows: exportRows,
        totalRow: {
          code: "",
          name: isAr ? "صافي الفائض / العجز المالي" : "Net Surplus / Deficit",
          amount: netSurplus,
        },
        summaries: [
          { label: isAr ? "إجمالي الإيرادات" : "Total Revenue", value: totalRevenue },
          { label: isAr ? "إجمالي المصروفات" : "Total Expenses", value: totalExpense },
          { label: isAr ? "صافي الفائض" : "Net Surplus", value: netSurplus },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف قائمة الدخل" : "Income statement workbook downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR & DATE FILTER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={handleDateChange} className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-bold">{isAr ? "من:" : "From:"}</span>
            <Input
              type="date"
              value={currentStart}
              onChange={(e) => setCurrentStart(e.target.value)}
              className="text-xs h-9 w-36 font-mono font-bold"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-bold">{isAr ? "إلى:" : "To:"}</span>
            <Input
              type="date"
              value={currentEnd}
              onChange={(e) => setCurrentEnd(e.target.value)}
              className="text-xs h-9 w-36 font-mono font-bold"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs font-bold">
            {isAr ? "تحديث الفترة" : "Apply Range"}
          </Button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
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
          EXECUTIVE P&L SUMMARY CARDS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</span>
            <TrendingUp className="size-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
            {fmt(totalRevenue)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">{isAr ? "إجمالي المصروفات" : "Total Expenses"}</span>
            <TrendingDown className="size-4 text-rose-600" />
          </div>
          <div className="mt-1.5 font-mono text-xl font-black text-rose-600 dark:text-rose-400">
            {fmt(totalExpense)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm ${netSurplus >= 0 ? "border-purple-200 bg-purple-50/70 dark:border-purple-900/50 dark:bg-purple-950/40" : "border-amber-200 bg-amber-50/70 dark:border-amber-950/40"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "صافي الفائض / العجز" : "Net Surplus / Deficit"}</span>
            <DollarSign className="size-4 text-purple-600" />
          </div>
          <div className={`mt-1.5 font-mono text-xl font-black ${netSurplus >= 0 ? "text-purple-600 dark:text-purple-400" : "text-amber-600 dark:text-amber-400"}`}>
            {fmt(netSurplus)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold">{isAr ? "هامش الفائض التشغيلي" : "Operating Margin"}</span>
            <Percent className="size-4 text-blue-600" />
          </div>
          <div className="mt-1.5 font-mono text-xl font-black text-slate-900 dark:text-white">
            {marginPct}%
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STRUCTURED STATEMENT TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start w-32">{isAr ? "رمز الحساب" : "Account Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "البيان / اسم الحساب" : "Particulars / Account Name"}</th>
                <th className="p-3.5 text-end w-48">{isAr ? `المبلغ (${currency})` : `Amount (${currency})`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* 1. REVENUES */}
              <tr className="bg-emerald-50/70 dark:bg-emerald-950/30 font-black text-emerald-950 dark:text-emerald-200 border-t border-b border-emerald-200 dark:border-emerald-900">
                <td colSpan={2} className="p-3 text-sm">
                  {isAr ? "١. الإيرادات التشغيلية (Operating Revenues)" : "1. Operating Revenues"}
                </td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalRevenue)}</td>
              </tr>
              {revenueRows.length ? (
                revenueRows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-6">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                    <td className="p-3 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(r.balance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-400 text-xs ps-6">
                    {isAr ? "لا توجد إيرادات مسجلة في هذه الفترة" : "No revenue records"}
                  </td>
                </tr>
              )}

              {/* 2. EXPENSES */}
              <tr className="bg-rose-50/70 dark:bg-rose-950/30 font-black text-rose-950 dark:text-rose-200 border-t border-b border-rose-200 dark:border-rose-900">
                <td colSpan={2} className="p-3 text-sm">
                  {isAr ? "٢. المصروفات والتكاليف التشغيلية (Operating Expenditures)" : "2. Operating Expenditures"}
                </td>
                <td className="p-3 text-end font-mono text-sm">{fmt(totalExpense)}</td>
              </tr>
              {expenseRows.length ? (
                expenseRows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-6">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                    <td className="p-3 text-end font-mono font-bold text-rose-600 dark:text-rose-400">{fmt(r.balance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-slate-400 text-xs ps-6">
                    {isAr ? "لا توجد مصروفات مسجلة في هذه الفترة" : "No expense records"}
                  </td>
                </tr>
              )}
            </tbody>

            {/* GRAND NET SURPLUS FOOTER */}
            <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
              <tr>
                <td colSpan={2} className="p-4 text-start font-black text-sm">
                  {isAr ? "صافي الفائض / العجز المالي المحقق للفترة" : "Net Period Operating Surplus / Deficit"}
                </td>
                <td className="p-4 text-end font-mono text-base font-black">
                  <span className={netSurplus >= 0 ? "text-emerald-400" : "text-amber-400"}>
                    {fmt(netSurplus)} {currency}
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
