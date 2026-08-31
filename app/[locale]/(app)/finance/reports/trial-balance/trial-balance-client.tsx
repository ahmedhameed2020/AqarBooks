"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Search,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | string;
  normal_balance: "DEBIT" | "CREDIT" | string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export function TrialBalanceClient({
  rows,
  asOfDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  rows: TrialBalanceRow[];
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

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [currentAsOf, setCurrentAsOf] = useState(asOfDate);

  const handleDateChange = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${pathname}?asOf=${currentAsOf}`);
  };

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.code.toLowerCase().includes(q) ||
        r.name_ar.toLowerCase().includes(q) ||
        r.name_en.toLowerCase().includes(q)
      );
    });
  }, [rows, selectedCategory, searchQuery]);

  const totalDebit = filteredRows.reduce((s, r) => s + r.total_debit, 0);
  const totalCredit = filteredRows.reduce((s, r) => s + r.total_credit, 0);
  const diff = Math.abs(totalDebit - totalCredit);
  const isBalanced = diff < 0.005;

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    ASSET: { ar: "أصول", en: "Asset" },
    LIABILITY: { ar: "خصوم", en: "Liability" },
    EQUITY: { ar: "حقوق ملكية", en: "Equity" },
    REVENUE: { ar: "إيرادات", en: "Revenue" },
    EXPENSE: { ar: "مصروفات", en: "Expense" },
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "ميزان المراجعة بالمجاميع والأرصدة" : "Trial Balance Statement",
        subtitle: isAr ? `حتى تاريخ: ${asOfDate}` : `As of: ${asOfDate}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: asOfDate,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", align: "start", width: "15%" },
          { header: isAr ? "اسم الحساب" : "Account Name", key: "accountName", align: "start", width: "40%" },
          { header: isAr ? "التصنيف" : "Category", key: "categoryLabel", align: "center", width: "15%" },
          { header: isAr ? "مجموع المدين" : "Debit", key: "total_debit", isNumber: true, width: "15%" },
          { header: isAr ? "مجموع الدائن" : "Credit", key: "total_credit", isNumber: true, width: "15%" },
        ],
        rows: filteredRows.map((r) => ({
          code: r.code,
          accountName: isAr ? r.name_ar : r.name_en,
          categoryLabel: categoryLabels[r.category]?.[isAr ? "ar" : "en"] || r.category,
          total_debit: r.total_debit,
          total_credit: r.total_credit,
        })),
        totalRow: {
          code: isAr ? "الإجمالي العام" : "Grand Total",
          accountName: isBalanced
            ? (isAr ? "✓ ميزان متوازن" : "✓ Balanced")
            : (isAr ? `⚠️ فارق: ${diff.toFixed(2)}` : `⚠️ Diff: ${diff.toFixed(2)}`),
          categoryLabel: "",
          total_debit: totalDebit,
          total_credit: totalCredit,
        },
        summaries: [
          { label: isAr ? "إجمالي المدين" : "Total Debit", value: totalDebit, highlight: true },
          { label: isAr ? "إجمالي الدائن" : "Total Credit", value: totalCredit, highlight: true },
          { label: isAr ? "حالة التوازن" : "Balance Integrity", value: isBalanced ? (isAr ? "متوازن 100%" : "Balanced") : (isAr ? `غير متوازن (${diff.toFixed(2)})` : `Out of balance (${diff.toFixed(2)})`) },
        ],
        notes: [
          isAr
            ? "تم إعداد هذا الميزان بناءً على كافة القيود والحركات المحاسبية المرحّلة حتى التاريخ المذكور أعلاه."
            : "Prepared based on all posted journal entries and general ledger postings up to the aforementioned date.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير ملف الإكسل..." : "Exporting Excel...",
      description: isAr ? "يتم تجهيز ميزان المراجعة بتنسيق محاسبي كامل" : "Preparing full formatted workbook",
    });

    await exportFinancialStatementToExcel(
      {
        filename: "trial_balance",
        sheetName: isAr ? "ميزان المراجعة" : "Trial Balance",
        reportTitle: isAr ? "ميزان المراجعة بالمجاميع والأرصدة" : "Trial Balance Statement",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: asOfDate,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", isNumber: false, width: 18 },
          { header: isAr ? "اسم الحساب" : "Account Name", key: "accountName", isNumber: false, width: 35 },
          { header: isAr ? "التصنيف" : "Category", key: "categoryLabel", isNumber: false, width: 16 },
          { header: isAr ? "مجموع المدين" : "Debit", key: "total_debit", isNumber: true, width: 20 },
          { header: isAr ? "مجموع الدائن" : "Credit", key: "total_credit", isNumber: true, width: 20 },
          { header: isAr ? "الرصيد الصافي (+مدين/-دائن)" : "Net Balance (+Dr/-Cr)", key: "balance", isNumber: true, width: 20 },
        ],
        rows: filteredRows.map((r) => ({
          code: r.code,
          accountName: isAr ? r.name_ar : r.name_en,
          categoryLabel: categoryLabels[r.category]?.[isAr ? "ar" : "en"] || r.category,
          total_debit: r.total_debit,
          total_credit: r.total_credit,
          balance: r.normal_balance === "DEBIT" ? r.balance : -r.balance,
        })),
        totalRow: {
          code: isAr ? "الإجمالي العام" : "Grand Total",
          accountName: isBalanced ? (isAr ? "متوازن" : "Balanced") : (isAr ? `فارق: ${diff.toFixed(2)}` : `Diff: ${diff.toFixed(2)}`),
          categoryLabel: "",
          total_debit: totalDebit,
          total_credit: totalCredit,
          balance: totalDebit - totalCredit,
        },
        summaries: [
          { label: isAr ? "إجمالي المدين" : "Total Debit", value: totalDebit },
          { label: isAr ? "إجمالي الدائن" : "Total Credit", value: totalCredit },
          { label: isAr ? "حالة التوازن" : "Integrity", value: isBalanced ? (isAr ? "متوازن" : "Balanced") : (isAr ? "غير متوازن" : "Out of Balance") },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم حفظ ملف ميزان المراجعة على جهازك" : "Trial balance workbook downloaded",
    });
  };

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR & FILTER CONTROLS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Date Picker Form */}
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

        {/* Action Export Buttons */}
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
          BALANCE INTEGRITY BANNER & STATS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "إجمالي المدين" : "Total Debit"}</span>
          <div className="mt-1 font-mono text-xl font-black text-slate-950 dark:text-white">
            {fmt(totalDebit)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "إجمالي الدائن" : "Total Credit"}</span>
          <div className="mt-1 font-mono text-xl font-black text-slate-950 dark:text-white">
            {fmt(totalCredit)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm ${isBalanced ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/40"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isBalanced ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
              {isAr ? "حالة توازن الميزان" : "Balance Integrity"}
            </span>
            {isBalanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-rose-600" />}
          </div>
          <div className={`mt-1 font-mono text-lg font-black ${isBalanced ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
            {isBalanced ? (isAr ? "متوازن 100% ✓" : "100% Balanced ✓") : (isAr ? `فارق: ${fmt(diff)}` : `Diff: ${fmt(diff)}`)}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          FILTER CHIPS & SEARCH
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((cat) => {
            const label =
              cat === "ALL"
                ? isAr
                  ? "جميع الحسابات"
                  : "All Accounts"
                : categoryLabels[cat]?.[isAr ? "ar" : "en"] || cat;

            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالرمز أو اسم الحساب..." : "Search accounts..."}
            className="ps-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH-CONTRAST TRIAL BALANCE TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start w-28">{isAr ? "رمز الحساب" : "Account Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "اسم الحساب" : "Account Name"}</th>
                <th className="p-3.5 text-center w-28">{isAr ? "التصنيف" : "Category"}</th>
                <th className="p-3.5 text-end w-36">{isAr ? "مجموع المدين" : "Debit"}</th>
                <th className="p-3.5 text-end w-36">{isAr ? "مجموع الدائن" : "Credit"}</th>
                <th className="p-3.5 text-end w-36">{isAr ? "صافي الرصيد" : "Net Balance"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length ? (
                filteredRows.map((r) => {
                  const catLabel = categoryLabels[r.category]?.[isAr ? "ar" : "en"] || r.category;
                  const debitSignedBalance = r.normal_balance === "DEBIT" ? r.balance : -r.balance;
                  const isDebitBalance = debitSignedBalance > 0;

                  return (
                    <tr
                      key={r.account_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3.5 font-mono font-bold text-purple-700 dark:text-purple-400">
                        {r.code}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        {isAr ? r.name_ar : r.name_en}
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {catLabel}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-end font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {fmt(r.total_debit)}
                      </td>
                      <td className="p-3.5 text-end font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {fmt(r.total_credit)}
                      </td>
                      <td className="p-3.5 text-end font-mono font-bold">
                        <span className={isDebitBalance ? "text-blue-600 dark:text-blue-400" : "text-emerald-600 dark:text-emerald-400"}>
                          {fmt(Math.abs(debitSignedBalance))}{debitSignedBalance !== 0 ? ` ${isDebitBalance ? (isAr ? "مدين" : "Dr") : (isAr ? "دائن" : "Cr")}` : ""}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد حركات مرحّلة لهذه الفترة" : "No posted account activity"}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="bg-slate-100/80 dark:bg-slate-800/90 border-t-2 border-slate-900 dark:border-slate-700 font-bold">
                <tr>
                  <td colSpan={3} className="p-3.5 text-start font-black text-slate-900 dark:text-white">
                    {isAr ? "الإجمالي العام" : "Grand Total"}
                  </td>
                  <td className="p-3.5 text-end font-mono text-sm font-black text-slate-950 dark:text-white">
                    {fmt(totalDebit)}
                  </td>
                  <td className="p-3.5 text-end font-mono text-sm font-black text-slate-950 dark:text-white">
                    {fmt(totalCredit)}
                  </td>
                  <td className="p-3.5 text-end font-mono font-black">
                    {isBalanced ? (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">{isAr ? "متوازن ✓" : "Balanced ✓"}</span>
                    ) : (
                      <span className="text-rose-600 dark:text-rose-400 text-xs">{isAr ? `فارق: ${fmt(diff)}` : `Diff: ${fmt(diff)}`}</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
