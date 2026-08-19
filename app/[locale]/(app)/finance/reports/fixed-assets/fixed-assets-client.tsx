"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Layers,
  Building2,
  Calendar,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingDown,
  Printer,
  ChevronLeft,
  DollarSign,
  CheckCircle2,
  Percent,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface FixedAssetItem {
  assetCode: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost: number;
  depreciationRate: number;
  annualDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  status: string;
}

export function FixedAssetsClient({
  assets,
  organizationName,
  currency,
  locale,
}: {
  assets: FixedAssetItem[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const q = searchQuery.toLowerCase().trim();
    return assets.filter(
      (a) =>
        a.assetCode.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const totalCost = assets.reduce((s, a) => s + a.cost, 0);
    const totalAccDep = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
    const totalNbv = assets.reduce((s, a) => s + a.netBookValue, 0);
    const totalAnnualDep = assets.reduce((s, a) => s + a.annualDepreciation, 0);

    return {
      totalCost,
      totalAccDep,
      totalNbv,
      totalAnnualDep,
      assetsCount: assets.length,
    };
  }, [assets]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "سجل الأصول الثابتة والإهلاك المحاسبي" : "Fixed Assets & Depreciation Schedule",
      subtitle: isAr
        ? `حصر الأصول الرأسمالية والمعدات وصافي القيمة الدفترية — ${organizationName}`
        : `Fixed Assets Register & Net Book Value Schedule — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "كود الأصل" : "Asset Code", key: "code", align: "start" },
        { header: isAr ? "اسم الأصل والمعدة" : "Asset Name", key: "name", align: "start" },
        { header: isAr ? "تاريخ الاقتناء" : "Acquired", key: "date", align: "center" },
        { header: isAr ? "التكلفة التاريخية" : "Cost", key: "cost", align: "end", isNumber: true },
        { header: isAr ? "نسبة الإهلاك" : "Rate", key: "rate", align: "center" },
        { header: isAr ? "مجمع الإهلاك" : "Acc. Dep.", key: "accDep", align: "end", isNumber: true },
        { header: isAr ? "صافي القيمة (NBV)" : "Net Value", key: "nbv", align: "end", isNumber: true },
      ],
      rows: filteredAssets.map((a) => ({
        code: a.assetCode,
        name: a.name,
        date: a.purchaseDate,
        cost: `${a.cost.toLocaleString()} ${currencyLabel}`,
        rate: `${a.depreciationRate}%`,
        accDep: `-${a.accumulatedDepreciation.toLocaleString()} ${currencyLabel}`,
        nbv: `${a.netBookValue.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي التكلفة التاريخية" : "Total Cost", value: `${metrics.totalCost.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "مجمع الإهلاك المتراكم" : "Total Acc. Dep.", value: `-${metrics.totalAccDep.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "صافي القيمة الدفترية (NBV)" : "Net Book Value", value: `${metrics.totalNbv.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "قسط الإهلاك السنوي" : "Annual Run Rate", value: `${metrics.totalAnnualDep.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "سجل الأصول الثابتة والإهلاك" : "Fixed Assets Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "كود الأصل" : "Asset Code", key: "code" },
        { header: isAr ? "اسم الأصل" : "Asset Name", key: "name" },
        { header: isAr ? "التصنيف" : "Category", key: "category" },
        { header: isAr ? "تاريخ الاقتناء" : "Purchase Date", key: "purchaseDate" },
        { header: isAr ? "تكلفة الشراء" : "Cost", key: "cost", isNumber: true },
        { header: isAr ? "نسبة الإهلاك %" : "Dep Rate %", key: "rate" },
        { header: isAr ? "الإهلاك السنوي" : "Annual Dep", key: "annualDep", isNumber: true },
        { header: isAr ? "مجمع الإهلاك" : "Acc Dep", key: "accDep", isNumber: true },
        { header: isAr ? "صافي القيمة الدفترية" : "Net Book Value", key: "nbv", isNumber: true },
      ],
      rows: filteredAssets.map((a) => ({
        code: a.assetCode,
        name: a.name,
        category: a.category,
        purchaseDate: a.purchaseDate,
        cost: a.cost,
        rate: `${a.depreciationRate}%`,
        annualDep: a.annualDepreciation,
        accDep: a.accumulatedDepreciation,
        nbv: a.netBookValue,
      })),
      filename: `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-600 dark:text-cyan-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "الأصول الثابتة والإهلاك" : "Fixed Assets"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "سجل الأصول الثابتة والإهلاك المحاسبي" : "Fixed Assets & Depreciation Schedule"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "حصر الأصول الرأسمالية والمعدات والمنشآت المشتركة، تتبع أقساط الإهلاك ومجمعاتها، واحتساب صافي القيمة الدفترية (NBV)."
                : "Comprehensive fixed assets register tracking capital expenditure, depreciation schedules, and Net Book Value (NBV)."}
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
              onClick={() => window.print()}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي التكلفة التاريخية" : "Total Asset Cost"}</span>
              <DollarSign className="size-4 text-cyan-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "قيمة الاقتناء والشراء" : "Historical cost"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "مجمع الإهلاك المتراكم" : "Acc. Depreciation"}</span>
              <TrendingDown className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              -{metrics.totalAccDep.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "إجمالي المستهلك محاسبياً" : "Accumulated run"}</span>
          </div>

          <div className="rounded-2xl bg-cyan-50/70 p-3.5 border border-cyan-200/80 dark:bg-cyan-950/20 dark:border-cyan-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-300">{isAr ? "صافي القيمة الدفترية (NBV)" : "Net Book Value"}</span>
              <ShieldCheck className="size-4 text-cyan-700 dark:text-cyan-400" />
            </div>
            <p className="text-xl font-black text-cyan-700 dark:text-cyan-300 mt-1 font-mono">
              {metrics.totalNbv.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-cyan-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-cyan-700/80 block mt-0.5">{isAr ? "القيمة الحالية بالمركز المالي" : "Current balance"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "قسط الإهلاك السنوي" : "Annual Run Rate"}</span>
              <Percent className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              {metrics.totalAnnualDep.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "عبء الإهلاك السنوي" : "Annual expense"}</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-white">
            {isAr ? "جدول حصر الأصول ومعدلات الإهلاك" : "Capital Assets Register"}
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">{filteredAssets.length}</Badge>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بكود الأصل، الاسم، التصنيف..." : "Search asset..."}
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
                <th className="p-3.5 text-start">{isAr ? "كود الأصل" : "Asset Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "اسم الأصل والمعدة" : "Asset Description"}</th>
                <th className="p-3.5 text-start">{isAr ? "التصنيف" : "Category"}</th>
                <th className="p-3.5 text-center">{isAr ? "تاريخ الاقتناء" : "Acquired"}</th>
                <th className="p-3.5 text-end">{isAr ? "تكلفة الشراء" : "Cost"}</th>
                <th className="p-3.5 text-center">{isAr ? "نسبة الإهلاك" : "Rate"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإهلاك السنوي" : "Annual Dep."}</th>
                <th className="p-3.5 text-end">{isAr ? "مجمع الإهلاك" : "Acc. Dep."}</th>
                <th className="p-3.5 text-end">{isAr ? "صافي القيمة الدفترية" : "Net Book Value"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredAssets.length ? (
                filteredAssets.map((a) => (
                  <tr
                    key={a.assetCode}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="size-3.5 text-cyan-600 shrink-0" />
                        <span>{a.assetCode}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      {a.name}
                    </td>

                    <td className="p-3.5 font-sans text-slate-600 dark:text-slate-400">
                      {a.category}
                    </td>

                    <td className="p-3.5 text-center text-slate-500 text-[11px]">
                      {a.purchaseDate}
                    </td>

                    <td className="p-3.5 text-end font-bold text-slate-900 dark:text-white">
                      {a.cost.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge variant="outline" className="text-[10px] bg-slate-50 font-bold">{a.depreciationRate}%</Badge>
                    </td>

                    <td className="p-3.5 text-end text-purple-600 font-medium">
                      {a.annualDepreciation.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end text-rose-600 font-bold">
                      -{a.accumulatedDepreciation.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-black text-sm text-cyan-700 dark:text-cyan-300 bg-slate-50/50 dark:bg-slate-800/30">
                      {a.netBookValue.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد أصول ثابتة مسجلة" : "No fixed assets found"}
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
