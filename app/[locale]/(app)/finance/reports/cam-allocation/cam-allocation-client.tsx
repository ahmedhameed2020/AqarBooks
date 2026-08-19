"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Droplets,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingUp,
  Printer,
  ChevronLeft,
  DollarSign,
  CheckCircle2,
  Percent,
  MessageCircle,
  ShieldCheck,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface CamUnitRow {
  unitId: string;
  unitCode: string;
  unitType: string;
  resortName: string;
  ownerName: string;
  ownerPhone: string;
  areaSqm: number;
  shareRatio: number;
  allocatedCost: number;
  billedCam: number;
  paidCam: number;
  balanceDue: number;
}

export function CamAllocationClient({
  rows,
  totalSharedExpense,
  totalGrossArea,
  costPerSqm,
  organizationName,
  currency,
  locale,
}: {
  rows: CamUnitRow[];
  totalSharedExpense: number;
  totalGrossArea: number;
  costPerSqm: number;
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.unitCode.toLowerCase().includes(q) ||
        r.ownerName.toLowerCase().includes(q) ||
        r.resortName.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalBilled = rows.reduce((s, r) => s + r.billedCam, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paidCam, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.balanceDue, 0);
    const collectionRate = totalBilled > 0 ? (totalPaid / totalBilled) * 100 : 0;

    return {
      totalBilled,
      totalPaid,
      totalOutstanding,
      collectionRate,
    };
  }, [rows]);

  // WhatsApp Reminder
  const handleWhatsApp = (r: CamUnitRow) => {
    if (!r.ownerPhone) return;
    const text = isAr
      ? `مرحباً ${r.ownerName}، نود إحاطتكم بصدور كشف رسوم الخدمات المشتركة والصيانة (CAM) للوحدة ${r.unitCode} بمبلغ ${r.balanceDue.toLocaleString()} ${currencyLabel}. يرجى التكرم بالسداد.`
      : `Hello ${r.ownerName}, your CAM common area maintenance balance for unit ${r.unitCode} is ${r.balanceDue.toLocaleString()} ${currencyLabel}.`;
    window.open(`https://api.whatsapp.com/send?phone=${r.ownerPhone.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(text)}`, "_blank");
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM)" : "Common Area Maintenance (CAM) Allocation",
      subtitle: isAr
        ? `جدول توزيع مصاريف الصيانة والخدمات المشتركة بالمتر المربع — ${organizationName}`
        : `CAM Shared Expenses Allocation Schedule by Sqm — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "كود الوحدة" : "Unit", key: "unit", align: "start" },
        { header: isAr ? "المالك المسجل" : "Owner", key: "owner", align: "start" },
        { header: isAr ? "المساحة (م²)" : "Area (Sqm)", key: "area", align: "center", isNumber: true },
        { header: isAr ? "النسبة %" : "Share %", key: "share", align: "center" },
        { header: isAr ? "المصاريف الموزعة" : "Allocated", key: "alloc", align: "end", isNumber: true },
        { header: isAr ? "المفوتر" : "Billed", key: "billed", align: "end", isNumber: true },
        { header: isAr ? "المسدد" : "Paid", key: "paid", align: "end", isNumber: true },
        { header: isAr ? "المتبقي" : "Due", key: "due", align: "end", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        owner: r.ownerName,
        area: `${r.areaSqm} م²`,
        share: `${r.shareRatio.toFixed(2)}%`,
        alloc: `${r.allocatedCost.toLocaleString()} ${currencyLabel}`,
        billed: `${r.billedCam.toLocaleString()} ${currencyLabel}`,
        paid: `${r.paidCam.toLocaleString()} ${currencyLabel}`,
        due: `${r.balanceDue.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي المصاريف المشتركة" : "Total Shared Expense", value: `${totalSharedExpense.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "معدل تكلفة المتر المربع" : "Cost / Sqm", value: `${costPerSqm.toFixed(2)} ${currencyLabel}` },
        { label: isAr ? "إجمالي المحصل" : "Total Collected", value: `${metrics.totalPaid.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "نسبة التحصيل" : "Collection Rate", value: `${metrics.collectionRate.toFixed(1)}%` },
      ],
      filename: `CAM_Allocation_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "تقرير توزيع تكاليف الخدمات المشتركة (CAM)" : "CAM Allocation Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "كود الوحدة" : "Unit Code", key: "unit" },
        { header: isAr ? "المالك" : "Owner", key: "owner" },
        { header: isAr ? "المشروع / المنتجع" : "Resort", key: "resort" },
        { header: isAr ? "المساحة (م²)" : "Area (Sqm)", key: "area", isNumber: true },
        { header: isAr ? "نسبة المشاركة %" : "Share %", key: "share" },
        { header: isAr ? "التكلفة الموزعة" : "Allocated Cost", key: "alloc", isNumber: true },
        { header: isAr ? "القيمة المفوترة" : "Billed CAM", key: "billed", isNumber: true },
        { header: isAr ? "المسدد" : "Paid", key: "paid", isNumber: true },
        { header: isAr ? "المستحق القائم" : "Balance Due", key: "due", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        owner: r.ownerName,
        resort: r.resortName,
        area: r.areaSqm,
        share: `${r.shareRatio.toFixed(2)}%`,
        alloc: r.allocatedCost,
        billed: r.billedCam,
        paid: r.paidCam,
        due: r.balanceDue,
      })),
      filename: `CAM_Allocation_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-teal-600 dark:text-teal-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "توزيع الخدمات المشتركة (CAM)" : "CAM Allocation"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM)" : "Common Area Maintenance (CAM) Allocation Report"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "توزيع مصاريف الخدمات المشتركة (الأمن، النظافة، المسابح، اللاندسكيب، إنارة الطرق والمصاعد) على الوحدات بالمتر المربع ومتابعة التحصيل."
                : "Apportion shared operating expenses across units based on square footage ratios and manage CAM collections."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              <span>{isAr ? "تصدير إكسل" : "Excel"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileText className="size-3.5 text-rose-600" />
              <span>{isAr ? "تصدير PDF" : "PDF"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <Printer className="size-3.5 text-slate-600" />
              <span>{isAr ? "طباعة" : "Print"}</span>
            </Button>
          </div>
        </div>

        {/* METRICS TILES */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي المصاريف المشتركة" : "Total Shared Expense"}</span>
              <Droplets className="size-4 text-teal-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {totalSharedExpense.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "صيانة وأمن ونظافة ولاندسكيب" : "Shared facilities cost"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "معدل تكلفة المتر المربع" : "Cost per Sqm"}</span>
              <Maximize2 className="size-4 text-indigo-600" />
            </div>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
              {costPerSqm.toFixed(2)}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}/م²</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "معدل التحميل المعتمد" : "Allocation rate"}</span>
          </div>

          <div className="rounded-2xl bg-teal-50/70 p-3.5 border border-teal-200/80 dark:bg-teal-950/20 dark:border-teal-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-teal-900 dark:text-teal-300">{isAr ? "إجمالي المحصل من الملاك" : "Collected CAM"}</span>
              <CheckCircle2 className="size-4 text-teal-700 dark:text-teal-400" />
            </div>
            <p className="text-xl font-black text-teal-700 dark:text-teal-300 mt-1 font-mono">
              {metrics.totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-teal-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-teal-700/80 block mt-0.5">{isAr ? `نسبة التحصيل ${metrics.collectionRate.toFixed(1)}%` : "Collection rate"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "المتبقي تحت التحصيل" : "Outstanding Due"}</span>
              <DollarSign className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {metrics.totalOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "مستحقات واجبة السداد" : "Receivables balance"}</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-white">
            {isAr ? "جدول نصيب كل وحدة من تكاليف CAM" : "Unit CAM Apportionment Schedule"}
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">{filteredRows.length}</Badge>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالوحدة، المالك، المنتجع..." : "Search unit, owner..."}
            className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* TABLE WITH LIGHT THEME HEADER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "الوحدة والمنتجع" : "Unit & Resort"}</th>
                <th className="p-3.5 text-start">{isAr ? "المالك المسجل" : "Registered Owner"}</th>
                <th className="p-3.5 text-center">{isAr ? "المساحة (م²)" : "Area (Sqm)"}</th>
                <th className="p-3.5 text-center">{isAr ? "النسبة %" : "Share %"}</th>
                <th className="p-3.5 text-end">{isAr ? "التكلفة الموزعة" : "Allocated Cost"}</th>
                <th className="p-3.5 text-end">{isAr ? "المفوتر" : "Billed"}</th>
                <th className="p-3.5 text-end">{isAr ? "المسدد" : "Paid"}</th>
                <th className="p-3.5 text-end">{isAr ? "المتبقي" : "Balance Due"}</th>
                <th className="p-3.5 text-center">{isAr ? "تواصل" : "Contact"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.unitId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 text-teal-600 shrink-0" />
                        <span>{r.unitCode}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({r.resortName})</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-sans font-medium text-slate-800 dark:text-slate-200">
                      {r.ownerName}
                    </td>

                    <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300">
                      {r.areaSqm} م²
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge variant="outline" className="text-[10px] bg-slate-50 font-bold">{r.shareRatio.toFixed(2)}%</Badge>
                    </td>

                    <td className="p-3.5 text-end text-slate-800 dark:text-slate-200 font-medium">
                      {r.allocatedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end text-slate-800 dark:text-slate-200 font-bold">
                      {r.billedCam.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end text-emerald-600 font-bold">
                      {r.paidCam.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-black text-sm text-amber-600 dark:text-amber-400 bg-slate-50/50 dark:bg-slate-800/30">
                      {r.balanceDue > 0 ? (
                        `${r.balanceDue.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currencyLabel}`
                      ) : (
                        <span className="text-emerald-600 font-bold text-xs">مسدد بالكامل ✓</span>
                      )}
                    </td>

                    <td className="p-3.5 text-center font-sans">
                      {r.ownerPhone && r.balanceDue > 0 ? (
                        <Button
                          onClick={() => handleWhatsApp(r)}
                          variant="ghost"
                          size="sm"
                          title={isAr ? "مراسلة المالك عبر واتساب" : "WhatsApp Owner"}
                          className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد بيانات وحدات مطابقة" : "No unit CAM records found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
