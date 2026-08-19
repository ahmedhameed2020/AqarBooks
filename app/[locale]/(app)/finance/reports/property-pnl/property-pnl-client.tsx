"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronLeft,
  Search,
  CheckCircle2,
  ShieldCheck,
  Percent,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface PropertyPnlRow {
  propertyId: string;
  propertyName: string;
  unitsCount: number;
  rentalRevenue: number;
  maintenanceRevenue: number;
  otherIncome: number;
  totalRevenue: number;
  totalExpense: number;
  netOperatingIncome: number;
  profitMargin: number;
}

export function PropertyPnlClient({
  rows,
  organizationName,
  currency,
  locale,
}: {
  rows: PropertyPnlRow[];
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
    return rows.filter((r) => r.propertyName.toLowerCase().includes(q));
  }, [rows, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalRev = rows.reduce((s, r) => s + r.totalRevenue, 0);
    const totalExp = rows.reduce((s, r) => s + r.totalExpense, 0);
    const totalNoi = totalRev - totalExp;
    const avgMargin = totalRev > 0 ? (totalNoi / totalRev) * 100 : 0;
    const totalUnits = rows.reduce((s, r) => s + r.unitsCount, 0);

    return {
      totalRev,
      totalExp,
      totalNoi,
      avgMargin,
      totalUnits,
      propertiesCount: rows.length,
    };
  }, [rows]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "قائمة أرباح وخسائر العقارات والمنتجعات" : "Property-Level Profit & Loss Statement",
      subtitle: isAr
        ? `تحليل الإيرادات والمصروفات وصافي الدخل التشغيلي (NOI) — ${organizationName}`
        : `Segregated Property Revenues, Expenses & Net Operating Income — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "العقار / المشروع" : "Property", key: "name", align: "start" },
        { header: isAr ? "الوحدات" : "Units", key: "units", align: "center" },
        { header: isAr ? "إجمالي الإيرادات" : "Total Revenue", key: "revenue", align: "end", isNumber: true },
        { header: isAr ? "إجمالي المصروفات" : "Total Expenses", key: "expenses", align: "end", isNumber: true },
        { header: isAr ? "صافي الدخل (NOI)" : "NOI", key: "noi", align: "end", isNumber: true },
        { header: isAr ? "هامش الربح" : "Margin %", key: "margin", align: "center" },
      ],
      rows: filteredRows.map((r) => ({
        name: r.propertyName,
        units: `${r.unitsCount}`,
        revenue: `${r.totalRevenue.toLocaleString()} ${currencyLabel}`,
        expenses: `-${r.totalExpense.toLocaleString()} ${currencyLabel}`,
        noi: `${r.netOperatingIncome.toLocaleString()} ${currencyLabel}`,
        margin: `${r.profitMargin.toFixed(1)}%`,
      })),
      summaryCards: [
        { label: isAr ? "إيرادات المحفظة" : "Gross Revenue", value: `${metrics.totalRev.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "مصروفات التشغيل" : "Total Expenses", value: `-${metrics.totalExp.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "صافي الدخل التشغيلي (NOI)" : "Net Operating Income", value: `${metrics.totalNoi.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "متوسط هامش الربحية" : "Average Margin", value: `${metrics.avgMargin.toFixed(1)}%` },
      ],
      filename: `Property_P&L_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "قائمة أرباح وخسائر العقارات" : "Property P&L Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "المشروع / العقار" : "Property", key: "property" },
        { header: isAr ? "عدد الوحدات" : "Units", key: "units", isNumber: true },
        { header: isAr ? "إيراد الإيجارات" : "Rent Revenue", key: "rent", isNumber: true },
        { header: isAr ? "إيراد الصيانة والخدمات" : "Services Revenue", key: "services", isNumber: true },
        { header: isAr ? "إجمالي الإيرادات" : "Total Revenue", key: "rev", isNumber: true },
        { header: isAr ? "مصاريف الصيانة" : "Maintenance Exp", key: "maintExp", isNumber: true },
        { header: isAr ? "مصاريف المرافق والتشغيل" : "Ops Exp", key: "opsExp", isNumber: true },
        { header: isAr ? "إجمالي المصروفات" : "Total Expenses", key: "exp", isNumber: true },
        { header: isAr ? "صافي الدخل التشغيلي (NOI)" : "NOI", key: "noi", isNumber: true },
        { header: isAr ? "هامش الربح %" : "Margin %", key: "margin" },
      ],
      rows: filteredRows.map((r) => ({
        property: r.propertyName,
        units: r.unitsCount,
        rent: r.rentalRevenue,
        services: r.maintenanceRevenue + r.otherIncome,
        rev: r.totalRevenue,
        exp: r.totalExpense,
        noi: r.netOperatingIncome,
        margin: `${r.profitMargin.toFixed(1)}%`,
      })),
      filename: `Property_PnL_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "أرباح وخسائر العقارات (Property P&L)" : "Property P&L"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "قائمة أرباح وخسائر العقارات والمنتجعات (Property P&L)" : "Property-Level Profit & Loss Statement"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "مقارنة ربحية كل منتجع ومشروع عقاري بشكل مستقل: الإيرادات، مصاريف التشغيل، وصافي الدخل التشغيلي (NOI) وهوامش الربح."
                : "Compare profitability across properties: segregated revenues, operating expenses, Net Operating Income (NOI), and profit margins."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي إيرادات المحفظة" : "Gross Revenue"}</span>
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "عن كافة المشاريع والوحدات" : "All properties"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "مصروفات التشغيل الإجمالية" : "Operating Expenses"}</span>
              <TrendingDown className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              -{metrics.totalExp.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "صيانة ومرافق ومشتريات" : "Maintenance & ops"}</span>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 p-3.5 border border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">{isAr ? "صافي الدخل التشغيلي (NOI)" : "Net Operating Income"}</span>
              <DollarSign className="size-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
              {metrics.totalNoi.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-emerald-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-700/80 block mt-0.5">{isAr ? "الأرباح التشغيلية الصافية" : "Operational net profit"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "متوسط هامش الربحية" : "Average Margin"}</span>
              <Percent className="size-4 text-purple-600" />
            </div>
            <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              {metrics.avgMargin.toFixed(1)}%
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "عائد التشغيل المالي" : "Operating margin"}</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-white">
            {isAr ? "مقارنة ربحية المشاريع العقارية" : "Property Profitability Breakdown"}
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">{filteredRows.length}</Badge>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث باسم المشروع / المنتجع..." : "Search property..."}
            className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* SEGREGATED P&L TABLE WITH LIGHT THEME HEADER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "المشروع / المنتجع" : "Property / Resort"}</th>
                <th className="p-3.5 text-center">{isAr ? "الوحدات" : "Units"}</th>
                <th className="p-3.5 text-end">{isAr ? "إيراد الإيجارات" : "Rental Revenue"}</th>
                <th className="p-3.5 text-end">{isAr ? "إيراد الصيانة والخدمات" : "Services Revenue"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي المصروفات" : "Total Expenses"}</th>
                <th className="p-3.5 text-end">{isAr ? "صافي الدخل (NOI)" : "NOI"}</th>
                <th className="p-3.5 text-center">{isAr ? "هامش الربح" : "Margin"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.propertyId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 text-emerald-600 shrink-0" />
                        <span>{r.propertyName}</span>
                      </div>
                    </td>

                    <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300">
                      {r.unitsCount}
                    </td>

                    <td className="p-3.5 text-end text-slate-800 dark:text-slate-200 font-medium">
                      {r.rentalRevenue.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end text-slate-800 dark:text-slate-200 font-medium">
                      {(r.maintenanceRevenue + r.otherIncome).toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-bold text-emerald-700 dark:text-emerald-400">
                      {r.totalRevenue.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-bold text-rose-600">
                      -{r.totalExpense.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-black text-sm text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                      {r.netOperatingIncome.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge
                        className={`text-[10px] font-bold ${
                          r.profitMargin >= 30
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : r.profitMargin > 0
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-rose-100 text-rose-800 border-rose-200"
                        }`}
                      >
                        {r.profitMargin.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد بيانات ربحية للمشاريع بعد" : "No property P&L records available"}
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
