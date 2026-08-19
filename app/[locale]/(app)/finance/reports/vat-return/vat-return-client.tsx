"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Scale,
  Landmark,
  ShieldCheck,
  Percent,
  FileSpreadsheet,
  FileText,
  Printer,
  ChevronLeft,
  DollarSign,
  Search,
  CheckCircle2,
  FileCheck2,
  AlertCircle,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface VatDecisionItem {
  id: string;
  unitCode: string;
  nature: string;
  date: string;
  base: number;
  rate: number;
  vat: number;
  gross: number;
  isExempt: boolean;
}

export interface VatReturnData {
  taxpayerId: string;
  jurisdiction: string;
  periodLabel: string;
  outputTaxableBase: number;
  outputVatTotal: number;
  exemptBaseTotal: number;
  inputTaxableBase: number;
  inputVatTotal: number;
  netVatPayable: number;
  decisionsCount: number;
  decisions: VatDecisionItem[];
}

export function VatReturnClient({
  data,
  organizationName,
  currency,
  locale,
}: {
  data: VatReturnData;
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDecisions = data.decisions.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      d.unitCode.toLowerCase().includes(q) ||
      d.nature.toLowerCase().includes(q) ||
      d.date.includes(q)
    );
  });

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "إقرار ضريبة القيمة المضافة ومطابقة الضرائب" : "Statutory VAT Return & Tax Audit Statement",
      subtitle: isAr
        ? `الفترة الضريبية: ${data.periodLabel} — الرقم الضريبي: ${data.taxpayerId}`
        : `Tax Period: ${data.periodLabel} — Tax ID: ${data.taxpayerId}`,
      organizationName,
      taxNumber: data.taxpayerId,
      currencyLabel,
      dateRangeLabel: data.periodLabel,
      columns: [
        { header: isAr ? "بند الإقرار الضريبي" : "VAT Return Line Item", key: "line", align: "start" },
        { header: isAr ? "الوعاء الصافي الخاضع" : "Taxable Base", key: "base", align: "end", isNumber: true },
        { header: isAr ? "مبلغ الضريبة" : "VAT Amount", key: "vat", align: "end", isNumber: true },
      ],
      rows: [
        {
          line: isAr ? "1. المبيعات والتوريدات الخاضعة بالنسبة القياسية" : "1. Standard Rated Supplies",
          base: `${data.outputTaxableBase.toLocaleString()} ${currencyLabel}`,
          vat: `${data.outputVatTotal.toLocaleString()} ${currencyLabel}`,
        },
        {
          line: isAr ? "2. المبيعات والتوريدات المعفاة (0%)" : "2. Zero-Rated & Exempt Supplies",
          base: `${data.exemptBaseTotal.toLocaleString()} ${currencyLabel}`,
          vat: `0.00 ${currencyLabel}`,
        },
        {
          line: isAr ? "3. إجمالي ضريبة المخرجات (Output VAT)" : "3. Total Output VAT",
          base: `${(data.outputTaxableBase + data.exemptBaseTotal).toLocaleString()} ${currencyLabel}`,
          vat: `${data.outputVatTotal.toLocaleString()} ${currencyLabel}`,
        },
        {
          line: isAr ? "4. المشتريات والمصروفات الخاضعة للضريبة (Input VAT)" : "4. Recoverable Input VAT",
          base: `${data.inputTaxableBase.toLocaleString()} ${currencyLabel}`,
          vat: `-${data.inputVatTotal.toLocaleString()} ${currencyLabel}`,
        },
        {
          line: isAr ? "5. صافي ضريبة القيمة المضافة المستحقة للسداد" : "5. Net VAT Payable to Tax Authority",
          base: "—",
          vat: `${data.netVatPayable.toLocaleString()} ${currencyLabel}`,
        },
      ],
      summaryCards: [
        { label: isAr ? "إجمالي الوعاء الخاضع" : "Total Taxable Base", value: `${data.outputTaxableBase.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "ضريبة المخرجات" : "Output VAT", value: `${data.outputVatTotal.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "ضريبة المدخلات القابلة للخصم" : "Input VAT", value: `-${data.inputVatTotal.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "صافي الضريبة المستحقة" : "Net VAT Payable", value: `${data.netVatPayable.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `VAT_Return_${data.periodLabel}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "كشف إقرار ضريبة القيمة المضافة" : "VAT Return Statement",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "الوحدة / المستند" : "Document", key: "unit" },
        { header: isAr ? "طبيعة الإيراد" : "Nature", key: "nature" },
        { header: isAr ? "تاريخ القرار" : "Date", key: "date" },
        { header: isAr ? "الوعاء الصافي" : "Base", key: "base", isNumber: true },
        { header: isAr ? "نسبة الضريبة" : "Rate", key: "rate" },
        { header: isAr ? "مبلغ الضريبة" : "VAT", key: "vat", isNumber: true },
        { header: isAr ? "الإجمالي" : "Gross", key: "gross", isNumber: true },
      ],
      rows: filteredDecisions.map((d) => ({
        unit: d.unitCode,
        nature: d.nature,
        date: d.date,
        base: d.base,
        rate: `${d.rate}%`,
        vat: d.vat,
        gross: d.gross,
      })),
      filename: `VAT_Return_${data.periodLabel}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "إقرار القيمة المضافة" : "VAT Return"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "كشف إقرار ضريبة القيمة المضافة والامتثال الضريبي" : "Statutory VAT Return & Tax Audit Statement"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "التقرير الضريبي المعتمد لإعداد وتقديم الإقرارات الدورية لمصلحة الضرائب وهيئة الزكاة والضريبة والجمارك (ZATCA / ETA)."
                : "Audited periodic tax return statement comparing output VAT on revenues against deductible input VAT."}
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

        {/* SUMMARY TILES */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الوعاء الخاضع للضريبة" : "Taxable Base"}</span>
              <DollarSign className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {data.outputTaxableBase.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "صافي قيمة المبيعات" : "Net revenue base"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "ضريبة المخرجات (المحصلة)" : "Output VAT"}</span>
              <Percent className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {data.outputVatTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-600/80 block mt-0.5">{isAr ? "على الإيرادات والخدمات" : "On sales & services"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "ضريبة المدخلات (المخصومة)" : "Input VAT"}</span>
              <Scale className="size-4 text-blue-600" />
            </div>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">
              -{data.inputVatTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "على فواتير المشتريات" : "On purchases & opex"}</span>
          </div>

          <div className="rounded-2xl bg-purple-50/70 p-3.5 border border-purple-200/80 dark:bg-purple-950/20 dark:border-purple-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-900 dark:text-purple-300">{isAr ? "صافي الضريبة المستحقة" : "Net VAT Payable"}</span>
              <Landmark className="size-4 text-purple-700 dark:text-purple-400" />
            </div>
            <p className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1 font-mono">
              {data.netVatPayable.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-purple-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-purple-700/80 block mt-0.5">{isAr ? "مستحقة السداد للهيئة" : "Payable to Tax Authority"}</span>
          </div>
        </div>
      </div>

      {/* FORMAL VAT DECLARATION BOX */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-purple-600" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "نموذج احتساب وتوزيع الإقرار الضريبي المعتمد" : "Statutory VAT Declaration Matrix"}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-slate-500">{isAr ? "الرقم الضريبي: " : "Tax ID: "}<strong className="text-slate-900 dark:text-white">{data.taxpayerId}</strong></span>
            <span>•</span>
            <span className="text-slate-500">{isAr ? "الفترة: " : "Period: "}<strong className="text-purple-600">{data.periodLabel}</strong></span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3 text-start">{isAr ? "بند الإقرار الضريبي" : "Declaration Line Item"}</th>
                <th className="p-3 text-end">{isAr ? "الوعاء الصافي (قبل الضريبة)" : "Net Taxable Base"}</th>
                <th className="p-3 text-end">{isAr ? "مبلغ الضريبة" : "VAT Amount"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              <tr>
                <td className="p-3 font-sans font-medium text-slate-900 dark:text-white">
                  {isAr ? "1. المبيعات والتوريدات الخاضعة للضريبة بالنسبة القياسية" : "1. Standard-Rated Supplies"}
                </td>
                <td className="p-3 text-end font-bold">{data.outputTaxableBase.toLocaleString()} {currencyLabel}</td>
                <td className="p-3 text-end font-black text-emerald-600">{data.outputVatTotal.toLocaleString()} {currencyLabel}</td>
              </tr>
              <tr>
                <td className="p-3 font-sans font-medium text-slate-900 dark:text-white">
                  {isAr ? "2. التوريدات والإيجارات المعفاة (0%)" : "2. Zero-Rated / Exempt Supplies"}
                </td>
                <td className="p-3 text-end font-bold">{data.exemptBaseTotal.toLocaleString()} {currencyLabel}</td>
                <td className="p-3 text-end text-slate-400">0.00 {currencyLabel}</td>
              </tr>
              <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                <td className="p-3 font-sans font-black text-slate-900 dark:text-white">
                  {isAr ? "3. إجمالي ضريبة المخرجات المحصلة" : "3. Total Output VAT"}
                </td>
                <td className="p-3 text-end font-black">{(data.outputTaxableBase + data.exemptBaseTotal).toLocaleString()} {currencyLabel}</td>
                <td className="p-3 text-end font-black text-emerald-600">{data.outputVatTotal.toLocaleString()} {currencyLabel}</td>
              </tr>
              <tr>
                <td className="p-3 font-sans font-medium text-slate-900 dark:text-white">
                  {isAr ? "4. ضريبة المدخلات على المشتريات والمصروفات القابلة للخصم" : "4. Recoverable Input VAT"}
                </td>
                <td className="p-3 text-end font-bold">{data.inputTaxableBase.toLocaleString()} {currencyLabel}</td>
                <td className="p-3 text-end font-black text-blue-600">-{data.inputVatTotal.toLocaleString()} {currencyLabel}</td>
              </tr>
              <tr className="bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200">
                <td className="p-3.5 font-sans font-black text-sm">
                  {isAr ? "5. صافي ضريبة القيمة المضافة المستحقة للسداد للهيئة" : "5. Net VAT Payable"}
                </td>
                <td className="p-3.5 text-end font-black">—</td>
                <td className="p-3.5 text-end font-black text-base text-purple-700 dark:text-purple-300">
                  {data.netVatPayable.toLocaleString()} {currencyLabel}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ITEMIZED TAX DECISIONS LIST */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="size-4 text-purple-600" />
            <h4 className="text-xs font-black text-slate-900 dark:text-white">
              {isAr ? "سجل الحركات والقرارات الضريبية التفصيلية" : "Itemized Tax Decisions Register"}
            </h4>
            <Badge variant="secondary" className="text-[10px] font-mono">{filteredDecisions.length}</Badge>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث بالوحدة أو التاريخ..." : "Search unit, date..."}
              className="ps-9 text-xs h-8 bg-slate-50 dark:bg-slate-800"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3 text-start">{isAr ? "الوحدة / المستند" : "Doc / Unit"}</th>
                <th className="p-3 text-start">{isAr ? "طبيعة الإيراد" : "Revenue Nature"}</th>
                <th className="p-3 text-start">{isAr ? "تاريخ القرار" : "Decision Date"}</th>
                <th className="p-3 text-end">{isAr ? "الوعاء الصافي" : "Net Base"}</th>
                <th className="p-3 text-center">{isAr ? "النسبة" : "Rate"}</th>
                <th className="p-3 text-end">{isAr ? "الضريبة" : "VAT"}</th>
                <th className="p-3 text-end">{isAr ? "الإجمالي بالضريبة" : "Gross Total"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDecisions.length ? (
                filteredDecisions.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">{d.unitCode}</td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200">{d.nature}</td>
                    <td className="p-3 font-mono text-[11px] text-slate-500">{d.date}</td>
                    <td className="p-3 text-end font-mono font-bold">{d.base.toLocaleString()} {currencyLabel}</td>
                    <td className="p-3 text-center font-mono font-bold">
                      {d.isExempt ? (
                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600">{isAr ? "معفى" : "Exempt"}</Badge>
                      ) : (
                        <Badge className="text-[10px] bg-purple-50 text-purple-700">{d.rate}%</Badge>
                      )}
                    </td>
                    <td className="p-3 text-end font-mono font-bold text-purple-600">{d.vat.toLocaleString()} {currencyLabel}</td>
                    <td className="p-3 text-end font-mono font-black text-slate-900 dark:text-white">{d.gross.toLocaleString()} {currencyLabel}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد قرارات ضريبية مطابقة" : "No tax decisions found"}
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
