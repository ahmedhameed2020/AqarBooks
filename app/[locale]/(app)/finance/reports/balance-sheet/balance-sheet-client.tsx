"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileSpreadsheet,
  Calendar,
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
  contraAssetRows,
  liabilityRows,
  equityRows,
  accumulatedEarnings,
  asOfDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  assetRows: BalanceSheetAccountRow[];
  contraAssetRows: BalanceSheetAccountRow[];
  liabilityRows: BalanceSheetAccountRow[];
  equityRows: BalanceSheetAccountRow[];
  accumulatedEarnings: number;
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

  const grossAssets = assetRows.reduce((s, r) => s + r.balance, 0);
  const totalContraAssets = contraAssetRows.reduce((s, r) => s + r.balance, 0);
  const totalAssets = grossAssets - totalContraAssets;
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0);
  const baseEquity = equityRows.reduce((s, r) => s + r.balance, 0);
  const totalEquity = baseEquity + accumulatedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const diff = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = diff < 0.005;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const appendAssetExportRows = (rows: Record<string, unknown>[]) => {
    assetRows.forEach((r) => {
      rows.push({
        code: r.code,
        name: isAr ? r.name_ar : r.name_en,
        amount: r.balance,
      });
    });

    if (contraAssetRows.length) {
      rows.push({
        __isGroup: true,
        code: "",
        name: isAr ? "يخصم: مجمع الإهلاك (Contra-asset)" : "Less: Accumulated Depreciation (Contra-asset)",
        amount: -totalContraAssets,
      });
      contraAssetRows.forEach((r) => {
        rows.push({
          code: r.code,
          name: isAr ? r.name_ar : r.name_en,
          amount: -r.balance,
        });
      });
    }
  };

  const handleExportPdf = () => {
    const formattedRows: Record<string, unknown>[] = [];

    formattedRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "١. صافي الأصول (Net Assets)" : "1. Net Assets",
      amount: totalAssets,
    });
    appendAssetExportRows(formattedRows);

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
      name: isAr ? "الفائض المتراكم حتى التاريخ" : "Accumulated Surplus Through Date",
      amount: accumulatedEarnings,
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
          { label: isAr ? "إجمالي الأصول قبل الخصم" : "Gross Assets", value: grossAssets },
          { label: isAr ? "مجمع الإهلاك المخصوم" : "Accumulated Depreciation", value: totalContraAssets },
          { label: isAr ? "صافي الأصول" : "Net Assets", value: totalAssets, highlight: true },
          { label: isAr ? "إجمالي الخصوم" : "Total Liabilities", value: totalLiabilities },
          { label: isAr ? "حقوق الملكية والفائض" : "Total Equity", value: totalEquity },
          {
            label: isAr ? "توازن المركز المالي" : "Equation Integrity",
            value: isBalanced
              ? isAr ? "متوازن 100%" : "Balanced"
              : isAr ? `فارق (${diff.toFixed(2)})` : `Diff (${diff.toFixed(2)})`,
          },
        ],
        notes: [
          isAr
            ? "يُعرض مجمع الإهلاك التاريخي كحساب مقابل للأصول ويُخصم من إجمالي الأصول لأغراض العرض فقط، دون تغيير تصنيف الحساب في دفتر الأستاذ أو أي قيد تاريخي."
            : "Legacy accumulated depreciation is presented as a contra-asset and deducted from gross assets for statement presentation only; no ledger classification or historical journal is changed.",
          isAr
            ? "يتطابق صافي الأصول مع مجموع الخصوم وحقوق الملكية وفقاً للمعادلة المحاسبية."
            : "Net assets conform to the accounting equation (Assets = Liabilities + Equity).",
        ],
      },
      locale,
    );
  };

  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير الميزانية العمومية..." : "Exporting Balance Sheet...",
      description: isAr ? "يتم تجهيز ملف الإكسل المنسق" : "Preparing workbook",
    });

    const exportRows: Record<string, unknown>[] = [];
    exportRows.push({
      __isGroup: true,
      code: "",
      name: isAr ? "صافي الأصول" : "Net Assets",
      amount: totalAssets,
    });
    appendAssetExportRows(exportRows);

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
      name: isAr ? "الفائض المتراكم حتى التاريخ" : "Accumulated Surplus Through Date",
      amount: accumulatedEarnings,
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
          { label: isAr ? "إجمالي الأصول قبل الخصم" : "Gross Assets", value: grossAssets },
          { label: isAr ? "مجمع الإهلاك المخصوم" : "Accumulated Depreciation", value: totalContraAssets },
          { label: isAr ? "صافي الأصول" : "Net Assets", value: totalAssets },
          { label: isAr ? "الخصوم وحقوق الملكية" : "Liabilities & Equity", value: totalLiabilitiesAndEquity },
          { label: isAr ? "المعادلة المحاسبية" : "Equation", value: isBalanced ? (isAr ? "متوازن" : "Balanced") : (isAr ? "غير متوازن" : "Unbalanced") },
        ],
      },
      locale,
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف الميزانية العمومية" : "Balance sheet workbook downloaded",
    });
  };

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "صافي الأصول" : "Net Assets"}</span>
          <div className="mt-1 font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {fmt(totalAssets)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
          {totalContraAssets > 0 && (
            <p className="mt-1 text-[10px] font-semibold text-slate-500">
              {isAr
                ? `إجمالي قبل الإهلاك ${fmt(grossAssets)} − مجمع إهلاك ${fmt(totalContraAssets)}`
                : `Gross ${fmt(grossAssets)} − accumulated depreciation ${fmt(totalContraAssets)}`}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "إجمالي الخصوم" : "Total Liabilities"}</span>
          <div className="mt-1 font-mono text-xl font-black text-rose-600 dark:text-rose-400">
            {fmt(totalLiabilities)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "حقوق الملكية والفائض المتراكم" : "Equity & Accumulated Surplus"}</span>
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

      {contraAssetRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {isAr
            ? "إفصاح عرض: مجمع الإهلاك التاريخي محفوظ في دفتر الأستاذ بتصنيفه الأصلي، لكنه يُعرض هنا كحساب مقابل للأصول ويُخصم من إجمالي الأصول. هذا التعديل خاص بالعرض ولا يغيّر أي قيد أو رصيد تاريخي."
            : "Presentation disclosure: legacy accumulated depreciation remains stored under its original ledger classification, but is presented here as a contra-asset deducted from gross assets. This is presentation-only and changes no historical journal or balance."}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="bg-blue-900 text-white p-3.5 font-bold text-xs flex items-center justify-between">
            <span>{isAr ? "صافي الأصول (Net Assets)" : "Net Assets"}</span>
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
                {assetRows.length || contraAssetRows.length ? (
                  <>
                    {assetRows.map((r) => (
                      <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400">{r.code}</td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                        <td className="p-3 text-end font-mono font-bold text-blue-600 dark:text-blue-400">{fmt(r.balance)}</td>
                      </tr>
                    ))}
                    {contraAssetRows.length > 0 && (
                      <tr className="bg-amber-50/70 font-bold text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                        <td colSpan={2} className="p-2.5 ps-3">{isAr ? "يخصم: مجمع الإهلاك" : "Less: accumulated depreciation"}</td>
                        <td className="p-2.5 text-end font-mono">({fmt(totalContraAssets)})</td>
                      </tr>
                    )}
                    {contraAssetRows.map((r) => (
                      <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-amber-700 dark:text-amber-400 ps-5">{r.code}</td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                        <td className="p-3 text-end font-mono font-bold text-amber-700 dark:text-amber-400">({fmt(r.balance)})</td>
                      </tr>
                    ))}
                  </>
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
                    {isAr ? "صافي الأصول" : "Net Assets"}
                  </td>
                  <td className="p-3 text-end font-mono text-sm font-black text-blue-700 dark:text-blue-400">
                    {fmt(totalAssets)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

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
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? "الفائض المتراكم حتى التاريخ" : "Accumulated Surplus Through Date"}</td>
                  <td className="p-3 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">{fmt(accumulatedEarnings)}</td>
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
