"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  Landmark,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  Calendar,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface BalanceSheetAccountRow {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | string;
  balance: number;
}

export function BalanceSheetClient({
  assetRows,
  liabilityRows,
  equityRows,
  currentEarnings,
  asOfDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  assetRows: BalanceSheetAccountRow[];
  liabilityRows: BalanceSheetAccountRow[];
  equityRows: BalanceSheetAccountRow[];
  currentEarnings: number;
  asOfDate: string;
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [currentAsOf, setCurrentAsOf] = useState(asOfDate);

  const handleDateChange = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${pathname}?asOf=${currentAsOf}`);
  };

  const totalAssets = assetRows.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0);
  const baseEquity = equityRows.reduce((s, r) => s + r.balance, 0);
  const totalEquity = baseEquity + currentEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  const diff = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = diff < 0.005;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    const formattedRows: Record<string, any>[] = [];

    // 1. ASSETS
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "١. الأصول (Assets)" : "1. Total Assets",
      amount: totalAssets,
    });
    assetRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    // 2. LIABILITIES
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "٢. الخصوم والالتزامات (Liabilities)" : "2. Liabilities",
      amount: totalLiabilities,
    });
    liabilityRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    // 3. EQUITY
    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "٣. حقوق الملكية والفائض (Equity)" : "3. Equity & Earnings",
      amount: totalEquity,
    });
    equityRows.forEach((r) => {
      formattedRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });
    formattedRows.push({
      code: "—",
      name: isAr ? "صافي أرباح / فائض الفترة الحالية" : "Current Period Surplus / Earnings",
      amount: currentEarnings,
    });

    generateFinancialStatementPdf(
      {
        title: isAr ? "الميزانية العمومية وقائمة المركز المالي" : "Balance Sheet (Statement of Financial Position)",
        subtitle: isAr ? `كما في: ${asOfDate}` : `As of: ${asOfDate}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: asOfDate,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", align: "start", width: "20%" },
          { header: isAr ? "البيان / الحساب" : "Particulars / Account Name", key: "name", align: "start", width: "55%" },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: "25%" },
        ],
        rows: formattedRows,
        totalRow: {
          code: "",
          name: isAr ? "إجمالي الخصوم وحقوق الملكية" : "Total Liabilities & Equity",
          amount: totalLiabilitiesAndEquity,
        },
        summaries: [
          { label: isAr ? "إجمالي الأصول" : "Total Assets", value: totalAssets, highlight: true },
          { label: isAr ? "إجمالي الخصوم" : "Total Liabilities", value: totalLiabilities },
          { label: isAr ? "حقوق الملكية والفائض" : "Total Equity", value: totalEquity },
          { label: isAr ? "توازن المركز المالي" : "Equation Integrity", value: isBalanced ? (isAr ? "متوازن 100%" : "Balanced") : (isAr ? `فارق (${diff.toFixed(2)})` : `Diff (${diff.toFixed(2)})`) },
        ],
        notes: [
          isAr
            ? "تتطابق الأصول تماماً مع مجموع الخصوم وحقوق الملكية وفقاً للمعادلة المحاسبية الأساسية."
            : "Total Assets conform to the fundamental accounting equation (Assets = Liabilities + Equity).",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير الميزانية العمومية..." : "Exporting Balance Sheet...",
      description: isAr ? "يتم تجهيز ملف الإكسل المنسق" : "Preparing workbook",
    });

    const exportRows: Record<string, any>[] = [];
    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الأصول" : "Assets",
      amount: totalAssets,
    });
    assetRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "الخصوم والالتزامات" : "Liabilities",
      amount: totalLiabilities,
    });
    liabilityRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "حقوق الملكية" : "Equity",
      amount: totalEquity,
    });
    equityRows.forEach((r) => {
      exportRows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });
    exportRows.push({
      code: "—",
      name: isAr ? "صافي أرباح / فائض الفترة" : "Current Period Earnings",
      amount: currentEarnings,
    });

    await exportFinancialStatementToExcel(
      {
        filename: "balance_sheet",
        sheetName: isAr ? "الميزانية العمومية" : "Balance Sheet",
        reportTitle: isAr ? "الميزانية العمومية وقائمة المركز المالي" : "Balance Sheet (Financial Position)",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: asOfDate,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", isNumber: false, width: 20 },
          { header: isAr ? "البيان / الحساب" : "Particulars / Account Name", key: "name", isNumber: false, width: 40 },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: 25 },
        ],
        rows: exportRows,
        totalRow: {
          code: "",
          name: isAr ? "إجمالي الخصوم وحقوق الملكية" : "Total Liabilities & Equity",
          amount: totalLiabilitiesAndEquity,
        },
        summaries: [
          { label: isAr ? "إجمالي الأصول" : "Total Assets", value: totalAssets },
          { label: isAr ? "الخصوم وحقوق الملكية" : "Liabilities & Equity", value: totalLiabilitiesAndEquity },
          { label: isAr ? "المعادلة المحاسبية" : "Equation", value: isBalanced ? (isAr ? "متوازن" : "Balanced") : (isAr ? "غير متوازن" : "Unbalanced") },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف الميزانية العمومية" : "Balance sheet workbook downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR & DATE FILTER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={handleDateChange} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              type="date"
              value={currentAsOf}
              onChange={(e) => setCurrentAsOf(e.target.value)}
              className="ps-9 text-xs h-9 w-44 font-mono font-bold"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs font-bold">
            {isAr ? "تحديث التاريخ" : "Apply Date"}
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
          EXECUTIVE BALANCE SHEET KPIS & EQUATION INTEGRITY
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "إجمالي الأصول" : "Total Assets"}</span>
          <div className="mt-1 font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {fmt(totalAssets)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "إجمالي الخصوم" : "Total Liabilities"}</span>
          <div className="mt-1 font-mono text-xl font-black text-rose-600 dark:text-rose-400">
            {fmt(totalLiabilities)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "حقوق الملكية وفائض الفترة" : "Equity & Surplus"}</span>
          <div className="mt-1 font-mono text-xl font-black text-purple-600 dark:text-purple-400">
            {fmt(totalEquity)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm ${isBalanced ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/40"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isBalanced ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
              {isAr ? "المعادلة المحاسبية" : "Accounting Equation"}
            </span>
            {isBalanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-rose-600" />}
          </div>
          <div className={`mt-1 font-mono text-lg font-black ${isBalanced ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
            {isBalanced ? (isAr ? "متوازن 100% ✓" : "100% Balanced ✓") : (isAr ? `فارق: ${fmt(diff)}` : `Diff: ${fmt(diff)}`)}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TWO-COLUMN STRUCTURE: ASSETS VS LIABILITIES & EQUITY
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT / TOP COLUMN: ASSETS */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="bg-blue-900 text-white p-3.5 font-bold text-xs flex items-center justify-between">
            <span>{isAr ? "الأصول (Assets)" : "Assets"}</span>
            <span className="font-mono text-sm">{fmt(totalAssets)} {currency}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="p-3 text-start">{isAr ? "رمز الحساب" : "Code"}</th>
                  <th className="p-3 text-start">{isAr ? "اسم الحساب" : "Account"}</th>
                  <th className="p-3 text-end">{isAr ? "المبلغ" : "Amount"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {assetRows.length ? (
                  assetRows.map((r) => (
                    <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400">{r.code}</td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                      <td className="p-3 text-end font-mono font-bold text-blue-600 dark:text-blue-400">{fmt(r.balance)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-slate-400 text-xs">
                      {isAr ? "لا توجد أصول مسجلة" : "No asset records"}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="p-3 text-start font-black text-slate-900 dark:text-white">
                    {isAr ? "إجمالي الأصول" : "Total Assets"}
                  </td>
                  <td className="p-3 text-end font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                    {fmt(totalAssets)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* RIGHT / BOTTOM COLUMN: LIABILITIES & EQUITY */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="bg-slate-900 text-white p-3.5 font-bold text-xs flex items-center justify-between">
            <span>{isAr ? "الخصوم وحقوق الملكية (Liabilities & Equity)" : "Liabilities & Equity"}</span>
            <span className="font-mono text-sm">{fmt(totalLiabilitiesAndEquity)} {currency}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-100 dark:bg-slate-800/80 font-bold border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="p-3 text-start">{isAr ? "رمز الحساب" : "Code"}</th>
                  <th className="p-3 text-start">{isAr ? "اسم الحساب" : "Account"}</th>
                  <th className="p-3 text-end">{isAr ? "المبلغ" : "Amount"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* 1. Liabilities */}
                <tr className="bg-rose-50/50 dark:bg-rose-950/20 font-bold text-rose-900 dark:text-rose-200">
                  <td colSpan={2} className="p-2.5 ps-3">{isAr ? "الخصوم والالتزامات" : "Liabilities"}</td>
                  <td className="p-2.5 text-end font-mono font-bold">{fmt(totalLiabilities)}</td>
                </tr>
                {liabilityRows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-5">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                    <td className="p-3 text-end font-mono font-bold text-rose-600 dark:text-rose-400">{fmt(r.balance)}</td>
                  </tr>
                ))}

                {/* 2. Equity */}
                <tr className="bg-purple-50/50 dark:bg-purple-950/20 font-bold text-purple-900 dark:text-purple-200">
                  <td colSpan={2} className="p-2.5 ps-3">{isAr ? "حقوق الملكية والفائض" : "Equity & Reserves"}</td>
                  <td className="p-2.5 text-end font-mono font-bold">{fmt(totalEquity)}</td>
                </tr>
                {equityRows.map((r) => (
                  <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-5">{r.code}</td>
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                    <td className="p-3 text-end font-mono font-bold text-purple-600 dark:text-purple-400">{fmt(r.balance)}</td>
                  </tr>
                ))}
                <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-mono font-bold text-slate-400 ps-5">—</td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? "صافي أرباح / فائض الفترة الحالية" : "Current Period Surplus / Earnings"}</td>
                  <td className="p-3 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(currentEarnings)}</td>
                </tr>
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={2} className="p-3 text-start font-black text-slate-900 dark:text-white">
                    {isAr ? "إجمالي الخصوم وحقوق الملكية" : "Total Liabilities & Equity"}
                  </td>
                  <td className="p-3 text-end font-mono text-sm font-black text-slate-950 dark:text-white">
                    {fmt(totalLiabilitiesAndEquity)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
