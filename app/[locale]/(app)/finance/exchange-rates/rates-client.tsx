"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Coins,
  Download,
  Calendar,
  CheckCircle2,
  TrendingUp,
  X,
  Sparkles,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/ui/country-flag";
import { getCurrencyLabel } from "@/lib/currency";
import ExcelJS from "exceljs";
import { RecordRateForm } from "./rate-forms";

export type RateRow = {
  id: string;
  foreign_currency: string;
  base_currency: string;
  rate_date: string;
  base_per_unit: number | string;
  source: string | null;
  is_latest: boolean;
};

const currencyToCountryCode: Record<string, string> = {
  EGP: "EG",
  SAR: "SA",
  AED: "AE",
  KWD: "KW",
  QAR: "QA",
  BHD: "BH",
  OMR: "OM",
  USD: "GLOBAL",
  EUR: "GLOBAL",
  GBP: "GLOBAL",
};

interface RatesClientProps {
  rates: RateRow[];
  baseCurrency: string;
  canManage: boolean;
  locale: string;
  organizationId: string;
  organizationName?: string;
}

export function RatesClient({
  rates,
  baseCurrency,
  canManage,
  locale,
  organizationId,
  organizationName,
}: RatesClientProps) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");
  const [recordOpen, setRecordOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const baseCountryCode = currencyToCountryCode[baseCurrency] || "GLOBAL";
  const baseSymbol = getCurrencyLabel(baseCurrency, isAr);

  const latestRates = useMemo(() => rates.filter((r) => r.is_latest), [rates]);
  const foreignCurrencies = useMemo(() => {
    const set = new Set(rates.map((r) => r.foreign_currency));
    return Array.from(set);
  }, [rates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rates.filter((r) => {
      if (currencyFilter !== "ALL" && r.foreign_currency !== currencyFilter) return false;
      if (!q) return true;
      return (
        r.foreign_currency.toLowerCase().includes(q) ||
        r.base_currency.toLowerCase().includes(q) ||
        (r.source && r.source.toLowerCase().includes(q))
      );
    });
  }, [rates, currencyFilter, query]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AqarBooks FX Module";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(isAr ? "أسعار الصرف" : "Exchange Rates", {
        views: [{ rightToLeft: isAr }],
      });

      worksheet.mergeCells("A1:F1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `${isAr ? "سجل أسعار الصرف والعملات" : "Exchange Rates Registry"} - ${
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
        isAr ? "العملة الأجنبية" : "Foreign Currency",
        isAr ? "العملة الأساسية" : "Base Currency",
        isAr ? `سعر الصرف (1 وحدة =)` : `Exchange Rate (1 Unit =)`,
        isAr ? "تاريخ السعر" : "Rate Date",
        isAr ? "المصدر / البنك" : "Source",
        isAr ? "الحالة" : "Status",
      ];

      worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      worksheet.getRow(3).height = 24;

      filtered.forEach((r) => {
        worksheet.addRow([
          r.foreign_currency,
          r.base_currency,
          Number(r.base_per_unit),
          r.rate_date,
          r.source || "—",
          r.is_latest ? (isAr ? "السعر الأحدث" : "Latest Active") : isAr ? "سجل تاريخي" : "Historical",
        ]);
      });

      worksheet.columns = [
        { width: 18 },
        { width: 18 },
        { width: 24 },
        { width: 16 },
        { width: 24 },
        { width: 16 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Exchange_Rates_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export exchange rates:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Currency Pair Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {latestRates.map((r) => {
          const flagCode = currencyToCountryCode[r.foreign_currency] || "GLOBAL";
          const rateVal = Number(r.base_per_unit);
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CountryFlag countryCode={flagCode} className="w-6 h-4.5 rounded-xs" />
                  <span className="font-bold text-xs text-slate-900 font-mono">
                    {r.foreign_currency} / {r.base_currency}
                  </span>
                </div>
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                  {isAr ? "نشط" : "Latest"}
                </Badge>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 font-semibold block">
                  1 {r.foreign_currency} =
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                    {rateVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{baseSymbol}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                <div className="flex items-center gap-1 font-mono">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{r.rate_date}</span>
                </div>
                {r.source && <span className="truncate max-w-[110px]">{r.source}</span>}
              </div>
            </div>
          );
        })}

        {/* Base Currency Card */}
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4 shadow-xs space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CountryFlag countryCode={baseCountryCode} className="w-6 h-4.5 rounded-xs" />
              <span className="font-bold text-xs text-blue-950 font-mono">
                {baseCurrency} (Base)
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-200/60 px-2 py-0.5 text-[10px] font-extrabold text-blue-800">
              <Sparkles className="size-3" />
              {isAr ? "العملة الأساسية" : "Base"}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-blue-700 font-semibold block">
              {isAr ? "العملة المعتمدة للمؤسسة" : "Organization Currency"}
            </span>
            <span className="text-lg font-black text-blue-950 block">
              {baseCurrency} · {baseSymbol}
            </span>
          </div>

          <p className="text-[10px] text-blue-600 border-t border-blue-200/60 pt-2">
            {isAr ? "جميع القيود والتقارير تُقوَّم بهذه العملة" : "All books evaluate to this currency"}
          </p>
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
                ? "ابحث بكود العملة أو المصدر..."
                : "Search by currency code or source..."
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
          {foreignCurrencies.length > 0 && (
            <select
              value={currencyFilter}
              onChange={(e) => setCurrencyFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">{isAr ? "جميع العملات" : "All Currencies"}</option>
              {foreignCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}

          {/* Export */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !rates.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Download className="size-3.5 text-blue-600" />
            <span>{isExporting ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* Record Rate Trigger */}
          {canManage && (
            <Button
              type="button"
              onClick={() => setRecordOpen(true)}
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{isAr ? "تسجيل سعر صرف جديد" : "Record Rate"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. Main Rates Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <tr className="text-start font-bold">
                <th className="px-4 py-3 text-start font-black">{isAr ? "العملة" : "Currency"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "سعر الصرف (1 وحدة =)" : "Exchange Rate"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "تاريخ السعر" : "Rate Date"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "المصدر" : "Source"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "الحالة" : "Status"}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length ? (
                filtered.map((r) => {
                  const flag = currencyToCountryCode[r.foreign_currency] || "GLOBAL";
                  const rateVal = Number(r.base_per_unit);

                  return (
                    <tr key={r.id} className="group transition-colors hover:bg-slate-50/90">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <CountryFlag countryCode={flag} className="w-6 h-4.5 rounded-xs shadow-2xs" />
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {r.foreign_currency}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-slate-900 text-sm">
                        {rateVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}{" "}
                        <span className="text-xs font-normal text-slate-400 font-sans">{baseCurrency}</span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {r.rate_date}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 font-medium">
                        {r.source || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {r.is_latest ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            <CheckCircle2 className="size-3 me-1" />
                            {isAr ? "السعر الأحدث" : "Latest Active"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-500 font-bold text-[10px]">
                            {isAr ? "تاريخي" : "Historical"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500 space-y-2">
                    <Coins className="size-8 mx-auto text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">
                      {isAr ? "لا توجد أسعار صرف مسجلة" : "No exchange rates found"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Rate Modal */}
      {recordOpen && (
        <RecordRateForm
          open={recordOpen}
          onOpenChange={setRecordOpen}
          organizationId={organizationId}
          baseCurrency={baseCurrency}
          locale={locale}
        />
      )}
    </div>
  );
}
