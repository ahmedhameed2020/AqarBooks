"use client";

import { useState, useMemo } from "react";
import {
  Clock,
  Printer,
  FileSpreadsheet,
  Search,
  AlertTriangle,
  Building,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/finance/aging";

export interface AgingReportRow {
  id: string;
  unit_id: string;
  unitCode: string;
  amount: number;
  remaining: number;
  due_date: string;
  status: string;
  bucket: AgingBucketKey;
}

export function AgingClient({
  rows,
  totals,
  grandTotal,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  rows: AgingReportRow[];
  totals: Record<string, number>;
  grandTotal: number;
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBucket, setSelectedBucket] = useState<string>("ALL");

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedBucket !== "ALL" && r.bucket !== selectedBucket) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return r.unitCode.toLowerCase().includes(q) || r.due_date.includes(q);
    });
  }, [rows, selectedBucket, searchQuery]);

  const filteredTotal = filteredRows.reduce((s, r) => s + r.remaining, 0);

  const bucketLabelMap: Record<string, { ar: string; en: string }> = {
    current: { ar: "غير متأخر (ساري)", en: "Current" },
    "1-30": { ar: "١ - ٣٠ يوم", en: "1-30 Days" },
    "31-60": { ar: "٣١ - ٦٠ يوم", en: "31-60 Days" },
    "61-90": { ar: "٦١ - ٩٠ يوم", en: "61-90 Days" },
    "90+": { ar: "أكثر من ٩٠ يوم", en: "90+ Days" },
  };

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "تقرير أعمار الديون والذمم المدينة" : "Accounts Receivable Aging Report",
        subtitle: isAr ? "تحليل الذمم المتأخرة حسب فترات الاستحقاق" : "Aged receivables analysis by delinquency bucket",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "كود الوحدة" : "Unit Code", key: "unitCode", align: "start", width: "20%" },
          { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "due_date", align: "center", width: "20%" },
          { header: isAr ? "فئة التأخير" : "Aging Bucket", key: "bucketLabel", align: "center", width: "25%" },
          { header: isAr ? `المبلغ المتبقي (${currency})` : `Remaining (${currency})`, key: "remaining", isNumber: true, width: "35%" },
        ],
        rows: filteredRows.map((r) => ({
          unitCode: r.unitCode,
          due_date: r.due_date,
          bucketLabel: bucketLabelMap[r.bucket]?.[isAr ? "ar" : "en"] || r.bucket,
          remaining: r.remaining,
        })),
        totalRow: {
          unitCode: isAr ? "الإجمالي العام" : "Grand Total",
          due_date: "",
          bucketLabel: `${filteredRows.length} ${isAr ? "مطالبة" : "items"}`,
          remaining: filteredTotal,
        },
        summaries: [
          { label: isAr ? "إجمالي الذمم المعلقة" : "Total Receivables", value: grandTotal, highlight: true },
          { label: isAr ? "أكثر من 90 يوم (خطر)" : "> 90 Days High Risk", value: totals["90+"] || 0 },
        ],
        notes: [
          isAr
            ? "يوضح التقرير أعمار المستحقات غير المحصلة بالكامل بناءً على تواريخ استحقاقها."
            : "Reflects all uncollected receivables segmented by delinquency aging buckets.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير تقرير أعمار الديون..." : "Exporting Aging Report...",
      description: isAr ? "يتم تجهيز ملف الإكسل" : "Preparing workbook",
    });

    await exportFinancialStatementToExcel(
      {
        filename: "receivables_aging",
        sheetName: isAr ? "أعمار الديون" : "Receivables Aging",
        reportTitle: isAr ? "تقرير أعمار الديون والذمم المدينة" : "Accounts Receivable Aging Report",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "كود الوحدة" : "Unit Code", key: "unitCode", isNumber: false, width: 22 },
          { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "due_date", isNumber: false, width: 20 },
          { header: isAr ? "فئة التأخير" : "Aging Bucket", key: "bucketLabel", isNumber: false, width: 24 },
          { header: isAr ? `المبلغ المتبقي (${currency})` : `Remaining (${currency})`, key: "remaining", isNumber: true, width: 25 },
        ],
        rows: filteredRows.map((r) => ({
          unitCode: r.unitCode,
          due_date: r.due_date,
          bucketLabel: bucketLabelMap[r.bucket]?.[isAr ? "ar" : "en"] || r.bucket,
          remaining: r.remaining,
        })),
        totalRow: {
          unitCode: isAr ? "الإجمالي العام" : "Grand Total",
          due_date: "",
          bucketLabel: `${filteredRows.length} ${isAr ? "مطالبة" : "dues"}`,
          remaining: filteredTotal,
        },
        summaries: [
          { label: isAr ? "إجمالي الذمم" : "Total Receivables", value: grandTotal },
          { label: isAr ? "ساري (غير متأخر)" : "Current", value: totals["current"] || 0 },
          { label: isAr ? "متأخر > 90 يوم" : "> 90 Days Overdue", value: totals["90+"] || 0 },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم تحميل ملف أعمار الديون" : "Aging workbook downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {isAr ? "إجمالي الذمم المدينة المستحقة:" : "Total Outstanding Receivables:"}{" "}
          <span className="font-mono text-sm font-black text-rose-600 dark:text-rose-400 ms-1">
            {fmt(grandTotal)} {currency}
          </span>
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
          EXECUTIVE BUCKET STATS CARDS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {AGING_BUCKETS.map((b) => {
          const val = totals[b.key] || 0;
          const isDanger = b.key === "d90plus";
          const isWarning = b.key === "d61_90" || b.key === "d31_60";

          return (
            <div
              key={b.key}
              onClick={() => setSelectedBucket(selectedBucket === b.key ? "ALL" : b.key)}
              className={`rounded-2xl border p-3.5 transition-all cursor-pointer shadow-sm hover:shadow-md ${
                selectedBucket === b.key
                  ? "border-purple-600 ring-2 ring-purple-600/20 bg-purple-50/50 dark:bg-purple-950/30"
                  : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <div className="text-[11px] font-bold text-slate-500 truncate">
                {isAr ? b.labelAr : b.labelEn}
              </div>
              <div className={`mt-1 font-mono text-lg font-black ${isDanger ? "text-rose-600" : isWarning ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>
                {fmt(val)}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">{currency}</div>
            </div>
          );
        })}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SEARCH & FILTER TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedBucket("ALL")}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
              selectedBucket === "ALL"
                ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
            }`}
          >
            {isAr ? "جميع الفئات" : "All Buckets"}
          </button>
          {AGING_BUCKETS.map((b) => (
            <button
              key={b.key}
              onClick={() => setSelectedBucket(b.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                selectedBucket === b.key
                  ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"
              }`}
            >
              {isAr ? b.labelAr : b.labelEn}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بكود الوحدة أو التاريخ..." : "Search unit..."}
            className="ps-9 text-xs h-9"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH-CONTRAST AGING TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start w-32">{isAr ? "الوحدة العقارية" : "Unit"}</th>
                <th className="p-3.5 text-center w-36">{isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
                <th className="p-3.5 text-center w-40">{isAr ? "فترة التأخير" : "Aging Bucket"}</th>
                <th className="p-3.5 text-end">{isAr ? `المبلغ المتبقي (${currency})` : `Remaining (${currency})`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length ? (
                filteredRows.map((r) => {
                  const isCurrent = r.bucket === "current";
                  const isDanger = r.bucket === "d90plus";

                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Building className="size-3.5 text-purple-600 shrink-0" />
                          <span>{r.unitCode}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-center font-mono text-slate-500">{r.due_date}</td>
                      <td className="p-3.5 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isCurrent
                              ? "bg-slate-100 text-slate-700 border-slate-200"
                              : isDanger
                              ? "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {bucketLabelMap[r.bucket]?.[isAr ? "ar" : "en"] || r.bucket}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-end font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                        {fmt(r.remaining)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد مستحقات متأخرة مطابقة" : "No outstanding receivables found"}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-slate-900 dark:border-slate-700 font-bold">
                <tr>
                  <td colSpan={3} className="p-3.5 text-start font-black text-slate-900 dark:text-white">
                    {isAr ? "إجمالي المطالبات المعروضة" : "Displayed Total"}
                  </td>
                  <td className="p-3.5 text-end font-mono text-base font-black text-rose-600 dark:text-rose-400">
                    {fmt(filteredTotal)} {currency}
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
