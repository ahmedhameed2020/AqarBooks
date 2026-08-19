"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  Wallet,
  Printer,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface CashFlowItem {
  account_id: string;
  code: string;
  name_ar: string;
  name_en: string;
  section: "OPERATING" | "INVESTING" | "FINANCING" | string;
  amount: number;
}

const SECTIONS = [
  {
    key: "OPERATING",
    labelAr: "١. التدفقات النقدية من الأنشطة التشغيلية",
    labelEn: "1. Cash Flows from Operating Activities",
  },
  {
    key: "INVESTING",
    labelAr: "٢. التدفقات النقدية من الأنشطة الاستثمارية",
    labelEn: "2. Cash Flows from Investing Activities",
  },
  {
    key: "FINANCING",
    labelAr: "٣. التدفقات النقدية من الأنشطة التمويلية",
    labelEn: "3. Cash Flows from Financing Activities",
  },
] as const;

export function CashFlowClient({
  rows,
  openingCash,
  closingCash,
  startDate,
  endDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  rows: CashFlowItem[];
  openingCash: number;
  closingCash: number;
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

  const netCashFlow = rows.reduce((s, r) => s + r.amount, 0);
  const computedClosing = openingCash + netCashFlow;
  const isReconciled = Math.abs(computedClosing - closingCash) < 0.005;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    const formattedRows: Record<string, any>[] = [];

    // Opening cash
    formattedRows.push({
      __isGroup: true,
      code: "—",
      name: isAr ? "رصيد النقدية في بداية الفترة" : "Opening Cash & Cash Equivalents",
      amount: openingCash,
    });

    SECTIONS.forEach((sec) => {
      const secRows = rows.filter((r) => r.section === sec.key);
      const secTotal = secRows.reduce((s, r) => s + r.amount, 0);

      formattedRows.push({
        __isGroup: true,
        code: "",
        name: isAr ? sec.labelAr : sec.labelEn,
        amount: secTotal,
      });

      secRows.forEach((r) => {
        formattedRows.push({
          code: r.code,
          name: isAr ? r.name_ar : r.name_en,
          amount: r.amount,
        });
      });
    });

    generateFinancialStatementPdf(
      {
        title: isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement",
        subtitle: isAr ? `للفترة من ${startDate} إلى ${endDate}` : `From ${startDate} to ${endDate}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", align: "start", width: "20%" },
          { header: isAr ? "البيان / النشاط" : "Particulars / Activity", key: "name", align: "start", width: "55%" },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: "25%" },
        ],
        rows: formattedRows,
        totalRow: {
          code: "—",
          name: isAr ? "رصيد النقدية في نهاية الفترة" : "Closing Cash & Cash Equivalents",
          amount: closingCash,
        },
        summaries: [
          { label: isAr ? "نقدية أول المدة" : "Opening Cash", value: openingCash },
          { label: isAr ? "صافي التدفق النقدي" : "Net Cash Flow", value: netCashFlow, highlight: true },
          { label: isAr ? "نقدية آخر المدة" : "Closing Cash", value: closingCash, highlight: true },
          { label: isAr ? "مطابقة السيولة" : "Reconciliation", value: isReconciled ? (isAr ? "مطابق 100%" : "Reconciled") : (isAr ? "غير مطابق" : "Unreconciled") },
        ],
        notes: [
          isAr
            ? "توضح قائمة التدفقات النقدية صافي حركة السيولة في الخزائن والحسابات البنكية ومطابقتها التامة."
            : "Reflects gross and net liquidity movements across treasury and bank accounts.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير قائمة التدفقات النقدية..." : "Exporting Cash Flow...",
      description: isAr ? "يتم تجهيز ملف الإكسل" : "Preparing workbook",
    });

    const exportRows: Record<string, any>[] = [];
    exportRows.push({
      __isGroup: true,
      code: "—",
      name: isAr ? "رصيد النقدية في بداية الفترة" : "Opening Cash Balance",
      amount: openingCash,
    });

    SECTIONS.forEach((sec) => {
      const secRows = rows.filter((r) => r.section === sec.key);
      const secTotal = secRows.reduce((s, r) => s + r.amount, 0);

      exportRows.push({
        __isGroup: true,
        code: "",
        name: isAr ? sec.labelAr : sec.labelEn,
        amount: secTotal,
      });

      secRows.forEach((r) => {
        exportRows.push({
          code: r.code,
          name: isAr ? r.name_ar : r.name_en,
          amount: r.amount,
        });
      });
    });

    await exportFinancialStatementToExcel(
      {
        filename: "cash_flow_statement",
        sheetName: isAr ? "التدفقات النقدية" : "Cash Flow",
        reportTitle: isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", isNumber: false, width: 20 },
          { header: isAr ? "البيان / النشاط" : "Particulars / Activity", key: "name", isNumber: false, width: 45 },
          { header: isAr ? `المبلغ (${currency})` : `Amount (${currency})`, key: "amount", isNumber: true, width: 25 },
        ],
        rows: exportRows,
        totalRow: {
          code: "—",
          name: isAr ? "رصيد النقدية في نهاية الفترة" : "Closing Cash Balance",
          amount: closingCash,
        },
        summaries: [
          { label: isAr ? "نقدية أول المدة" : "Opening Cash", value: openingCash },
          { label: isAr ? "صافي التدفق النقدي" : "Net Cash Flow", value: netCashFlow },
          { label: isAr ? "نقدية آخر المدة" : "Closing Cash", value: closingCash },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف التدفقات النقدية" : "Cash flow workbook downloaded",
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
          EXECUTIVE CASH POSITION SUMMARY CARDS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "رصيد نقدية أول المدة" : "Opening Cash"}</span>
          <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-white">
            {fmt(openingCash)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "صافي التغير في النقدية" : "Net Cash Movement"}</span>
          <div className={`mt-1 font-mono text-xl font-black ${netCashFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {fmt(netCashFlow)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-bold text-slate-500">{isAr ? "رصيد نقدية آخر المدة" : "Closing Cash"}</span>
          <div className="mt-1 font-mono text-xl font-black text-blue-600 dark:text-blue-400">
            {fmt(closingCash)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 shadow-sm ${isReconciled ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/40"}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isReconciled ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
              {isAr ? "مطابقة السيولة" : "Liquidity Audit"}
            </span>
            {isReconciled ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-rose-600" />}
          </div>
          <div className={`mt-1 font-mono text-lg font-black ${isReconciled ? "text-emerald-700 dark:text-emerald-200" : "text-rose-700 dark:text-rose-200"}`}>
            {isReconciled ? (isAr ? "مطابق 100% ✓" : "100% Reconciled ✓") : (isAr ? "غير مطابق" : "Unreconciled")}
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STRUCTURED CASH FLOW STATEMENT TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start w-32">{isAr ? "رمز الحساب" : "Account Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "البيان / النشاط" : "Particulars / Activity"}</th>
                <th className="p-3.5 text-end w-48">{isAr ? `المبلغ (${currency})` : `Amount (${currency})`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Opening Cash Row */}
              <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold">
                <td className="p-3 ps-3.5 text-slate-500 font-mono">—</td>
                <td className="p-3 font-bold text-slate-900 dark:text-white">
                  {isAr ? "رصيد النقدية وما في حكمها في بداية الفترة" : "Cash and cash equivalents at beginning of period"}
                </td>
                <td className="p-3 text-end font-mono font-bold text-slate-900 dark:text-white">
                  {fmt(openingCash)}
                </td>
              </tr>

              {/* SECTIONS */}
              {SECTIONS.map((sec) => {
                const secRows = rows.filter((r) => r.section === sec.key);
                const secTotal = secRows.reduce((s, r) => s + r.amount, 0);

                return (
                  <tbody key={sec.key} className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr className="bg-purple-50/70 dark:bg-purple-950/30 font-black text-purple-950 dark:text-purple-200 border-t border-b border-purple-200 dark:border-purple-900">
                      <td colSpan={2} className="p-3 text-sm">
                        {isAr ? sec.labelAr : sec.labelEn}
                      </td>
                      <td className="p-3 text-end font-mono text-sm font-black">
                        <span className={secTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                          {fmt(secTotal)}
                        </span>
                      </td>
                    </tr>
                    {secRows.length ? (
                      secRows.map((r) => (
                        <tr key={r.account_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400 ps-6">{r.code}</td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{isAr ? r.name_ar : r.name_en}</td>
                          <td className="p-3 text-end font-mono font-bold">
                            <span className={r.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                              {fmt(r.amount)}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="p-3 text-center text-slate-400 text-xs ps-6">
                          {isAr ? "لا توجد تدفقات مسجلة في هذا النشاط" : "No cash flows in this section"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </tbody>

            {/* CLOSING CASH FOOTER */}
            <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
              <tr>
                <td colSpan={2} className="p-4 text-start font-black text-sm">
                  {isAr ? "رصيد النقدية وما في حكمها في نهاية الفترة" : "Cash and cash equivalents at end of period"}
                </td>
                <td className="p-4 text-end font-mono text-base font-black text-emerald-400">
                  {fmt(closingCash)} {currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
