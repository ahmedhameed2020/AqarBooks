"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  AlertTriangle,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  Printer,
  Search,
  ShieldCheck,
  TrendingDown,
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
  acquisitionDate: string;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  periodsPosted: number;
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
        a.status.toLowerCase().includes(q),
    );
  }, [assets, searchQuery]);

  const metrics = useMemo(() => {
    const totalCost = assets.reduce((s, a) => s + a.cost, 0);
    const totalAccDep = assets.reduce((s, a) => s + a.accumulatedDepreciation, 0);
    const totalNbv = assets.reduce((s, a) => s + a.netBookValue, 0);
    return { totalCost, totalAccDep, totalNbv, assetsCount: assets.length };
  }, [assets]);

  const hasRegister = assets.length > 0;

  const handleExportPdf = () => {
    if (!hasRegister) return;
    generateFinancialStatementPdf({
      title: isAr ? "سجل الأصول الثابتة والإهلاك المحاسبي" : "Fixed Assets & Depreciation Schedule",
      subtitle: isAr
        ? `سجل الأصول المسجلة فعليًا في النظام — ${organizationName}`
        : `Persisted operational fixed-asset register — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "كود الأصل" : "Asset Code", key: "code", align: "start" },
        { header: isAr ? "اسم الأصل" : "Asset Name", key: "name", align: "start" },
        { header: isAr ? "تاريخ الاقتناء" : "Acquired", key: "date", align: "center" },
        { header: isAr ? "التكلفة" : "Cost", key: "cost", align: "end", isNumber: true },
        { header: isAr ? "مجمع الإهلاك" : "Acc. Dep.", key: "accDep", align: "end", isNumber: true },
        { header: isAr ? "صافي القيمة" : "Net Value", key: "nbv", align: "end", isNumber: true },
      ],
      rows: filteredAssets.map((a) => ({
        code: a.assetCode,
        name: a.name,
        date: a.acquisitionDate,
        cost: a.cost,
        accDep: -a.accumulatedDepreciation,
        nbv: a.netBookValue,
      })),
      summaryCards: [
        { label: isAr ? "عدد الأصول المسجلة" : "Registered Assets", value: metrics.assetsCount.toLocaleString() },
        { label: isAr ? "إجمالي التكلفة" : "Total Cost", value: `${metrics.totalCost.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "مجمع الإهلاك" : "Accumulated Depreciation", value: `-${metrics.totalAccDep.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "صافي القيمة الدفترية" : "Net Book Value", value: `${metrics.totalNbv.toLocaleString()} ${currencyLabel}` },
      ],
      notes: [
        isAr
          ? "يعرض هذا التقرير فقط الأصول المسجلة فعليًا في سجل fixed_assets والإهلاكات المرحّلة لها؛ لا يتم توليد أصول أو تكاليف أو نسب إهلاك افتراضية."
          : "This report includes only persisted fixed_assets and their posted depreciation; no synthetic assets, costs, or depreciation rates are generated.",
      ],
      filename: `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  const handleExportExcel = () => {
    if (!hasRegister) return;
    exportFinancialStatementToExcel({
      title: isAr ? "سجل الأصول الثابتة والإهلاك" : "Fixed Assets Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "كود الأصل" : "Asset Code", key: "code" },
        { header: isAr ? "اسم الأصل" : "Asset Name", key: "name" },
        { header: isAr ? "تاريخ الاقتناء" : "Acquisition Date", key: "acquisitionDate" },
        { header: isAr ? "التكلفة التاريخية" : "Historical Cost", key: "cost", isNumber: true },
        { header: isAr ? "القيمة التخريدية" : "Salvage Value", key: "salvage", isNumber: true },
        { header: isAr ? "العمر بالأشهر" : "Useful Life (Months)", key: "life", isNumber: true },
        { header: isAr ? "مجمع الإهلاك" : "Accumulated Depreciation", key: "accDep", isNumber: true },
        { header: isAr ? "صافي القيمة الدفترية" : "Net Book Value", key: "nbv", isNumber: true },
        { header: isAr ? "فترات الإهلاك المرحلة" : "Posted Periods", key: "periods", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status" },
      ],
      rows: filteredAssets.map((a) => ({
        code: a.assetCode,
        name: a.name,
        acquisitionDate: a.acquisitionDate,
        cost: a.cost,
        salvage: a.salvageValue,
        life: a.usefulLifeMonths,
        accDep: a.accumulatedDepreciation,
        nbv: a.netBookValue,
        periods: a.periodsPosted,
        status: a.status,
      })),
      filename: `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
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
                ? "يعرض هذا التقرير سجل الأصول التشغيلي المسجل فعليًا ومجمع الإهلاك المرحّل له."
                : "This report shows only the persisted operational fixed-asset register and posted depreciation."}
            </p>
          </div>

          {hasRegister && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleExportExcel} variant="outline" size="sm" className="h-9 px-3.5 text-xs font-bold gap-1.5">
                <FileSpreadsheet className="size-3.5 text-emerald-600" />
                <span>{isAr ? "تصدير إكسل" : "Excel"}</span>
              </Button>
              <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-9 px-3.5 text-xs font-bold gap-1.5">
                <FileText className="size-3.5 text-rose-600" />
                <span>{isAr ? "تصدير PDF" : "PDF"}</span>
              </Button>
              <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-9 px-3 text-xs font-bold gap-1.5">
                <Printer className="size-3.5 text-slate-600" />
                <span>{isAr ? "طباعة" : "Print"}</span>
              </Button>
            </div>
          )}
        </div>

        {!hasRegister ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-700 dark:text-rose-400" />
              <div>
                <h2 className="text-sm font-black text-rose-950 dark:text-rose-200">
                  {isAr ? "سجل الأصول التشغيلي لم يُرحّل بعد" : "Operational fixed-asset register has not been migrated"}
                </h2>
                <p className="mt-2 text-xs font-semibold leading-6 text-rose-900/80 dark:text-rose-200/80">
                  {isAr
                    ? "توجد أرصدة أصول ومجمع إهلاك تاريخية في دفتر الأستاذ، لكن جدول fixed_assets لا يحتوي أصولًا موثقة حتى الآن. لذلك لا يعرض AqarBooks أصولًا أو تكاليف أو نسب إهلاك افتراضية. يلزم سجل أصول معتمد قبل تشغيل هذا التقرير تشغيليًا."
                    : "Legacy asset and accumulated-depreciation balances exist in the GL, but fixed_assets currently contains no documented assets. AqarBooks therefore shows no synthetic assets, costs, or depreciation rates. An approved asset register is required before this report becomes operational."}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-black">
                  <Link href="/finance/reports/balance-sheet" className="text-cyan-700 hover:underline dark:text-cyan-400">
                    {isAr ? "فتح الميزانية العمومية" : "Open Balance Sheet"}
                  </Link>
                  <Link href="/finance/reports/legacy-review" className="text-rose-700 hover:underline dark:text-rose-400">
                    {isAr ? "فتح مراجعة الترحيل" : "Open Legacy Review"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
              <Metric label={isAr ? "عدد الأصول" : "Assets"} value={metrics.assetsCount.toLocaleString()} />
              <Metric label={isAr ? "إجمالي التكلفة" : "Total Cost"} value={`${metrics.totalCost.toLocaleString()} ${currencyLabel}`} />
              <Metric label={isAr ? "مجمع الإهلاك" : "Acc. Depreciation"} value={`-${metrics.totalAccDep.toLocaleString()} ${currencyLabel}`} icon="down" />
              <Metric label={isAr ? "صافي القيمة الدفترية" : "Net Book Value"} value={`${metrics.totalNbv.toLocaleString()} ${currencyLabel}`} icon="shield" />
            </div>

            <div className="mt-5 relative max-w-md">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? "بحث بكود الأصل أو الاسم أو الحالة..." : "Search asset code, name, or status..."}
                className="ps-9"
              />
            </div>
          </>
        )}
      </div>

      {hasRegister && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="p-3 text-start">{isAr ? "الكود" : "Code"}</th>
                  <th className="p-3 text-start">{isAr ? "الأصل" : "Asset"}</th>
                  <th className="p-3 text-start">{isAr ? "الاقتناء" : "Acquired"}</th>
                  <th className="p-3 text-end">{isAr ? "التكلفة" : "Cost"}</th>
                  <th className="p-3 text-end">{isAr ? "مجمع الإهلاك" : "Acc. Dep."}</th>
                  <th className="p-3 text-end">{isAr ? "صافي القيمة" : "NBV"}</th>
                  <th className="p-3 text-center">{isAr ? "العمر/شهر" : "Life/Mo"}</th>
                  <th className="p-3 text-center">{isAr ? "فترات مرحلة" : "Posted"}</th>
                  <th className="p-3 text-center">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAssets.map((a) => (
                  <tr key={a.assetCode} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-black text-cyan-700 dark:text-cyan-400">{a.assetCode}</td>
                    <td className="p-3 font-semibold text-slate-900 dark:text-white">{a.name}</td>
                    <td className="p-3 font-mono">{a.acquisitionDate}</td>
                    <td className="p-3 text-end font-mono font-bold">{a.cost.toLocaleString()}</td>
                    <td className="p-3 text-end font-mono font-bold text-rose-600">-{a.accumulatedDepreciation.toLocaleString()}</td>
                    <td className="p-3 text-end font-mono font-black text-cyan-700 dark:text-cyan-400">{a.netBookValue.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono">{a.usefulLifeMonths.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono">{a.periodsPosted.toLocaleString()}</td>
                    <td className="p-3 text-center"><Badge variant="outline" className="text-[10px] font-bold">{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: "down" | "shield" }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500">{label}</span>
        {icon === "down" ? <TrendingDown className="size-4 text-rose-600" /> : icon === "shield" ? <ShieldCheck className="size-4 text-cyan-700" /> : null}
      </div>
      <p className="text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">{value}</p>
    </div>
  );
}
