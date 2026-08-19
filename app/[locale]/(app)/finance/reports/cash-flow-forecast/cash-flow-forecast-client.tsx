"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  TrendingUp,
  TrendingDown,
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
  AlertTriangle,
  Wallet,
  ShieldCheck,
  Clock,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface ForecastPeriodRow {
  periodKey: string;
  periodName: string;
  startingCash: number;
  incomingCheques: number;
  receivablesInflow: number;
  totalInflow: number;
  supplierPayables: number;
  outgoingCheques: number;
  totalOutflow: number;
  netChange: number;
  projectedEndingCash: number;
  isDeficit: boolean;
}

export function CashFlowForecastClient({
  rows,
  initialCash,
  organizationName,
  currency,
  locale,
}: {
  rows: ForecastPeriodRow[];
  initialCash: number;
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalInflows = rows.reduce((s, r) => s + r.totalInflow, 0);
    const totalOutflows = rows.reduce((s, r) => s + r.totalOutflow, 0);
    const net90DaysChange = totalInflows - totalOutflows;
    const finalProjectedCash = rows.length ? rows[rows.length - 1].projectedEndingCash : initialCash;

    return {
      initialCash,
      totalInflows,
      totalOutflows,
      net90DaysChange,
      finalProjectedCash,
    };
  }, [rows, initialCash]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "تقرير توقعات التدفق النقدي والسيولة المستقبلية" : "Cash Flow Forecast & Liquidity Projection",
      subtitle: isAr
        ? `نمذجة التدفقات الداخلة والخارجة لـ 90 يوماً القادمة — ${organizationName}`
        : `90-Day Cash Inflows & Outflows Projection Schedule — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "الفترة الزمنية" : "Period", key: "period", align: "start" },
        { header: isAr ? "رصيد بداية المدة" : "Start Cash", key: "start", align: "end", isNumber: true },
        { header: isAr ? "التدفقات الداخلة (+)" : "Inflows (+)", key: "inflow", align: "end", isNumber: true },
        { header: isAr ? "التدفقات الخارجة (-)" : "Outflows (-)", key: "outflow", align: "end", isNumber: true },
        { header: isAr ? "صافي التغير" : "Net Change", key: "net", align: "end", isNumber: true },
        { header: isAr ? "الرصيد المتوقع نهاية المدة" : "Ending Cash", key: "end", align: "end", isNumber: true },
      ],
      rows: rows.map((r) => ({
        period: r.periodName,
        start: `${r.startingCash.toLocaleString()} ${currencyLabel}`,
        inflow: `+${r.totalInflow.toLocaleString()} ${currencyLabel}`,
        outflow: `-${r.totalOutflow.toLocaleString()} ${currencyLabel}`,
        net: `${r.netChange >= 0 ? "+" : ""}${r.netChange.toLocaleString()} ${currencyLabel}`,
        end: `${r.projectedEndingCash.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "النقدية الحالية بالبنوك" : "Current Cash", value: `${metrics.initialCash.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "إجمالي التدفقات المتوقعة" : "Total Expected Inflows", value: `+${metrics.totalInflows.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "إجمالي الالتزامات المؤكدة" : "Total Expected Outflows", value: `-${metrics.totalOutflows.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "الرصيد المتوقع بنهاية 90 يوماً" : "Projected 90-Day Cash", value: `${metrics.finalProjectedCash.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Cash_Flow_Forecast_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "توقعات التدفق النقدي والسيولة" : "Cash Flow Forecast",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "الفترة الزمنية" : "Period", key: "period" },
        { header: isAr ? "رصيد بداية الفترة" : "Start Cash", key: "start", isNumber: true },
        { header: isAr ? "شيكات مقبوضة واردة" : "Incoming Cheques", key: "chequesIn", isNumber: true },
        { header: isAr ? "إيجارات ومستحقات محصلة" : "Receivables In", key: "duesIn", isNumber: true },
        { header: isAr ? "إجمالي المقبوضات المتوقعة" : "Total Inflows", key: "inflow", isNumber: true },
        { header: isAr ? "مستحقات الموردين" : "AP Outflows", key: "apOut", isNumber: true },
        { header: isAr ? "شيكات صادرة للموردين" : "Outgoing Cheques", key: "chequesOut", isNumber: true },
        { header: isAr ? "إجمالي المدفوعات المتوقعة" : "Total Outflows", key: "outflow", isNumber: true },
        { header: isAr ? "صافي التغير في السيولة" : "Net Change", key: "net", isNumber: true },
        { header: isAr ? "رصيد نهاية الفترة المتوقع" : "Projected Ending Cash", key: "end", isNumber: true },
      ],
      rows: rows.map((r) => ({
        period: r.periodName,
        start: r.startingCash,
        chequesIn: r.incomingCheques,
        duesIn: r.receivablesInflow,
        inflow: r.totalInflow,
        apOut: r.supplierPayables,
        chequesOut: r.outgoingCheques,
        outflow: r.totalOutflow,
        net: r.netChange,
        end: r.projectedEndingCash,
      })),
      filename: `Cash_Flow_Forecast_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
                {isAr ? "توقعات التدفق النقدي (Forecast)" : "Cash Forecast"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "تقرير توقعات التدفق النقدي والسيولة المستقبلية" : "Cash Flow Forecast & Liquidity Projection"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "التخطيط المالي الاستباقي لـ 90 يوماً القادمة: نمذجة أوراق القبض والشيكات المستحقة، الإيجارات، وفواتير الموردين لتفادي أي عجز سيولة."
                : "Forward-looking 90-day cash modeling tracking maturing cheques, scheduled lease collections, and vendor payment obligations."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الرصيد النقدي الفعلي الحالي" : "Current Cash"}</span>
              <Wallet className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.initialCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "رصيد الخزائن والحسابات البنكية" : "Available in banks"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "التدفقات المتوقعة (+90 يوم)" : "Expected Inflows"}</span>
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              +{metrics.totalInflows.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-600 block mt-0.5">{isAr ? "شيكات وإيجارات مستحقة" : "Maturing PDCs & rent"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الالتزامات المتوقعة (-90 يوم)" : "Expected Outflows"}</span>
              <TrendingDown className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              -{metrics.totalOutflows.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-rose-600 block mt-0.5">{isAr ? "فواتير موردين وأجور تشغيل" : "Supplier AP & ops"}</span>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 p-3.5 border border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-300">{isAr ? "الرصيد المتوقع نهاية 90 يوماً" : "Projected Cash"}</span>
              <ShieldCheck className="size-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
              {metrics.finalProjectedCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-emerald-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-700/80 block mt-0.5">{isAr ? "صافي مركز السيولة المتوقع" : "Healthy runway"}</span>
          </div>
        </div>
      </div>

      {/* TABLE WITH LIGHT THEME HEADER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              {isAr ? "جدول التدفقات النقدية المتوقعة حسب الفترات الزمنية" : "Time-Bucket Cash Projection Schedule"}
            </h3>
          </div>
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
            {isAr ? "نموذج سيولة متوازن" : "Stable Runway"}
          </Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "الفترة الزمنية المستهدفة" : "Time Period"}</th>
                <th className="p-3.5 text-end">{isAr ? "رصيد بداية الفترة" : "Starting Cash"}</th>
                <th className="p-3.5 text-end">{isAr ? "شيكات مقبوضة (PDC)" : "PDC Inflows"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي التدفقات الداخلة (+)" : "Total Inflows (+)"}</th>
                <th className="p-3.5 text-end">{isAr ? "فواتير الموردين (AP)" : "Supplier AP"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي التدفقات الخارجة (-)" : "Total Outflows (-)"}</th>
                <th className="p-3.5 text-end">{isAr ? "صافي التغير" : "Net Change"}</th>
                <th className="p-3.5 text-end">{isAr ? "الرصيد المتوقع نهاية الفترة" : "Projected Ending Cash"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {rows.map((r) => (
                <tr
                  key={r.periodKey}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3.5 text-emerald-600 shrink-0" />
                      <span>{r.periodName}</span>
                    </div>
                  </td>

                  <td className="p-3.5 text-end text-slate-700 dark:text-slate-300 font-medium">
                    {r.startingCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className="p-3.5 text-end text-emerald-700 dark:text-emerald-400 font-medium">
                    +{r.incomingCheques.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className="p-3.5 text-end font-bold text-emerald-600">
                    +{r.totalInflow.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className="p-3.5 text-end text-rose-600 font-medium">
                    -{r.supplierPayables.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className="p-3.5 text-end font-bold text-rose-600">
                    -{r.totalOutflow.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className={`p-3.5 text-end font-black ${r.netChange >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
                    {r.netChange >= 0 ? "+" : ""}{r.netChange.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>

                  <td className="p-3.5 text-end font-black text-sm text-slate-950 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                    {r.projectedEndingCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
