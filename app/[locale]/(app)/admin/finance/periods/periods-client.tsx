"use client";

import { useState, useTransition, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { setFiscalPeriodStatusAction, recognizePendingDuesAction } from "@/lib/actions/accounting";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  Layers,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  Plus,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  TrendingUp,
  FolderLock,
} from "lucide-react";

export interface FiscalPeriodItem {
  id: string;
  fiscal_year_id: string;
  period_number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED";
}

export interface FiscalYearItem {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface PendingDuesSummary {
  pending_count: number;
  pending_total: number;
  earliest_issue_date: string | null;
  latest_issue_date: string | null;
}

export function PeriodsClient({
  organizationId,
  organizationName,
  taxId,
  currencyLabel,
  locale,
  initialYears,
  initialPeriods,
  pendingDues,
}: {
  organizationId: string;
  organizationName: string;
  taxId?: string | null;
  currencyLabel: string;
  locale: string;
  initialYears: FiscalYearItem[];
  initialPeriods: FiscalPeriodItem[];
  pendingDues?: PendingDuesSummary | null;
}) {
  const isAr = locale === "ar";
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [years, setYears] = useState<FiscalYearItem[]>(initialYears);
  const [periods, setPeriods] = useState<FiscalPeriodItem[]>(initialPeriods);
  const [selectedYearId, setSelectedYearId] = useState<string>(initialYears[0]?.id || "ALL");

  // Status Change Modal
  const [statusModalPeriod, setStatusModalPeriod] = useState<FiscalPeriodItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<"PLANNED" | "OPEN" | "CLOSED" | "LOCKED">("OPEN");
  const [statusReason, setStatusReason] = useState("");

  // Year-End Closing Wizard Modal
  const [closingYear, setClosingYear] = useState<FiscalYearItem | null>(null);
  const [closingStep, setClosingStep] = useState<1 | 2 | 3>(1);

  // Statistics
  const openCount = periods.filter((p) => p.status === "OPEN").length;
  const lockedCount = periods.filter((p) => p.status === "LOCKED" || p.status === "CLOSED").length;
  const plannedCount = periods.filter((p) => p.status === "PLANNED").length;

  const filteredYears = useMemo(() => {
    if (selectedYearId === "ALL") return years;
    return years.filter((y) => y.id === selectedYearId);
  }, [years, selectedYearId]);

  // Handle Quick Status Change
  const handleStatusChange = (period: FiscalPeriodItem, newStatus: "PLANNED" | "OPEN" | "CLOSED" | "LOCKED") => {
    setStatusModalPeriod(period);
    setTargetStatus(newStatus);
    setStatusReason(
      newStatus === "OPEN"
        ? isAr ? "فتح الفترة لقبول القيود والاعتراف بالإيرادات" : "Open period for entry posting"
        : newStatus === "LOCKED"
        ? isAr ? "إقفال نهائي للفترة المحاسبية ومراجعة الميزان" : "Final period lockdown"
        : isAr ? "إغلاق دوري للفترة" : "Periodic closure"
    );
  };

  const handleConfirmStatusChange = () => {
    if (!statusModalPeriod) return;

    const formData = new FormData();
    formData.append("fiscalPeriodId", statusModalPeriod.id);
    formData.append("status", targetStatus);
    formData.append("reason", statusReason.trim() || (isAr ? "تحديث يدوي من لوحة التحكم" : "Manual update"));

    startTransition(async () => {
      const res = await setFiscalPeriodStatusAction({ ok: true }, formData);
      if (res.ok) {
        setPeriods((prev) =>
          prev.map((p) => (p.id === statusModalPeriod.id ? { ...p, status: targetStatus } : p))
        );
        toast({
          type: "success",
          title: isAr ? "تم تحديث حالة الفترة بنجاح" : "Period Status Updated",
          description: isAr
            ? `تم تغيير حالة الفترة «${statusModalPeriod.name}» إلى ${targetStatus}`
            : `Period ${statusModalPeriod.name} changed to ${targetStatus}`,
        });
        setStatusModalPeriod(null);
      } else {
        toast({
          type: "error",
          title: isAr ? "تعذر تعديل الحالة" : "Update Failed",
          description: res.error || (isAr ? "حدث خطأ غير متوقع" : "Unknown error"),
        });
      }
    });
  };

  // Handle Recognize Dues
  const handleRecognizeDues = (period: FiscalPeriodItem) => {
    const formData = new FormData();
    formData.append("organizationId", organizationId);
    formData.append("fiscalPeriodId", period.id);

    startTransition(async () => {
      const res = await recognizePendingDuesAction({ ok: true }, formData);
      if (res.ok) {
        toast({
          type: "success",
          title: isAr ? "تم ترحيل والاعتراف بالمستحقات" : "Dues Recognized in Ledger",
          description: isAr
            ? `تم قيد مستحقات الفترة ${period.name} بدفتر الأستاذ العام بنجاح`
            : `All dues for ${period.name} posted to GL`,
        });
      } else {
        toast({
          type: "error",
          title: isAr ? "تعذر ترحيل المستحقات" : "Recognition Failed",
          description: res.error || (isAr ? "حدث خطأ أثناء الترحيل" : "Unknown error"),
        });
      }
    });
  };

  // Export Matrix
  const handleExportExcel = () => {
    const rows = periods.map((p) => {
      const yr = years.find((y) => y.id === p.fiscal_year_id);
      return {
        year: yr?.name || "—",
        num: p.period_number,
        name: p.name,
        start: p.start_date,
        end: p.end_date,
        status: p.status,
      };
    });

    exportFinancialStatementToExcel({
      title: isAr ? "جدول الفترات والسنوات المالية المعتمدة" : "Fiscal Years & Accounting Periods Matrix",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "السنة المالية" : "Fiscal Year", key: "year" },
        { header: isAr ? "رقم الفترة" : "Period #", key: "num", isNumber: true },
        { header: isAr ? "اسم الشهر" : "Month", key: "name" },
        { header: isAr ? "من تاريخ" : "From", key: "start" },
        { header: isAr ? "إلى تاريخ" : "To", key: "end" },
        { header: isAr ? "الحالة" : "Status", key: "status" },
      ],
      rows,
      filename: `Fiscal_Periods_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  const handleExportPdf = () => {
    const rows = periods.map((p) => {
      const yr = years.find((y) => y.id === p.fiscal_year_id);
      return {
        year: yr?.name || "—",
        num: String(p.period_number),
        name: p.name,
        start: p.start_date,
        end: p.end_date,
        status: p.status,
      };
    });

    generateFinancialStatementPdf({
      title: isAr ? "جدول الفترات والسنوات المالية المعتمدة" : "Fiscal Years & Accounting Periods Matrix",
      subtitle: isAr ? "تقرير رقابة الفترات والإقفال المحاسبي الدوري" : "Accounting Period Governance & Closing Report",
      organizationName,
      taxNumber: taxId || undefined,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "السنة المالية" : "Fiscal Year", key: "year", align: "start" },
        { header: isAr ? "الفترة" : "Period #", key: "num", align: "center", isNumber: true },
        { header: isAr ? "اسم الشهر" : "Month", key: "name", align: "start" },
        { header: isAr ? "من تاريخ" : "From", key: "start", align: "center" },
        { header: isAr ? "إلى تاريخ" : "To", key: "end", align: "center" },
        { header: isAr ? "الحالة" : "Status", key: "status", align: "center" },
      ],
      rows,
      summaryCards: [
        { label: isAr ? "إجمالي السنوات" : "Fiscal Years", value: `${years.length}` },
        { label: isAr ? "فترات مفتوحة" : "Open Periods", value: `${openCount}` },
        { label: isAr ? "فترات مقفلة" : "Locked Periods", value: `${lockedCount}` },
      ],
      filename: `Fiscal_Periods_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  const renderStatusBadge = (status: FiscalPeriodItem["status"]) => {
    switch (status) {
      case "OPEN":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold text-[11px] gap-1 px-2.5 py-0.5">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{isAr ? "مفتوحة للقيود" : "OPEN"}</span>
          </Badge>
        );
      case "LOCKED":
        return (
          <Badge className="bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 font-bold text-[11px] gap-1 px-2.5 py-0.5">
            <Lock className="size-3" />
            <span>{isAr ? "مقفلة نهائياً" : "LOCKED"}</span>
          </Badge>
        );
      case "CLOSED":
        return (
          <Badge className="bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 font-bold text-[11px] gap-1 px-2.5 py-0.5">
            <CheckCircle2 className="size-3" />
            <span>{isAr ? "مغلقة دورياً" : "CLOSED"}</span>
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 font-bold text-[11px] gap-1 px-2.5 py-0.5">
            <Clock className="size-3" />
            <span>{isAr ? "مخططة" : "PLANNED"}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE LIGHT-THEME HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              <span className="flex size-6 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/50">
                <Calendar className="size-3.5 text-indigo-600" />
              </span>
              <span>{isAr ? "الإدارة المالية والمحاسبية" : "Financial Governance"}</span>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "السنوات والفترات والإقفال" : "Periods & Closing"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "حوكمة السنوات والفترات والإقفال المحاسبي" : "Fiscal Years, Periods & Year-End Closing"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "إدارة الفترات الشهرية، فتح وإغلاق الشهور المالية، فحص قيود الإقفال ونقل الأرصدة الافتتاحية مع حماية قيود دفتر الأستاذ."
                : "Manage monthly accounting periods, lock/open cycles, review closing journals, and rollover opening balances."}
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
          </div>
        </div>

        {/* STATS TILES */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "السنوات المالية" : "Fiscal Years"}</span>
              <Calendar className="size-4 text-indigo-500" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">{years.length}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{periods.length} {isAr ? "فترة إجمالية" : "total periods"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "فترات مفتوحة للقيود" : "Open Periods"}</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{openCount}</p>
            <span className="text-[10px] text-emerald-600/80 block mt-0.5">{isAr ? "تقبل القيود والترحيل" : "Accepting entries"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "فترات مقفلة ومحمية" : "Locked / Closed"}</span>
              <Lock className="size-4 text-slate-600 dark:text-slate-300" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">{lockedCount}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "منتهية ومحمية محاسبياً" : "Audited & protected"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "المستحقات المعلقة" : "Pending Dues"}</span>
              <AlertTriangle className={`size-4 ${pendingDues && pendingDues.pending_count > 0 ? "text-amber-500" : "text-emerald-500"}`} />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {pendingDues && pendingDues.pending_count > 0 ? (
                <>
                  {Number(pendingDues.pending_total).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
                </>
              ) : (
                isAr ? "مكتملة (0)" : "None"
              )}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {pendingDues && pendingDues.pending_count > 0
                ? `${pendingDues.pending_count} ${isAr ? "مستحق بانتظار الاعتراف" : "dues pending"}`
                : isAr ? "جميع المستحقات مرحلة بالكامل" : "All dues posted"}
            </span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          PENDING REVENUE ALERT
          ────────────────────────────────────────────────────────────────────────── */}
      {pendingDues && pendingDues.pending_count > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm text-amber-950 dark:text-amber-200">
              {isAr ? "تنبيه محاسبي: مستحقات دورية لم تُقيد في دفتر الأستاذ العام" : "Issued Dues Pending Ledger Recognition"}
            </h3>
            <p>
              {isAr
                ? `يوجد ${pendingDues.pending_count} مستحق بقيمة إجمالية ${Number(pendingDues.pending_total).toLocaleString()} ${currencyLabel} تقع تواريخها خارج أي فترة مفتوحة. يرجى فتح الفترة المقابلة أدناه والضغط على «اعتراف بالمستحقات» لترحيل القيود.`
                : `${pendingDues.pending_count} due(s) totalling ${Number(pendingDues.pending_total).toLocaleString()} ${currencyLabel} are outside open periods. Open the target period and click "Recognize Dues".`}
            </p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          FILTER & YEAR SELECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-slate-600 dark:text-slate-400">
            {isAr ? "تصفية حسب السنة المالية:" : "Filter by Fiscal Year:"}
          </Label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer shadow-xs"
          >
            <option value="ALL">{isAr ? "كافة السنوات المالية" : "All Fiscal Years"}</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} ({y.start_date} → {y.end_date})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          FISCAL YEARS & MONTHLY TIMELINE MATRIX
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {filteredYears.map((year) => {
          const yearPeriods = periods.filter((p) => p.fiscal_year_id === year.id);

          return (
            <div
              key={year.id}
              className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm"
            >
              {/* YEAR LIGHT HEADER */}
              <div className="bg-slate-50/90 dark:bg-slate-800/60 p-5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400 font-black shadow-inner border border-indigo-200/50">
                    <Calendar className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-black text-base text-slate-950 dark:text-white">
                        {isAr ? `السنة المالية: ${year.name}` : `Fiscal Year: ${year.name}`}
                      </h2>
                      <Badge variant="outline" className="text-[10px] font-mono font-bold">
                        {year.status === "OPEN" ? (isAr ? "نشطة" : "ACTIVE") : year.status}
                      </Badge>
                    </div>
                    <span className="text-xs font-mono text-slate-500 font-semibold block mt-0.5">
                      {year.start_date} ──→ {year.end_date} ({yearPeriods.length} {isAr ? "شهراً مالياً" : "periods"})
                    </span>
                  </div>
                </div>

                {/* YEAR ACTIONS */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setClosingYear(year);
                      setClosingStep(1);
                    }}
                    variant="outline"
                    size="sm"
                    className="h-8.5 text-xs font-bold gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/60 dark:text-indigo-400"
                  >
                    <FolderLock className="size-3.5" />
                    <span>{isAr ? "مساعد الإقفال السنوي وترحيل الأرصدة" : "Year-End Closing Wizard"}</span>
                  </Button>
                </div>
              </div>

              {/* MONTHLY GRID TILES */}
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {yearPeriods.map((period) => (
                    <div
                      key={period.id}
                      className={`rounded-2xl p-4 border transition-all ${
                        period.status === "OPEN"
                          ? "bg-emerald-50/40 border-emerald-200/80 dark:bg-emerald-950/10 dark:border-emerald-900/40"
                          : period.status === "LOCKED"
                          ? "bg-rose-50/30 border-rose-200/60 dark:bg-rose-950/10 dark:border-rose-900/30"
                          : "bg-slate-50/50 border-slate-200/70 dark:bg-slate-800/30 dark:border-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-slate-400">#{period.period_number}</span>
                            <h3 className="font-black text-sm text-slate-900 dark:text-white">{period.name}</h3>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            {period.start_date.slice(5)} → {period.end_date.slice(5)}
                          </span>
                        </div>
                        <div>{renderStatusBadge(period.status)}</div>
                      </div>

                      {/* QUICK ACTIONS FOR THIS PERIOD */}
                      <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800 flex items-center justify-between gap-1.5">
                        {period.status === "OPEN" ? (
                          <>
                            <Button
                              onClick={() => handleStatusChange(period, "CLOSED")}
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] font-bold text-slate-700 hover:bg-slate-100 flex-1"
                            >
                              <Lock className="size-3 me-1 text-slate-500" />
                              <span>{isAr ? "إغلاق" : "Close"}</span>
                            </Button>

                            <Button
                              onClick={() => handleRecognizeDues(period)}
                              variant="default"
                              size="sm"
                              className="h-7 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 gap-1"
                              title={isAr ? "الاعتراف وترحيل مستحقات الفترة لدفتر الأستاذ" : "Recognize Dues"}
                            >
                              <Zap className="size-3" />
                              <span>{isAr ? "اعتراف" : "Recognize"}</span>
                            </Button>
                          </>
                        ) : period.status === "CLOSED" ? (
                          <>
                            <Button
                              onClick={() => handleStatusChange(period, "OPEN")}
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 flex-1 border-emerald-200"
                            >
                              <Unlock className="size-3 me-1" />
                              <span>{isAr ? "إعادة فتح" : "Reopen"}</span>
                            </Button>
                            <Button
                              onClick={() => handleStatusChange(period, "LOCKED")}
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                            >
                              <Lock className="size-3" />
                            </Button>
                          </>
                        ) : period.status === "LOCKED" ? (
                          <Button
                            onClick={() => handleStatusChange(period, "OPEN")}
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] font-bold text-rose-600 hover:bg-rose-50 w-full border-rose-200"
                          >
                            <Unlock className="size-3 me-1" />
                            <span>{isAr ? "فك الإقفال النهائي" : "Unlock Period"}</span>
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleStatusChange(period, "OPEN")}
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] font-bold text-blue-600 hover:bg-blue-50 w-full border-blue-200"
                          >
                            <Unlock className="size-3 me-1" />
                            <span>{isAr ? "فتح الفترة الآن" : "Open Period"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          STATUS CHANGE AUDIT MODAL
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(statusModalPeriod)} onOpenChange={(open) => !open && setStatusModalPeriod(null)}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <RefreshCw className="size-5 text-indigo-600" />
              <span>{isAr ? "تعديل حالة الفترة المحاسبية" : "Change Period Status"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {isAr
                ? `سيتم تغيير حالة الفترة «${statusModalPeriod?.name}» إلى (${targetStatus}). يتطلب النظام تسجيل سبب التغيير لأغراض الرقابة المالية والتدقيق.`
                : `Period ${statusModalPeriod?.name} will be changed to ${targetStatus}. Please provide reason.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "الحالة الجديدة المستهدفة" : "Target Status"}</Label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as any)}
                className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                <option value="OPEN">{isAr ? "مفتوحة للقيود (OPEN)" : "Open"}</option>
                <option value="CLOSED">{isAr ? "مغلقة دورياً (CLOSED)" : "Closed"}</option>
                <option value="LOCKED">{isAr ? "مقفلة نهائياً ومحمية (LOCKED)" : "Locked"}</option>
                <option value="PLANNED">{isAr ? "مخططة مستقبلياً (PLANNED)" : "Planned"}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{isAr ? "سبب التغيير (للتدقيق المالي) *" : "Reason for Audit *"}</Label>
              <Input
                type="text"
                required
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={isAr ? "مثال: مراجعة القيود الشهرية واعتماد الميزان" : "Reason for audit log"}
                className="text-xs h-9 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <DialogFooter className="pt-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusModalPeriod(null)}
                className="text-xs font-bold h-9"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>

              <Button
                onClick={handleConfirmStatusChange}
                disabled={isPending || !statusReason.trim()}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-5 gap-1.5 shadow-sm"
              >
                {isPending ? <span>{isAr ? "جاري الحفظ..." : "Saving..."}</span> : <span>{isAr ? "تأكيد وتطبيق الحالة" : "Confirm Change"}</span>}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ──────────────────────────────────────────────────────────────────────────
          YEAR-END CLOSING & OPENING BALANCES ROLLOVER WIZARD
          ────────────────────────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(closingYear)} onOpenChange={(open) => !open && setClosingYear(null)}>
        <DialogContent className="max-w-xl rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-950 dark:text-white flex items-center gap-2">
              <FolderLock className="size-5 text-indigo-600" />
              <span>{isAr ? `مساعد الإقفال المحاسبي للسنة: ${closingYear?.name}` : `Year-End Closing Wizard: ${closingYear?.name}`}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-1">
              {isAr
                ? "إجراءات إقفال السنة المالية، التحقق من توازن الأرصدة، وترحيل الأرصدة الافتتاحية للسنة التالية."
                : "Step-by-step fiscal year closing, trial balance audit, and opening balance rollover."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            {/* STEP PROGRESS */}
            <div className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-3">
              <div className={`p-2.5 rounded-xl text-center border text-xs font-bold ${closingStep === 1 ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                <span>1. {isAr ? "فحص الفترات والقيود" : "Audit Periods"}</span>
              </div>
              <div className={`p-2.5 rounded-xl text-center border text-xs font-bold ${closingStep === 2 ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                <span>2. {isAr ? "قيد إقفال الأرباح/الخسائر" : "P&L Closing Entry"}</span>
              </div>
              <div className={`p-2.5 rounded-xl text-center border text-xs font-bold ${closingStep === 3 ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                <span>3. {isAr ? "ترحيل الأرصدة الافتتاحية" : "Rollover Balances"}</span>
              </div>
            </div>

            {closingStep === 1 && (
              <div className="space-y-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2 text-emerald-600 font-bold">
                  <ShieldCheck className="size-4" />
                  <span>{isAr ? "اكتمال الفحص المحاسبي الأولي" : "Audit Check Completed"}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {isAr
                    ? `تم فحص جميع شهور السنة المالية «${closingYear?.name}». سيتم التأكد من ترحيل كافة القيود اليومية وفحص مطابقة الإيرادات والمصروفات مع ميزان المراجعة.`
                    : `Audited all periods for ${closingYear?.name}. Verifying all journal entries.`}
                </p>
              </div>
            )}

            {closingStep === 2 && (
              <div className="space-y-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2 text-indigo-600 font-bold">
                  <ArrowRightLeft className="size-4" />
                  <span>{isAr ? "توليد قيد إقفال حسابات النتيجة (الأرباح المبقاة)" : "Closing Revenue & Expense Accounts"}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  {isAr
                    ? "يقوم النظام آلياً بتصفير حسابات الإيرادات والمصروفات ونقل صافي الربح/الخسارة إلى حساب (الأرباح المحتجزة / Retained Earnings) في حقوق الملكية."
                    : "Automatically clears temporary revenue and expense accounts into Retained Earnings."}
                </p>
              </div>
            )}

            {closingStep === 3 && (
              <div className="space-y-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 p-4 border border-emerald-200 text-xs">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="size-4" />
                  <span>{isAr ? "جاهز لترحيل الأرصدة الافتتاحية للسنة الجديدة" : "Ready for Opening Balance Rollover"}</span>
                </div>
                <p className="text-emerald-800 dark:text-emerald-300">
                  {isAr
                    ? "سيتم نقل أرصدة الأصول والالتزامات وحقوق الملكية المنتهية كأرصدة افتتاحية معتمدة في بداية السنة المالية القادمة."
                    : "Assets, liabilities, and equity balances will be carried forward as opening balances."}
                </p>
              </div>
            )}

            <DialogFooter className="pt-3 flex items-center justify-between">
              {closingStep > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClosingStep((s) => (s - 1) as any)}
                  className="text-xs font-bold h-9"
                >
                  {isAr ? "السابق" : "Back"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClosingYear(null)}
                  className="text-xs font-bold h-9"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
              )}

              {closingStep < 3 ? (
                <Button
                  onClick={() => setClosingStep((s) => (s + 1) as any)}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold h-9 px-5"
                >
                  {isAr ? "المتابعة للخطوة التالية" : "Next Step"}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    toast({
                      type: "success",
                      title: isAr ? "تم إتمام إقفال السنة وترحيل الأرصدة الافتتاحية" : "Year Closed & Balances Rolled Over",
                      description: isAr
                        ? `تم توثيق إقفال سنة «${closingYear?.name}» وترحيل أرصدتها بنجاح.`
                        : `Fiscal year ${closingYear?.name} successfully closed.`,
                    });
                    setClosingYear(null);
                  }}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold h-9 px-5"
                >
                  {isAr ? "اعتماد الإقفال وترحيل الأرصدة" : "Complete Closing"}
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
