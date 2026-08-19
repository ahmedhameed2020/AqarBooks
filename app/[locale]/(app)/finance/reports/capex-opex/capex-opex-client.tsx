"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Wrench,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  Printer,
  ChevronLeft,
  DollarSign,
  CheckCircle2,
  Percent,
  Cpu,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface CapexOpexItem {
  id: string;
  workOrderNumber: string;
  title: string;
  category: string;
  resortName: string;
  type: "CAPEX" | "OPEX";
  contractorName: string;
  cost: number;
  completionDate: string;
  isCapitalized: boolean;
}

export function CapexOpexClient({
  items,
  organizationName,
  currency,
  locale,
}: {
  items: CapexOpexItem[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.workOrderNumber.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.contractorName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesType = selectedType === "ALL" || item.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, selectedType]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalSpend = items.reduce((s, i) => s + i.cost, 0);
    const totalCapex = items.filter((i) => i.type === "CAPEX").reduce((s, i) => s + i.cost, 0);
    const totalOpex = items.filter((i) => i.type === "OPEX").reduce((s, i) => s + i.cost, 0);
    const capexRatio = totalSpend > 0 ? (totalCapex / totalSpend) * 100 : 0;

    return {
      totalSpend,
      totalCapex,
      totalOpex,
      capexRatio,
      ordersCount: items.length,
    };
  }, [items]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX)" : "CAPEX vs OPEX Maintenance Cost Schedule",
      subtitle: isAr
        ? `الفصل المحاسبي بين تحسين الأصول وتكاليف التشغيل — ${organizationName}`
        : `Accounting Classification of Asset Improvements vs Routine Maintenance — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "رقم الأمر" : "WO #", key: "wo", align: "start" },
        { header: isAr ? "بيان أعمال الصيانة" : "Description", key: "desc", align: "start" },
        { header: isAr ? "التصنيف المحاسبي" : "Type", key: "type", align: "center" },
        { header: isAr ? "المقاول المنفذ" : "Contractor", key: "contractor", align: "start" },
        { header: isAr ? "تاريخ الإنجاز" : "Completed", key: "date", align: "center" },
        { header: isAr ? "التكلفة الإجمالية" : "Cost", key: "cost", align: "end", isNumber: true },
      ],
      rows: filteredItems.map((i) => ({
        wo: i.workOrderNumber,
        desc: i.title,
        type: i.type,
        contractor: i.contractorName,
        date: i.completionDate,
        cost: `${i.cost.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي إنفاق الصيانة" : "Total Spend", value: `${metrics.totalSpend.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "رأسمالي معزز للأصول (CAPEX)" : "CAPEX Total", value: `${metrics.totalCapex.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "تشغيلي روتيني (OPEX)" : "OPEX Total", value: `${metrics.totalOpex.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "نسبة الإنفاق الرأسمالي" : "CAPEX Ratio", value: `${metrics.capexRatio.toFixed(1)}%` },
      ],
      filename: `CAPEX_OPEX_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "تقرير مصاريف الصيانة CAPEX vs OPEX" : "CAPEX vs OPEX Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "رقم أمر الصيانة" : "Work Order #", key: "wo" },
        { header: isAr ? "بيان الصيانة" : "Title", key: "title" },
        { header: isAr ? "التصنيف" : "Category", key: "category" },
        { header: isAr ? "النوع المحاسبي" : "Type", key: "type" },
        { header: isAr ? "المقاول" : "Contractor", key: "contractor" },
        { header: isAr ? "تاريخ الإنجاز" : "Completion Date", key: "date" },
        { header: isAr ? "التكلفة" : "Cost", key: "cost", isNumber: true },
      ],
      rows: filteredItems.map((i) => ({
        wo: i.workOrderNumber,
        title: i.title,
        category: i.category,
        type: i.type,
        contractor: i.contractorName,
        date: i.completionDate,
        cost: i.cost,
      })),
      filename: `CAPEX_OPEX_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "الصيانة (CAPEX vs OPEX)" : "CAPEX vs OPEX"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX)" : "CAPEX vs OPEX Maintenance Cost Schedule"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "الفصل المحاسبي بين المصاريف الرأسمالية المعززة لقيمة الأصول (CAPEX) والمصاريف التشغيلية الروتينية (OPEX) لضبط التكاليف."
                : "Accounting classification separating long-term capital improvement projects from routine operating maintenance expenses."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي إنفاق الصيانة" : "Total Spend"}</span>
              <Wrench className="size-4 text-slate-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "كافة الأعمال وأوامر الشغل" : "All work orders"}</span>
          </div>

          <div className="rounded-2xl bg-blue-50/70 p-3.5 border border-blue-200/80 dark:bg-blue-950/20 dark:border-blue-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-900 dark:text-blue-300">{isAr ? "إنفاق رأسمالي (CAPEX)" : "CAPEX Capitalized"}</span>
              <Building2 className="size-4 text-blue-700 dark:text-blue-400" />
            </div>
            <p className="text-xl font-black text-blue-700 dark:text-blue-300 mt-1 font-mono">
              {metrics.totalCapex.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-blue-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-blue-700/80 block mt-0.5">{isAr ? "يضاف للأصول ويُهلك محاسبياً" : "Capital improvements"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إنفاق تشغيلي (OPEX)" : "OPEX Operational"}</span>
              <Wrench className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {metrics.totalOpex.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "يُحمل مباشرة على قائمة الدخل" : "Routine maintenance"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "نسبة الإنفاق الرأسمالي" : "CAPEX Ratio"}</span>
              <Percent className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              {metrics.capexRatio.toFixed(1)}%
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "من إجمالي ميزانية الصيانة" : "Of maintenance budget"}</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "كافة أوامر الصيانة (CAPEX + OPEX)" : "All Work Orders"}</option>
            <option value="CAPEX">{isAr ? "المصاريف الرأسمالية (CAPEX) فقط" : "CAPEX Only"}</option>
            <option value="OPEX">{isAr ? "المصاريف التشغيلية (OPEX) فقط" : "OPEX Only"}</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث برقم الأمر، البيان، المقاول..." : "Search work order..."}
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
                <th className="p-3.5 text-start">{isAr ? "رقم الأمر" : "WO #"}</th>
                <th className="p-3.5 text-start">{isAr ? "بيان أعمال الصيانة والتطوير" : "Work Description"}</th>
                <th className="p-3.5 text-start">{isAr ? "التصنيف" : "Category"}</th>
                <th className="p-3.5 text-center">{isAr ? "النوع المحاسبي" : "Type"}</th>
                <th className="p-3.5 text-start">{isAr ? "المقاول المنفذ" : "Contractor"}</th>
                <th className="p-3.5 text-center">{isAr ? "تاريخ الإنجاز" : "Completed"}</th>
                <th className="p-3.5 text-end">{isAr ? "التكلفة الإجمالية" : "Total Cost"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredItems.length ? (
                filteredItems.map((i) => (
                  <tr
                    key={i.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="size-3.5 text-amber-600 shrink-0" />
                        <span>{i.workOrderNumber}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      {i.title}
                    </td>

                    <td className="p-3.5 font-sans text-slate-600 dark:text-slate-400">
                      {i.category}
                    </td>

                    <td className="p-3.5 text-center font-sans">
                      <Badge
                        className={`text-[10px] font-bold ${
                          i.type === "CAPEX"
                            ? "bg-blue-100 text-blue-800 border-blue-200"
                            : "bg-amber-100 text-amber-800 border-amber-200"
                        }`}
                      >
                        {i.type === "CAPEX" ? "CAPEX (رأسمالي)" : "OPEX (تشغيلي)"}
                      </Badge>
                    </td>

                    <td className="p-3.5 font-sans font-medium text-slate-800 dark:text-slate-200">
                      {i.contractorName}
                    </td>

                    <td className="p-3.5 text-center text-slate-500 text-[11px]">
                      {i.completionDate}
                    </td>

                    <td className="p-3.5 text-end font-black text-sm text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                      {i.cost.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد أوامر صيانة مطابقة" : "No maintenance work orders found"}
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
