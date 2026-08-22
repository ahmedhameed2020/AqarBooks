"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Send,
  AlertTriangle,
  Clock,
  Download,
  Users,
  Coins,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ShieldAlert,
  BellRing,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import ExcelJS from "exceljs";
import { PolicyForm, RaiseStageForm, NoticeActions, type NoticeRow } from "./dunning-forms";

export type Candidate = {
  due_id: string;
  description: string;
  due_date: string;
  days_overdue: number;
  outstanding: number | string;
  member_id: string | null;
  member_name: string | null;
  stage: number;
  stage_name_ar: string;
  stage_name_en: string;
  already_raised: boolean;
};

export type Policy = {
  stage: number;
  name_ar: string;
  name_en: string;
  days_overdue: number;
  minimum_amount: number | string;
  is_active: boolean;
};

const n = (v: number | string | null | undefined) => Number(v ?? 0);

interface DunningClientProps {
  candidates: Candidate[];
  notices: NoticeRow[];
  policies: Policy[];
  canManage: boolean;
  locale: string;
  currency: string;
  organizationId: string;
  organizationName?: string;
}

export function DunningClient({
  candidates,
  notices,
  policies,
  canManage,
  locale,
  currency,
  organizationId,
  organizationName,
}: DunningClientProps) {
  const isAr = locale === "ar";
  const [activeTab, setActiveTab] = useState<"candidates" | "notices" | "policies">("candidates");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const currencySymbol = getCurrencyLabel(currency, isAr);

  // Overdue calculations
  const pendingCandidates = useMemo(() => candidates.filter((c) => !c.already_raised), [candidates]);
  const totalPendingAmount = useMemo(
    () => pendingCandidates.reduce((sum, c) => sum + n(c.outstanding), 0),
    [pendingCandidates]
  );
  const undeliveredNoticesCount = useMemo(
    () => notices.filter((x) => x.status === "RAISED").length,
    [notices]
  );

  const stageOptions = useMemo(
    () =>
      policies
        .filter((p) => p.is_active)
        .map((p) => ({
          stage: p.stage,
          label: isAr
            ? `المرحلة ${p.stage} — ${p.name_ar} (تأخير ${p.days_overdue} يومًا فأكثر)`
            : `Stage ${p.stage} — ${p.name_en} (${p.days_overdue}+ days)`,
        })),
    [policies, isAr]
  );

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => {
      if (stageFilter !== "ALL" && String(c.stage) !== stageFilter) return false;
      if (!q) return true;
      return (
        c.description.toLowerCase().includes(q) ||
        (c.member_name && c.member_name.toLowerCase().includes(q)) ||
        c.stage_name_ar.toLowerCase().includes(q) ||
        c.stage_name_en.toLowerCase().includes(q)
      );
    });
  }, [candidates, stageFilter, query]);

  // Filtered Notices
  const filteredNotices = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notices.filter((x) => {
      if (!q) return true;
      return (
        (x.member_name && x.member_name.toLowerCase().includes(q)) ||
        (x.contact_snapshot && x.contact_snapshot.toLowerCase().includes(q))
      );
    });
  }, [notices, query]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AqarBooks Collections Module";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(isAr ? "المستحقات المتأخرة" : "Overdue Dunning", {
        views: [{ rightToLeft: isAr }],
      });

      worksheet.mergeCells("A1:G1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `${isAr ? "سجل التحصيل وإشعارات التأخير" : "Collections & Dunning Statement"} - ${
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
        isAr ? "العميل / العضو" : "Member / Owner",
        isAr ? "البيان" : "Description",
        isAr ? "تاريخ الاستحقاق" : "Due Date",
        isAr ? "أيام التأخير" : "Days Overdue",
        isAr ? `المبلغ المستحق (${currency})` : `Outstanding (${currency})`,
        isAr ? "مرحلة الإشعار" : "Dunning Stage",
        isAr ? "حالة الإشعار" : "Notice Status",
      ];

      worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      worksheet.getRow(3).height = 24;

      filteredCandidates.forEach((c) => {
        worksheet.addRow([
          c.member_name || (isAr ? "غير مربوط بعضو" : "No member"),
          c.description,
          c.due_date,
          c.days_overdue,
          n(c.outstanding),
          isAr ? c.stage_name_ar : c.stage_name_en,
          c.already_raised ? (isAr ? "تم إصدار إشعار" : "Notice Raised") : isAr ? "بانتظار الإصدار" : "Pending",
        ]);
      });

      worksheet.columns = [
        { width: 24 },
        { width: 28 },
        { width: 16 },
        { width: 14 },
        { width: 20 },
        { width: 20 },
        { width: 18 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Collections_Dunning_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export dunning:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Overdue */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "إجمالي المتأخرات المؤهلة للإشعار" : "Total Eligible Overdue"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-700 tracking-tight">
              {totalPendingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-rose-600">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {pendingCandidates.length} {isAr ? "مستحق بانتظار رفع إشعار" : "pending dunning items"}
          </p>
        </div>

        {/* Total Candidates Count */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "إجمالي المستحقات المتأخرة" : "Total Overdue Items"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <AlertTriangle className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {candidates.length}
            </span>
            <span className="text-xs font-bold text-slate-500">{isAr ? "فاتورة / قسط" : "invoices"}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "تجاوزت فترة السماح المحددة" : "Exceeded grace periods"}
          </p>
        </div>

        {/* Notices Raised */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "الإشعارات الصادرة" : "Total Notices Raised"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <BellRing className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {notices.length}
            </span>
            <span className="text-xs font-bold text-slate-500">{isAr ? "إشعار" : "notices"}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "تم قيدها رسمياً في السجل" : "Logged in notice registry"}
          </p>
        </div>

        {/* Undelivered Notices */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "إشعارات بانتظار الإرسال" : "Pending Delivery"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Send className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-purple-700 tracking-tight">
              {undeliveredNoticesCount}
            </span>
            <span className="text-xs font-bold text-purple-600">{isAr ? "بانتظار التسليم" : "undelivered"}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "جاهزة للإرسال للعملاء" : "Ready for dispatch"}
          </p>
        </div>
      </div>

      {/* 2. Tabs and Navigation */}
      <div className="flex border-b border-slate-200 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab("candidates")}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "candidates"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {isAr ? "المستحقات المؤهلة للإشعار" : "Eligible Overdue"} ({pendingCandidates.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("notices")}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "notices"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {isAr ? "سجل الإشعارات المرفوعة" : "Notice Register"} ({notices.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("policies")}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "policies"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {isAr ? "سياسات ومراحل التحصيل" : "Dunning Policies"} ({policies.length})
        </button>
      </div>

      {/* 3. Action Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? "ابحث باسم العميل، البيان، أو المرحلة..."
                : "Search by member, description, or stage..."
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
          {activeTab === "candidates" && (
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="ALL">{isAr ? "جميع المراحل" : "All Stages"}</option>
              {policies.map((p) => (
                <option key={p.stage} value={String(p.stage)}>
                  {isAr ? `مرحلة ${p.stage}: ${p.name_ar}` : `Stage ${p.stage}: ${p.name_en}`}
                </option>
              ))}
            </select>
          )}

          {/* Export */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !candidates.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Download className="size-3.5 text-blue-600" />
            <span>{isExporting ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* Raise Stage Notices Modal Trigger */}
          {canManage && stageOptions.length > 0 && activeTab === "candidates" && (
            <Button
              type="button"
              onClick={() => setRaiseOpen(true)}
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
            >
              <BellRing className="size-4" />
              <span>{isAr ? "رفع إشعارات مرحلة" : "Raise Stage Notices"}</span>
            </Button>
          )}

          {/* Add / Edit Policy Modal Trigger */}
          {canManage && activeTab === "policies" && (
            <Button
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{isAr ? "إضافة مرحلة تحصيل" : "New Policy Stage"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4. Tab 1: Candidates Table */}
      {activeTab === "candidates" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                <tr className="text-start font-bold">
                  <th className="px-4 py-3 text-start font-black">{isAr ? "العميل / العضو" : "Member"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "البيان" : "Description"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "أيام التأخير" : "Days Overdue"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "المبلغ المستحق" : "Outstanding"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "المرحلة المؤهلة" : "Stage"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCandidates.length ? (
                  filteredCandidates.map((c) => {
                    const outstanding = n(c.outstanding);
                    const isSevere = c.days_overdue >= 90;
                    const isModerate = c.days_overdue >= 60;

                    return (
                      <tr key={c.due_id} className="group transition-colors hover:bg-slate-50/90">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          {c.member_name ? (
                            <span className="block">{c.member_name}</span>
                          ) : (
                            <span className="text-slate-400 italic">{isAr ? "غير مربوط بعضو" : "No member"}</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-700 font-medium">{c.description}</td>

                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                          {c.due_date}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-black ${
                              isSevere
                                ? "bg-rose-100 text-rose-800 border border-rose-200"
                                : isModerate
                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                : "bg-yellow-100 text-yellow-800 border border-yellow-200"
                            }`}
                          >
                            <Clock className="size-3" />
                            {c.days_overdue} {isAr ? "يوم" : "days"}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-rose-700 text-sm">
                          {outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                          <span className="text-[10px] font-sans font-normal text-rose-600">{currencySymbol}</span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 font-bold text-[10px]">
                            {isAr ? c.stage_name_ar : c.stage_name_en}
                          </Badge>
                        </td>

                        <td className="whitespace-nowrap px-4 py-3">
                          {c.already_raised ? (
                            <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-500 font-bold text-[10px]">
                              {isAr ? "صُدر إشعار بالفعل" : "Notice Raised"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                              <CheckCircle2 className="size-3 me-1" />
                              {isAr ? "مؤهل للإشعار" : "Ready"}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 space-y-2">
                      <CheckCircle2 className="size-8 mx-auto text-emerald-500" />
                      <p className="text-sm font-bold text-slate-700">
                        {isAr ? "لا توجد مستحقات متأخرة مطابقة" : "No overdue items"}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Tab 2: Notices Table */}
      {activeTab === "notices" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
                <tr className="text-start font-bold">
                  <th className="px-4 py-3 text-start font-black">{isAr ? "العميل" : "Member"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "تاريخ الإصدار" : "Raised Date"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "بيانات التواصل" : "Contact"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "المرحلة" : "Stage"}</th>
                  <th className="px-4 py-3 text-start font-black">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-end font-black">
                    <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredNotices.length ? (
                  filteredNotices.map((x) => (
                    <tr key={x.id} className="group transition-colors hover:bg-slate-50/90">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {x.member_name || (isAr ? "غير مسجل" : "Unknown")}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {x.raised_at.slice(0, 10)}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                        {x.contact_snapshot || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 font-bold text-[10px]">
                          {isAr ? x.stage_name_ar : x.stage_name_en}
                        </Badge>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`font-bold text-[10px] ${
                            x.status === "DELIVERED"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : x.status === "SETTLED"
                              ? "border-purple-300 bg-purple-50 text-purple-700"
                              : x.status === "CANCELLED"
                              ? "border-slate-300 bg-slate-100 text-slate-500"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {x.status === "DELIVERED"
                            ? isAr ? "تم التسليم" : "Delivered"
                            : x.status === "SETTLED"
                            ? isAr ? "تمت التسوية" : "Settled"
                            : x.status === "CANCELLED"
                            ? isAr ? "ملغي" : "Cancelled"
                            : isAr ? "بانتظار الإرسال" : "Raised"}
                        </Badge>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-end">
                        {canManage && (
                          <NoticeActions notice={x} locale={locale} />
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 space-y-2">
                      <BellRing className="size-8 mx-auto text-slate-300" />
                      <p className="text-sm font-bold text-slate-700">
                        {isAr ? "لا توجد إشعارات مسجلة" : "No notices recorded"}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Tab 3: Policies */}
      {activeTab === "policies" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {policies.map((p) => (
            <div
              key={p.stage}
              className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold text-xs">
                  #{p.stage}
                </span>
                <Badge
                  variant="outline"
                  className={
                    p.is_active
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-[10px]"
                      : "border-slate-300 bg-slate-100 text-slate-500 font-bold text-[10px]"
                  }
                >
                  {p.is_active ? (isAr ? "مفعلة" : "Active") : isAr ? "معطلة" : "Inactive"}
                </Badge>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 text-sm">{isAr ? p.name_ar : p.name_en}</h3>
                <span className="text-xs text-slate-400">{isAr ? p.name_en : p.name_ar}</span>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>{isAr ? "أيام التأخير المطلوبة:" : "Days Overdue:"}</span>
                  <span className="font-mono font-bold text-slate-900">{p.days_overdue} {isAr ? "يوم" : "days"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isAr ? "الحد الأدنى للمبلغ:" : "Min Amount:"}</span>
                  <span className="font-mono font-bold text-slate-900">
                    {n(p.minimum_amount).toLocaleString()} {currencySymbol}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialogs */}
      {raiseOpen && (
        <RaiseStageForm
          open={raiseOpen}
          onOpenChange={setRaiseOpen}
          organizationId={organizationId}
          stages={stageOptions}
          locale={locale}
        />
      )}

      {policyOpen && (
        <PolicyForm
          open={policyOpen}
          onOpenChange={setPolicyOpen}
          organizationId={organizationId}
          locale={locale}
        />
      )}
    </div>
  );
}
