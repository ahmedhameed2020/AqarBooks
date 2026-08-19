"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  ShieldCheck,
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
  AlertOctagon,
  User,
  Clock,
  CheckCircle2,
  Lock,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface AuditTrailItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  reason: string;
  timestamp: string;
}

export function AuditTrailClient({
  items,
  organizationName,
  currency,
  locale,
}: {
  items: AuditTrailItem[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("ALL");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !searchQuery.trim() ||
        item.action.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.actorName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.reason.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        item.entityType.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesFilter =
        actionFilter === "ALL" ||
        (actionFilter === "VOIDS" && (item.action.includes("void") || item.action.includes("cancel") || item.action.includes("reverse"))) ||
        (actionFilter === "FINANCE" && (item.entityType.includes("due") || item.entityType.includes("payment") || item.entityType.includes("invoice")));

      return matchesSearch && matchesFilter;
    });
  }, [items, searchQuery, actionFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalEvents = items.length;
    const voidEvents = items.filter(
      (i) => i.action.includes("void") || i.action.includes("cancel") || i.action.includes("reverse")
    ).length;
    const securityEvents = items.filter(
      (i) => i.action.includes("role") || i.action.includes("permission") || i.action.includes("user")
    ).length;
    const uniqueActors = new Set(items.map((i) => i.actorName)).size;

    return {
      totalEvents,
      voidEvents,
      securityEvents,
      uniqueActors,
    };
  }, [items]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "سجل التدقيق والحركات والرقابة المالية" : "Audit Trail & Anti-Fraud Governance Report",
      subtitle: isAr
        ? `توثيق الحركات الرقابية والإلغاءات والتعديلات — ${organizationName}`
        : `Governance Log of Reversals, Adjustments & Audit Records — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "نوع الإجراء" : "Action", key: "action", align: "start" },
        { header: isAr ? "نوع الكيان" : "Entity", key: "entity", align: "center" },
        { header: isAr ? "المستخدم المسؤول" : "Actor", key: "actor", align: "start" },
        { header: isAr ? "السبب الموثق" : "Reason", key: "reason", align: "start" },
        { header: isAr ? "التوقيت" : "Timestamp", key: "time", align: "center" },
      ],
      rows: filteredItems.map((i) => ({
        action: i.action,
        entity: i.entityType,
        actor: i.actorName,
        reason: i.reason,
        time: i.timestamp,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي السجلات" : "Total Logs", value: `${metrics.totalEvents}` },
        { label: isAr ? "حركات إلغاء وتعديل" : "Void/Reversal Events", value: `${metrics.voidEvents}` },
        { label: isAr ? "إجراءات الصلاحيات" : "RBAC Updates", value: `${metrics.securityEvents}` },
        { label: isAr ? "المستخدمين النشطين" : "Active Actors", value: `${metrics.uniqueActors}` },
      ],
      filename: `Audit_Trail_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "سجل التدقيق والحركات الرقابية" : "Audit Trail Log",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "الإجراء" : "Action", key: "action" },
        { header: isAr ? "نوع الكيان" : "Entity Type", key: "entity" },
        { header: isAr ? "المعرف" : "Entity ID", key: "entityId" },
        { header: isAr ? "المستخدم المنفذ" : "Actor Name", key: "actor" },
        { header: isAr ? "سبب الإجراء" : "Reason", key: "reason" },
        { header: isAr ? "تاريخ ووقت الحركة" : "Timestamp", key: "time" },
      ],
      rows: filteredItems.map((i) => ({
        action: i.action,
        entity: i.entityType,
        entityId: i.entityId,
        actor: i.actorName,
        reason: i.reason,
        time: i.timestamp,
      })),
      filename: `Audit_Trail_${new Date().toISOString().slice(0, 10)}.xlsx`,
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
                {isAr ? "سجل التدقيق والرقابة (Audit Trail)" : "Audit Trail"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "سجل التدقيق والحركات الملغاة ومكافحة التلاعب" : "Audit Trail & Anti-Fraud Governance Report"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "تقرير الحوكمة والرقابة الداخلية: تتبع غير قابل للتعديل لكافة السندات الملغاة، القيود العكسية، وتغييرات الصلاحيات مع توثيق الأسباب والمستخدمين."
                : "Immutable audit log tracking voided transactions, payment reversals, RBAC modifications, and mandatory change rationales."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي الحركات الموثقة" : "Total Audit Logs"}</span>
              <ShieldCheck className="size-4 text-indigo-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">{metrics.totalEvents}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "سجلات غير قابلة للحذف" : "Immutable trail"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "حركات الإلغاء والعكس" : "Void/Reversal Events"}</span>
              <AlertOctagon className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">{metrics.voidEvents}</p>
            <span className="text-[10px] text-rose-600/80 block mt-0.5">{isAr ? "سندات وقيود ملغاة" : "Reversals logged"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "تعديلات الأمان والصلاحيات" : "Security & RBAC"}</span>
              <Lock className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">{metrics.securityEvents}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "تغيير صلاحيات ومستخدمين" : "Role assignments"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "المستخدمين المنفذين" : "Active Actors"}</span>
              <User className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{metrics.uniqueActors}</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "مسؤولين ومحاسبين" : "Staff tracked"}</span>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "كافة الحركات الرقابية" : "All Audit Events"}</option>
            <option value="VOIDS">{isAr ? "حركات الإلغاء والعكس فقط" : "Voids & Reversals Only"}</option>
            <option value="FINANCE">{isAr ? "الحركات المالية والمحاسبية" : "Financial Events"}</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالمستخدم، الإجراء، السبب..." : "Search actor, reason..."}
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
                <th className="p-3.5 text-start">{isAr ? "نوع الإجراء الرقابي" : "Action"}</th>
                <th className="p-3.5 text-start">{isAr ? "الكيان المستهدف" : "Entity Type"}</th>
                <th className="p-3.5 text-start">{isAr ? "المستخدم المنفذ" : "Actor Name"}</th>
                <th className="p-3.5 text-start">{isAr ? "السبب الموثق والتفاصيل" : "Reason & Summary"}</th>
                <th className="p-3.5 text-center">{isAr ? "التوقيت" : "Timestamp"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredItems.length ? (
                filteredItems.map((i) => (
                  <tr
                    key={i.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white font-sans">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${
                          i.action.includes("void") || i.action.includes("reverse")
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : i.action.includes("create")
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {i.action}
                      </Badge>
                    </td>

                    <td className="p-3.5 font-sans text-slate-700 dark:text-slate-300 font-bold">
                      {i.entityType}
                    </td>

                    <td className="p-3.5 font-sans font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <User className="size-3 text-slate-400" />
                        <span>{i.actorName}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-sans text-slate-600 dark:text-slate-400 max-w-xs truncate">
                      {i.reason}
                    </td>

                    <td className="p-3.5 text-center text-slate-500 text-[11px]">
                      {i.timestamp}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400 text-xs font-sans">
                    {isAr ? "لا توجد سجلات تدقيق مطابقة" : "No audit trail records found"}
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
