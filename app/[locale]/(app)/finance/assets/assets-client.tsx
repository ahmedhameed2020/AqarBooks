"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Play,
  Trash2,
  Download,
  Printer,
  Building2,
  TrendingDown,
  Layers,
  Coins,
  CheckCircle2,
  AlertCircle,
  Clock,
  Filter,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import ExcelJS from "exceljs";
import { RegisterAssetForm, RunDepreciationForm, DisposeAssetForm, type Option } from "./asset-forms";

export type AssetRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  status: string;
  acquisition_date: string;
  acquisition_cost: number | string;
  salvage_value: number | string;
  useful_life_months: number;
  accumulated: number | string;
  net_book_value: number | string;
  remaining: number | string;
  periods_posted: number | string;
};

const n = (v: number | string) => Number(v ?? 0);

interface AssetsClientProps {
  assets: AssetRow[];
  assetAccounts: Option[];
  deprAccounts: Option[];
  expenseAccounts: Option[];
  gainAccounts: Option[];
  lossAccounts: Option[];
  periods: Option[];
  canManage: boolean;
  locale: string;
  currency: string;
  organizationName?: string;
}

export function AssetsClient({
  assets,
  assetAccounts,
  deprAccounts,
  expenseAccounts,
  gainAccounts,
  lossAccounts,
  periods,
  canManage,
  locale,
  currency,
  organizationName,
}: AssetsClientProps) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const [registerOpen, setRegisterOpen] = useState(false);
  const [depreciateOpen, setDepreciateOpen] = useState(false);
  const [disposeAsset, setDisposeAsset] = useState<AssetRow | null>(null);

  const currencySymbol = getCurrencyLabel(currency, isAr);

  // Financial KPI totals
  const totalCost = useMemo(() => assets.reduce((sum, a) => sum + n(a.acquisition_cost), 0), [assets]);
  const totalAccumulated = useMemo(() => assets.reduce((sum, a) => sum + n(a.accumulated), 0), [assets]);
  const totalBookValue = useMemo(() => assets.reduce((sum, a) => sum + n(a.net_book_value), 0), [assets]);
  const activeCount = useMemo(() => assets.filter((a) => a.status === "ACTIVE").length, [assets]);
  const disposedCount = useMemo(() => assets.filter((a) => a.status === "DISPOSED").length, [assets]);

  // Overall depreciation progress ratio
  const overallDeprRatio = totalCost > 0 ? (totalAccumulated / totalCost) * 100 : 0;

  // Filtered rows
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        a.name_ar.toLowerCase().includes(q) ||
        a.name_en.toLowerCase().includes(q)
      );
    });
  }, [assets, statusFilter, query]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AqarBooks Fixed Assets Module";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(isAr ? "الأصول الثابتة" : "Fixed Assets", {
        views: [{ rightToLeft: isAr }],
      });

      worksheet.mergeCells("A1:H1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `${isAr ? "سجل الأصول الثابتة ومجمع الإهلاك" : "Fixed Assets Register"} - ${
        organizationName || "AqarBooks"
      }`;
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(1).height = 32;

      worksheet.getRow(3).values = [
        isAr ? "رمز الأصل" : "Asset Code",
        isAr ? "اسم الأصل" : "Asset Name",
        isAr ? "تاريخ الشراء" : "Acquisition Date",
        isAr ? `تكلفة الشراء (${currency})` : `Cost (${currency})`,
        isAr ? `مجمع الإهلاك (${currency})` : `Accumulated (${currency})`,
        isAr ? `صافي القيمة الدفترية (${currency})` : `Net Book Value (${currency})`,
        isAr ? "العمر الإنتاجي (شهور)" : "Useful Life (mo)",
        isAr ? "الحالة" : "Status",
      ];

      worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      worksheet.getRow(3).height = 24;

      filtered.forEach((a) => {
        worksheet.addRow([
          a.code,
          isAr ? a.name_ar : a.name_en,
          a.acquisition_date,
          n(a.acquisition_cost),
          n(a.accumulated),
          n(a.net_book_value),
          a.useful_life_months,
          a.status === "ACTIVE"
            ? isAr
              ? "نشط"
              : "Active"
            : isAr
            ? "مستبعد / خردة"
            : "Disposed",
        ]);
      });

      worksheet.columns = [
        { width: 14 },
        { width: 30 },
        { width: 16 },
        { width: 20 },
        { width: 20 },
        { width: 22 },
        { width: 18 },
        { width: 16 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export assets:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "سجل الأصول الثابتة والإهلاك" : "Fixed Assets & Depreciation Register",
        subtitle: isAr
          ? "بيان الأصول الثابتة، تكلفة الاقتناء، مجمع الإهلاك، وصافي القيمة الدفترية"
          : "Fixed asset costs, accumulated straight-line depreciation, and net book values",
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "كود الأصل" : "Code", key: "code", align: "start", width: "12%" },
          { header: isAr ? "اسم الأصل" : "Asset Name", key: "name", align: "start", width: "24%" },
          { header: isAr ? "تاريخ الاقتناء" : "Acquired", key: "date", align: "center", width: "14%" },
          { header: isAr ? "تكلفة الشراء" : "Cost", key: "cost", align: "end", isNumber: true, width: "16%" },
          { header: isAr ? "مجمع الإهلاك" : "Accumulated", key: "accumulated", align: "end", isNumber: true, width: "16%" },
          { header: isAr ? "القيمة الدفترية" : "Book Value", key: "bookVal", align: "end", isNumber: true, width: "18%" },
        ],
        rows: filtered.map((a) => ({
          code: a.code,
          name: isAr ? a.name_ar : a.name_en,
          date: a.acquisition_date,
          cost: n(a.acquisition_cost),
          accumulated: n(a.accumulated),
          bookVal: n(a.net_book_value),
        })),
        totalRow: {
          code: isAr ? "الإجمالي" : "Total",
          name: "",
          date: "",
          cost: totalCost,
          accumulated: totalAccumulated,
          bookVal: totalBookValue,
        },
        summaryCards: [
          {
            label: isAr ? "إجمالي التكلفة التاريخية" : "Total Acquisition Cost",
            value: `${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
          },
          {
            label: isAr ? "مجمع الإهلاك المتراكم" : "Accumulated Depreciation",
            value: `${totalAccumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
          },
          {
            label: isAr ? "صافي القيمة الدفترية" : "Net Book Value",
            value: `${totalBookValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
            highlight: true,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Interactive KPI Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "إجمالي التكلفة التاريخية" : "Total Acquisition Cost"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {assets.length} {isAr ? "أصل مسجل في الدفاتر" : "total assets"}
          </p>
        </div>

        {/* Accumulated Depreciation */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "مجمع الإهلاك المتراكم" : "Accumulated Depreciation"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <TrendingDown className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-700 tracking-tight">
              {totalAccumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-amber-600">{currencySymbol}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, overallDeprRatio))}%` }}
              />
            </div>
            <span className="font-bold font-mono">{overallDeprRatio.toFixed(1)}%</span>
          </div>
        </div>

        {/* Net Book Value */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "صافي القيمة الدفترية" : "Net Book Value"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Building2 className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              {totalBookValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-emerald-600">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "القيمة الصافية بعد خصم الإهلاك" : "Current asset balance"}
          </p>
        </div>

        {/* Status Count */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "حالة الأصول" : "Asset Status"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Layers className="size-4" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <span className="text-lg font-black text-slate-900">{activeCount}</span>
              <span className="text-[10px] font-bold text-emerald-700 block">{isAr ? "نشط" : "Active"}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="space-y-0.5">
              <span className="text-lg font-black text-slate-900">{disposedCount}</span>
              <span className="text-[10px] font-bold text-slate-500 block">{isAr ? "مستبعد" : "Disposed"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Action Controls & Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? "ابحث برمز الأصل، الاسم بالعربية أو الإنجليزية..."
                : "Search by asset code or name..."
            }
            className="ps-9 pe-9 h-10 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-600"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute inset-y-0 end-3 my-auto text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Actions & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">{isAr ? "جميع الحالات" : "All Statuses"}</option>
            <option value="ACTIVE">{isAr ? "الأصول النشطة" : "Active"}</option>
            <option value="DISPOSED">{isAr ? "المستبعدة / خردة" : "Disposed"}</option>
          </select>

          {/* Export PDF */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={!assets.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / PDF" : "Print / PDF"}</span>
          </Button>

          {/* Export Excel */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !assets.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isExporting ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* Run Depreciation Modal Trigger */}
          {canManage && assets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setDepreciateOpen(true)}
              className="h-10 rounded-xl border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100/70 text-xs font-bold gap-2 cursor-pointer"
            >
              <Play className="size-3.5 text-amber-700 fill-amber-700" />
              <span>{isAr ? "احتساب الإهلاك الدوري" : "Run Depreciation"}</span>
            </Button>
          )}

          {/* Register Asset Modal Trigger */}
          {canManage && (
            <Button
              type="button"
              onClick={() => setRegisterOpen(true)}
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{isAr ? "تسجيل أصل جديد" : "New Asset"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. Main Assets Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <tr className="text-start font-bold">
                <th className="px-4 py-3 text-start font-black">{isAr ? "الرمز" : "Code"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "اسم الأصل" : "Asset"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "تاريخ الشراء" : "Acquired"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "التكلفة" : "Cost"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "مجمع الإهلاك" : "Accumulated"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "القيمة الدفترية" : "Book Value"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "الحالة" : "Status"}</th>
                <th className="px-4 py-3 text-end font-black">
                  <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length ? (
                filtered.map((a) => {
                  const cost = n(a.acquisition_cost);
                  const accumulated = n(a.accumulated);
                  const bookVal = n(a.net_book_value);
                  const deprRatio = cost > 0 ? (accumulated / cost) * 100 : 0;
                  const isDisposed = a.status === "DISPOSED";

                  return (
                    <tr
                      key={a.id}
                      className={`group transition-colors hover:bg-slate-50/90 ${
                        isDisposed ? "opacity-60 bg-slate-50/40" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-900">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {a.code}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 block text-xs sm:text-sm">
                            {isAr ? a.name_ar : a.name_en}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {isAr ? a.name_en : a.name_ar}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {a.acquisition_date}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900 font-mono">
                        {cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] font-sans font-normal text-slate-400">{currencySymbol}</span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono">
                        <div className="space-y-1">
                          <span className="font-bold text-amber-700 block">
                            {accumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] font-sans font-normal text-amber-600">{currencySymbol}</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, deprRatio))}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-sans">
                              {a.periods_posted} {isAr ? "فترات" : "periods"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-emerald-700 text-sm">
                        {bookVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] font-sans font-normal text-emerald-600">{currencySymbol}</span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {isDisposed ? (
                          <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-500 font-bold text-[10px]">
                            {isAr ? "مستبعد / خردة" : "Disposed"}
                          </Badge>
                        ) : deprRatio >= 100 ? (
                          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 font-bold text-[10px]">
                            {isAr ? "مهلك بالكامل" : "Fully Depreciated"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            <CheckCircle2 className="size-3 me-1" />
                            {isAr ? "نشط" : "Active"}
                          </Badge>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-end">
                        {canManage && !isDisposed && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisposeAsset(a)}
                            className="h-8 gap-1.5 px-2 text-xs font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-3.5" />
                            <span>{isAr ? "تخريد" : "Dispose"}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500 space-y-2">
                    <Building2 className="size-8 mx-auto text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">
                      {isAr ? "لا توجد أصول مسجلة مطابقة للبحث" : "No fixed assets found"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {isAr ? "يمكنك تسجيل أصل ثابت جديد بالنقر على الزر أعلاه" : "Click 'New Asset' to record a fixed asset"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialogs */}
      {registerOpen && (
        <RegisterAssetForm
          open={registerOpen}
          onOpenChange={setRegisterOpen}
          assetAccounts={assetAccounts}
          deprAccounts={deprAccounts}
          expenseAccounts={expenseAccounts}
          locale={locale}
        />
      )}

      {depreciateOpen && (
        <RunDepreciationForm
          open={depreciateOpen}
          onOpenChange={setDepreciateOpen}
          periods={periods}
          locale={locale}
        />
      )}

      {disposeAsset && (
        <DisposeAssetForm
          open={!!disposeAsset}
          onOpenChange={(open) => {
            if (!open) setDisposeAsset(null);
          }}
          assetId={disposeAsset.id}
          assetCode={disposeAsset.code}
          assetName={isAr ? disposeAsset.name_ar : disposeAsset.name_en}
          gainAccounts={gainAccounts}
          lossAccounts={lossAccounts}
          periods={periods}
          locale={locale}
        />
      )}
    </div>
  );
}
