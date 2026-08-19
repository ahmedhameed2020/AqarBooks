"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Truck,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingDown,
  Clock,
  Printer,
  ChevronLeft,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Phone,
  MessageCircle,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface ApAgingSupplierRow {
  supplierId: string;
  supplierName: string;
  phone: string;
  email: string;
  invoicesCount: number;
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalOutstanding: number;
}

export function ApAgingClient({
  rows,
  organizationName,
  currency,
  locale,
}: {
  rows: ApAgingSupplierRow[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        r.supplierName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalPayable = rows.reduce((s, r) => s + r.totalOutstanding, 0);
    const total0_30 = rows.reduce((s, r) => s + r.bucket0_30, 0);
    const total31_60 = rows.reduce((s, r) => s + r.bucket31_60, 0);
    const total61_90 = rows.reduce((s, r) => s + r.bucket61_90, 0);
    const total90Plus = rows.reduce((s, r) => s + r.bucket90Plus, 0);

    return {
      totalPayable,
      total0_30,
      total31_60,
      total61_90,
      total90Plus,
      suppliersCount: rows.filter((r) => r.totalOutstanding > 0).length,
    };
  }, [rows]);

  // WhatsApp Contact Supplier
  const handleWhatsApp = (r: ApAgingSupplierRow) => {
    if (!r.phone) return;
    const text = isAr
      ? `مرحباً ${r.supplierName}، نتواصل معكم من الإدارة المالية بشركة ${organizationName} بخصوص متابعة الفواتير ومطابقة الحسابات.`
      : `Hello ${r.supplierName}, this is ${organizationName} finance department regarding statement of accounts.`;
    window.open(`https://api.whatsapp.com/send?phone=${r.phone.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(text)}`, "_blank");
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "تقرير أعمار ديون الموردين والالتزامات (AP Aging)" : "Accounts Payable (AP) Aging Report",
      subtitle: isAr
        ? `تحليل التزامات الموردين والمقاولين وفترات الاستحقاق — ${organizationName}`
        : `Vendor Liabilities & Maturity Aging Analysis — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "المورد / المقاول" : "Supplier", key: "supplier", align: "start" },
        { header: isAr ? "الحالي (0-30 يوم)" : "Current (0-30)", key: "b1", align: "end", isNumber: true },
        { header: isAr ? "31-60 يوم" : "31-60 Days", key: "b2", align: "end", isNumber: true },
        { header: isAr ? "61-90 يوم" : "61-90 Days", key: "b3", align: "end", isNumber: true },
        { header: isAr ? "+90 يوم" : "90+ Days", key: "b4", align: "end", isNumber: true },
        { header: isAr ? "إجمالي المستحق" : "Total Due", key: "total", align: "end", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        supplier: r.supplierName,
        b1: `${r.bucket0_30.toLocaleString()} ${currencyLabel}`,
        b2: `${r.bucket31_60.toLocaleString()} ${currencyLabel}`,
        b3: `${r.bucket61_90.toLocaleString()} ${currencyLabel}`,
        b4: `${r.bucket90Plus.toLocaleString()} ${currencyLabel}`,
        total: `${r.totalOutstanding.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي ديون الموردين" : "Total AP Due", value: `${metrics.totalPayable.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "حالي (0-30 يوم)" : "Current (0-30d)", value: `${metrics.total0_30.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "متأخر (31-90 يوم)" : "Overdue (31-90d)", value: `${(metrics.total31_60 + metrics.total61_90).toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "حرج (+90 يوم)" : "Critical (+90d)", value: `${metrics.total90Plus.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `AP_Aging_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "تقرير أعمار ديون الموردين (AP Aging)" : "AP Aging Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "اسم المورد" : "Supplier Name", key: "supplier" },
        { header: isAr ? "الهاتف" : "Phone", key: "phone" },
        { header: isAr ? "عدد الفواتير" : "Invoices", key: "invoices", isNumber: true },
        { header: isAr ? "0-30 يوم" : "0-30 Days", key: "b1", isNumber: true },
        { header: isAr ? "31-60 يوم" : "31-60 Days", key: "b2", isNumber: true },
        { header: isAr ? "61-90 يوم" : "61-90 Days", key: "b3", isNumber: true },
        { header: isAr ? "+90 يوم" : "+90 Days", key: "b4", isNumber: true },
        { header: isAr ? "إجمالي الدين" : "Total Outstanding", key: "total", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        supplier: r.supplierName,
        phone: r.phone || "—",
        invoices: r.invoicesCount,
        b1: r.bucket0_30,
        b2: r.bucket31_60,
        b3: r.bucket61_90,
        b4: r.bucket90Plus,
        total: r.totalOutstanding,
      })),
      filename: `AP_Aging_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "أعمار ديون الموردين (AP Aging)" : "AP Aging"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "تقرير أعمار ديون الموردين والالتزامات (AP Aging)" : "Accounts Payable (AP) Aging Report"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "تحليل فترات استحقاق فواتير الموردين والمقاولين، تصنيف الالتزامات المالية، وتخطيط السيولة النقدية وسداد المستحقات."
                : "Comprehensive accounts payable aging analysis tracking maturity buckets, supplier obligations, and payment terms."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي ديون الموردين" : "Total AP Due"}</span>
              <DollarSign className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              {metrics.totalPayable.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "مستحقات واجبة السداد" : "Outstanding payable"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "حالي (0 - 30 يوم)" : "Current (0-30d)"}</span>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {metrics.total0_30.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-600 block mt-0.5">{isAr ? "ضمن فترة السماح" : "Within terms"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "متأخر (31 - 90 يوم)" : "Overdue (31-90d)"}</span>
              <Clock className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {(metrics.total31_60 + metrics.total61_90).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-amber-600 block mt-0.5">{isAr ? "مستحق السداد قريباً" : "Requires settlement"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "متأخر حرج (+90 يوم)" : "Critical (+90d)"}</span>
              <AlertTriangle className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              {metrics.total90Plus.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-rose-600 block mt-0.5">{isAr ? "أولوية سداد عاجلة" : "Urgent payment required"}</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-800 dark:text-white">
            {isAr ? "كشف أعمار الذمم الدائنة لكل مورد" : "Supplier Aging Breakdown"}
          </span>
          <Badge variant="secondary" className="text-[10px] font-mono">{filteredRows.length}</Badge>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث باسم المورد أو الهاتف..." : "Search supplier..."}
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
                <th className="p-3.5 text-start">{isAr ? "المورد / المقاول" : "Supplier / Contractor"}</th>
                <th className="p-3.5 text-center">{isAr ? "الفواتير" : "Invoices"}</th>
                <th className="p-3.5 text-end">{isAr ? "حالي (0-30 يوم)" : "Current (0-30)"}</th>
                <th className="p-3.5 text-end">{isAr ? "31-60 يوم" : "31-60 Days"}</th>
                <th className="p-3.5 text-end">{isAr ? "61-90 يوم" : "61-90 Days"}</th>
                <th className="p-3.5 text-end">{isAr ? "+90 يوم" : "90+ Days"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي المستحق" : "Total Due"}</th>
                <th className="p-3.5 text-center">{isAr ? "إجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.supplierId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Truck className="size-3.5 text-rose-600 shrink-0" />
                        <span>{r.supplierName}</span>
                      </div>
                    </td>

                    <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300">
                      {r.invoicesCount > 0 ? (
                        <Badge variant="secondary" className="text-[10px]">{r.invoicesCount}</Badge>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    <td className="p-3.5 text-end text-emerald-600 font-bold">
                      {r.bucket0_30 > 0 ? `${r.bucket0_30.toLocaleString()} ${currencyLabel}` : <span className="text-slate-400 font-normal">0.00</span>}
                    </td>

                    <td className="p-3.5 text-end text-slate-700 dark:text-slate-300 font-medium">
                      {r.bucket31_60 > 0 ? `${r.bucket31_60.toLocaleString()} ${currencyLabel}` : <span className="text-slate-400 font-normal">0.00</span>}
                    </td>

                    <td className="p-3.5 text-end text-amber-600 font-bold">
                      {r.bucket61_90 > 0 ? `${r.bucket61_90.toLocaleString()} ${currencyLabel}` : <span className="text-slate-400 font-normal">0.00</span>}
                    </td>

                    <td className="p-3.5 text-end text-rose-600 font-black">
                      {r.bucket90Plus > 0 ? `${r.bucket90Plus.toLocaleString()} ${currencyLabel}` : <span className="text-slate-400 font-normal">0.00</span>}
                    </td>

                    <td className="p-3.5 text-end font-black text-sm text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                      {r.totalOutstanding > 0 ? `${r.totalOutstanding.toLocaleString()} ${currencyLabel}` : <span className="text-slate-400 font-normal">0.00</span>}
                    </td>

                    <td className="p-3.5 text-center font-sans">
                      {r.phone ? (
                        <Button
                          onClick={() => handleWhatsApp(r)}
                          variant="ghost"
                          size="sm"
                          title={isAr ? "تواصل واتساب مع المورد" : "WhatsApp Supplier"}
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
                  <td colSpan={8} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد ديون موردين مسجلة" : "No AP supplier balances found"}
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
