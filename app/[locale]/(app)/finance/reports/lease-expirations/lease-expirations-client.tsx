"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  CalendarClock,
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
  Clock,
  MessageCircle,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface ExpiringLeaseRow {
  leaseId: string;
  unitCode: string;
  unitType: string;
  resortName: string;
  tenantName: string;
  tenantPhone: string;
  tenantEmail: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  rentAmount: number;
  annualRent: number;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
}

export function LeaseExpirationsClient({
  rows,
  organizationName,
  currency,
  locale,
}: {
  rows: ExpiringLeaseRow[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<string>("ALL");

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchesSearch =
        !searchQuery.trim() ||
        r.unitCode.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.tenantName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.resortName.toLowerCase().includes(searchQuery.toLowerCase().trim());

      let matchesTime = true;
      if (timeFilter === "NEXT_30") matchesTime = r.daysRemaining > 0 && r.daysRemaining <= 30;
      else if (timeFilter === "NEXT_90") matchesTime = r.daysRemaining > 0 && r.daysRemaining <= 90;
      else if (timeFilter === "NEXT_180") matchesTime = r.daysRemaining > 0 && r.daysRemaining <= 180;
      else if (timeFilter === "EXPIRED") matchesTime = r.daysRemaining <= 0;

      return matchesSearch && matchesTime;
    });
  }, [rows, searchQuery, timeFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalLeases = rows.length;
    const expiring30 = rows.filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 30).length;
    const expiring90 = rows.filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 90).length;
    const rentAtRisk = rows
      .filter((r) => r.daysRemaining > 0 && r.daysRemaining <= 90)
      .reduce((s, r) => s + r.annualRent, 0);

    return {
      totalLeases,
      expiring30,
      expiring90,
      rentAtRisk,
    };
  }, [rows]);

  // WhatsApp Renewal Message
  const handleWhatsApp = (r: ExpiringLeaseRow) => {
    if (!r.tenantPhone) return;
    const text = isAr
      ? `مرحباً ${r.tenantName}، نود إحاطتكم بأن عقد إيجار الوحدة ${r.unitCode} ينتهي بتاريخ ${r.endDate} (متبقي ${r.daysRemaining} يوماً). نرجو إفادتنا برغبتكم في تجديد العقد.`
      : `Hello ${r.tenantName}, your lease for unit ${r.unitCode} expires on ${r.endDate} (${r.daysRemaining} days left). Please let us know if you wish to renew.`;
    window.open(`https://api.whatsapp.com/send?phone=${r.tenantPhone.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(text)}`, "_blank");
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "تقرير جداول انتهاء العقود ومعدل دوران الإشغال" : "Lease Expirations & Churn Waterfall Schedule",
      subtitle: isAr
        ? `خريطة انتهاء العقود ومتابعة التجديدات لتفادي الشغور — ${organizationName}`
        : `12-Month Lease Expiration Waterfall & Renewal Tracking — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "كود الوحدة" : "Unit", key: "unit", align: "start" },
        { header: isAr ? "المستأجر" : "Tenant", key: "tenant", align: "start" },
        { header: isAr ? "تاريخ الانتهاء" : "Expires On", key: "date", align: "center" },
        { header: isAr ? "المتبقي (أيام)" : "Days Left", key: "days", align: "center" },
        { header: isAr ? "القيمة الإيجارية" : "Rent", key: "rent", align: "end", isNumber: true },
        { header: isAr ? "الإيجار السنوي" : "Annual Rent", key: "annual", align: "end", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status", align: "center" },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        tenant: r.tenantName,
        date: r.endDate,
        days: `${r.daysRemaining}`,
        rent: `${r.rentAmount.toLocaleString()} ${currencyLabel}`,
        annual: `${r.annualRent.toLocaleString()} ${currencyLabel}`,
        status: r.daysRemaining <= 0 ? (isAr ? "منتهي" : "Expired") : r.daysRemaining <= 30 ? (isAr ? "ينتهي قريباً" : "Expiring Soon") : (isAr ? "ساري" : "Active"),
      })),
      summaryCards: [
        { label: isAr ? "إجمالي العقود النشطة" : "Active Leases", value: `${metrics.totalLeases}` },
        { label: isAr ? "تنتهي خلال 30 يوماً" : "Expiring in 30d", value: `${metrics.expiring30}` },
        { label: isAr ? "تنتهي خلال 90 يوماً" : "Expiring in 90d", value: `${metrics.expiring90}` },
        { label: isAr ? "إيجار معرض لفقدان الإشغال" : "Rent at Risk", value: `${metrics.rentAtRisk.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Lease_Expirations_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "تقرير جداول انتهاء العقود" : "Lease Expirations Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "كود الوحدة" : "Unit Code", key: "unit" },
        { header: isAr ? "اسم المستأجر" : "Tenant Name", key: "tenant" },
        { header: isAr ? "الهاتف" : "Phone", key: "phone" },
        { header: isAr ? "المشروع / المنتجع" : "Resort", key: "resort" },
        { header: isAr ? "تاريخ البداية" : "Start Date", key: "startDate" },
        { header: isAr ? "تاريخ الانتهاء" : "End Date", key: "endDate" },
        { header: isAr ? "الأيام المتبقية" : "Days Left", key: "days", isNumber: true },
        { header: isAr ? "الإيجار الشهري" : "Rent Amount", key: "rent", isNumber: true },
        { header: isAr ? "الإيجار السنوي" : "Annual Run Rate", key: "annual", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        tenant: r.tenantName,
        phone: r.tenantPhone || "—",
        resort: r.resortName,
        startDate: r.startDate,
        endDate: r.endDate,
        days: r.daysRemaining,
        rent: r.rentAmount,
        annual: r.annualRent,
      })),
      filename: `Lease_Expirations_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "انتهاء العقود والإشغال" : "Lease Expirations"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "تقرير جداول انتهاء العقود ومعدل دوران الإشغال" : "Lease Expirations & Churn Waterfall Schedule"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "خريطة زمنية تفاعلية لعقود الإيجار المنتهية خلال الـ 12 شهراً القادمة، إدارة طلبات التجديد، وحماية التدفق الإيجاري من فترات الشغور."
                : "Interactive 12-month lease expiration schedule tracking upcoming vacancies, tenant renewals, and income at risk."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي العقود النشطة" : "Active Leases"}</span>
              <CalendarClock className="size-4 text-indigo-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">{metrics.totalLeases}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "عقود سارية بالمحفظة" : "Operational units"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "تنتهي خلال 30 يوماً" : "Expiring in 30d"}</span>
              <AlertTriangle className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">{metrics.expiring30}</p>
            <span className="text-[10px] text-rose-600/80 block mt-0.5">{isAr ? "تتطلب تجديد عاجل" : "Urgent action"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "تنتهي خلال 90 يوماً" : "Expiring in 90d"}</span>
              <Clock className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">{metrics.expiring90}</p>
            <span className="text-[10px] text-amber-600 block mt-0.5">{isAr ? "تجهيز عروض التجديد" : "Renewal window"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إيجار سنوي معرض للشغور" : "Rent at Risk"}</span>
              <DollarSign className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              {metrics.rentAtRisk.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "خلال الربع القادم" : "Next 90 days run-rate"}</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "كافة العقود المسجلة" : "All Leases"}</option>
            <option value="NEXT_30">{isAr ? "تنتهي خلال 30 يوماً القادمة" : "Next 30 Days"}</option>
            <option value="NEXT_90">{isAr ? "تنتهي خلال 90 يوماً القادمة" : "Next 90 Days"}</option>
            <option value="NEXT_180">{isAr ? "تنتهي خلال 6 أشهر" : "Next 6 Months"}</option>
            <option value="EXPIRED">{isAr ? "عقود منتهية" : "Expired Leases"}</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث برقم الوحدة، المستأجر..." : "Search unit, tenant..."}
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
                <th className="p-3.5 text-start">{isAr ? "المستأجر الحالي" : "Current Tenant"}</th>
                <th className="p-3.5 text-center">{isAr ? "تاريخ بداية العقد" : "Starts On"}</th>
                <th className="p-3.5 text-center">{isAr ? "تاريخ انتهاء العقد" : "Ends On"}</th>
                <th className="p-3.5 text-center">{isAr ? "المتبقي" : "Days Left"}</th>
                <th className="p-3.5 text-end">{isAr ? "القيمة الإيجارية" : "Rent Amount"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإيراد السنوي" : "Annual Run Rate"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-center">{isAr ? "تجديد" : "Renewal"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.leaseId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-sans font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 text-indigo-600 shrink-0" />
                        <span>{r.unitCode}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({r.resortName})</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-sans font-medium text-slate-800 dark:text-slate-200">
                      {r.tenantName}
                    </td>

                    <td className="p-3.5 text-center text-slate-500 text-[11px]">
                      {r.startDate}
                    </td>

                    <td className="p-3.5 text-center font-bold text-slate-900 dark:text-white text-[11px]">
                      {r.endDate}
                    </td>

                    <td className="p-3.5 text-center font-bold">
                      <span className={r.daysRemaining <= 30 ? "text-rose-600" : r.daysRemaining <= 90 ? "text-amber-600" : "text-emerald-600"}>
                        {r.daysRemaining > 0 ? `${r.daysRemaining} يوم` : isAr ? "منتهي" : "Expired"}
                      </span>
                    </td>

                    <td className="p-3.5 text-end text-slate-800 dark:text-slate-200 font-medium">
                      {r.rentAmount.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-bold text-emerald-700 dark:text-emerald-400">
                      {r.annualRent.toLocaleString()} <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-center font-sans">
                      <Badge
                        className={`text-[10px] font-bold ${
                          r.daysRemaining <= 0
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : r.daysRemaining <= 30
                            ? "bg-rose-100 text-rose-800 border-rose-200"
                            : r.daysRemaining <= 90
                            ? "bg-amber-100 text-amber-800 border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        }`}
                      >
                        {r.daysRemaining <= 0 ? (isAr ? "منتهي" : "Expired") : r.daysRemaining <= 30 ? (isAr ? "ينتهي قريباً" : "Expiring Soon") : (isAr ? "ساري" : "Active")}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-center font-sans">
                      {r.tenantPhone ? (
                        <Button
                          onClick={() => handleWhatsApp(r)}
                          variant="ghost"
                          size="sm"
                          title={isAr ? "مراسلة المستأجر للتجديد" : "WhatsApp Tenant"}
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
                    {isAr ? "لا توجد عقود مطابقة للفترة المحددة" : "No lease expirations found"}
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
