"use client";

import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Download,
  Building,
  Coins,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  PieChart,
  HardHat,
  ArrowRightLeft,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import ExcelJS from "exceljs";
import { ProjectForm, CapitaliseForm, ReleaseForm, type Option } from "./project-forms";

export type ProjectRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  status: string;
  accounts_set: boolean;
  budget_amount: number | string | null;
  capitalised: number | string;
  released: number | string;
  wip_balance: number | string;
  budget_variance: number | string | null;
};

const n = (v: number | string | null | undefined) => Number(v ?? 0);

interface ProjectsClientProps {
  projects: ProjectRow[];
  assetAccounts: Option[];
  expenseAccounts: Option[];
  creditAccounts: Option[];
  propertyOptions: Option[];
  canManage: boolean;
  locale: string;
  currency: string;
  organizationName?: string;
}

export function ProjectsClient({
  projects,
  assetAccounts,
  expenseAccounts,
  creditAccounts,
  propertyOptions,
  canManage,
  locale,
  currency,
  organizationName,
}: ProjectsClientProps) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [capitaliseOpen, setCapitaliseOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const currencySymbol = getCurrencyLabel(currency, isAr);

  // Financial Totals
  const totalBudget = useMemo(() => projects.reduce((sum, p) => sum + n(p.budget_amount), 0), [projects]);
  const totalCapitalised = useMemo(() => projects.reduce((sum, p) => sum + n(p.capitalised), 0), [projects]);
  const totalReleased = useMemo(() => projects.reduce((sum, p) => sum + n(p.released), 0), [projects]);
  const totalWipBalance = useMemo(() => projects.reduce((sum, p) => sum + n(p.wip_balance), 0), [projects]);

  const activeProjectsCount = useMemo(
    () => projects.filter((p) => p.status === "IN_PROGRESS" || p.status === "PLANNING").length,
    [projects]
  );

  const postableProjects = useMemo(
    () => projects.filter((p) => p.accounts_set && p.status !== "COMPLETED" && p.status !== "CANCELLED"),
    [projects]
  );

  const releasableProjects = useMemo(
    () => projects.filter((p) => p.accounts_set && n(p.wip_balance) > 0),
    [projects]
  );

  // Filtered rows
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.code.toLowerCase().includes(q) ||
        p.name_ar.toLowerCase().includes(q) ||
        p.name_en.toLowerCase().includes(q)
      );
    });
  }, [projects, statusFilter, query]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AqarBooks Projects & WIP";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(isAr ? "المشاريع تحت التنفيذ" : "Projects WIP", {
        views: [{ rightToLeft: isAr }],
      });

      worksheet.mergeCells("A1:H1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `${isAr ? "سجل المشاريع وتكاليف الأعمال تحت التنفيذ (WIP)" : "Projects & WIP Register"} - ${
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
        isAr ? "كود المشروع" : "Code",
        isAr ? "اسم المشروع" : "Project Name",
        isAr ? `الميزانية (${currency})` : `Budget (${currency})`,
        isAr ? `المرسمل WIP (${currency})` : `Capitalised (${currency})`,
        isAr ? `المتحرر للمبيعات (${currency})` : `Released (${currency})`,
        isAr ? `رصيد الأعمال الجارية (${currency})` : `WIP Balance (${currency})`,
        isAr ? `فرق الميزانية (${currency})` : `Variance (${currency})`,
        isAr ? "الحالة" : "Status",
      ];

      worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      worksheet.getRow(3).height = 24;

      filtered.forEach((p) => {
        worksheet.addRow([
          p.code,
          isAr ? p.name_ar : p.name_en,
          n(p.budget_amount),
          n(p.capitalised),
          n(p.released),
          n(p.wip_balance),
          n(p.budget_variance),
          p.status === "IN_PROGRESS"
            ? isAr ? "قيد التنفيذ" : "In Progress"
            : p.status === "PLANNING"
            ? isAr ? "تخطيط" : "Planning"
            : p.status === "COMPLETED"
            ? isAr ? "مكتمل" : "Completed"
            : isAr ? "ملغي" : "Cancelled",
        ]);
      });

      worksheet.columns = [
        { width: 14 },
        { width: 32 },
        { width: 20 },
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
      link.download = `Projects_WIP_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export projects:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "سجل المشاريع وتكاليف الأعمال تحت التنفيذ" : "Projects & WIP Cost Register",
        subtitle: isAr
          ? "متابعة موازنات المشاريع الإنشائية، التكاليف المرسملة، والمتحرر للمبيعات"
          : "Project construction budgets, capitalised WIP, and cost of sales releases",
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "كود المشروع" : "Code", key: "code", align: "start", width: "12%" },
          { header: isAr ? "اسم المشروع" : "Project Name", key: "name", align: "start", width: "26%" },
          { header: isAr ? "الميزانية" : "Budget", key: "budget", align: "end", isNumber: true, width: "15%" },
          { header: isAr ? "المرسمل (WIP)" : "Capitalised", key: "capitalised", align: "end", isNumber: true, width: "15%" },
          { header: isAr ? "المتحرر للمبيعات" : "Released", key: "released", align: "end", isNumber: true, width: "15%" },
          { header: isAr ? "رصيد WIP الحالي" : "WIP Balance", key: "wipBal", align: "end", isNumber: true, width: "17%" },
        ],
        rows: filtered.map((p) => ({
          code: p.code,
          name: isAr ? p.name_ar : p.name_en,
          budget: n(p.budget_amount) || "—",
          capitalised: n(p.capitalised),
          released: n(p.released),
          wipBal: n(p.wip_balance),
        })),
        totalRow: {
          code: isAr ? "الإجمالي" : "Total",
          name: "",
          budget: totalBudget,
          capitalised: totalCapitalised,
          released: totalReleased,
          wipBal: totalWipBalance,
        },
        summaryCards: [
          {
            label: isAr ? "إجمالي الميزانيات المعتمدة" : "Total Budgets",
            value: `${totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
          },
          {
            label: isAr ? "إجمالي التكاليف المرسملة" : "Capitalised Costs",
            value: `${totalCapitalised.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
          },
          {
            label: isAr ? "رصيد الأعمال الجارية الحالي" : "Current WIP Balance",
            value: `${totalWipBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`,
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
      {/* 1. Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Budget */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "إجمالي الميزانيات المعتمدة" : "Total Project Budgets"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <PieChart className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900 tracking-tight">
              {totalBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-slate-500">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {projects.length} {isAr ? "مشروع مسجل في المنظومة" : "total projects"}
          </p>
        </div>

        {/* Total Capitalised WIP */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "التكاليف المرسملة (WIP)" : "Total Capitalised Costs"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <HardHat className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-700 tracking-tight">
              {totalCapitalised.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-amber-600">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "تكاليف الإنشاء والتطوير الجارية" : "Construction & development costs"}
          </p>
        </div>

        {/* Released to Cost of Sales */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "المتحرر لتكلفة المبيعات" : "Released to Cost of Sales"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <ArrowRightLeft className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-purple-700 tracking-tight">
              {totalReleased.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-purple-600">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {isAr ? "محمّل على قائمة الدخل مع المبيعات" : "Recognised with closed sales"}
          </p>
        </div>

        {/* Active WIP Balance */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {isAr ? "رصيد الأعمال الجارية الحالي" : "Net Active WIP Balance"}
            </span>
            <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Coins className="size-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700 tracking-tight">
              {totalWipBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-bold text-emerald-600">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            {activeProjectsCount} {isAr ? "مشروع نشط قيد التنفيذ" : "active ongoing projects"}
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
                ? "ابحث بكود المشروع أو الاسم..."
                : "Search by project code or name..."
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
            <option value="IN_PROGRESS">{isAr ? "قيد التنفيذ" : "In Progress"}</option>
            <option value="PLANNING">{isAr ? "تخطيط" : "Planning"}</option>
            <option value="COMPLETED">{isAr ? "مكتمل" : "Completed"}</option>
          </select>

          {/* Export PDF */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={!projects.length}
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
            disabled={isExporting || !projects.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isExporting ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* Capitalise WIP Modal Trigger */}
          {canManage && postableProjects.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCapitaliseOpen(true)}
              className="h-10 rounded-xl border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100/70 text-xs font-bold gap-2 cursor-pointer"
            >
              <HardHat className="size-3.5 text-amber-700" />
              <span>{isAr ? "رسملة تكلفة WIP" : "Capitalise WIP"}</span>
            </Button>
          )}

          {/* Release to COS Modal Trigger */}
          {canManage && releasableProjects.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setReleaseOpen(true)}
              className="h-10 rounded-xl border-purple-300 bg-purple-50/80 text-purple-900 hover:bg-purple-100/70 text-xs font-bold gap-2 cursor-pointer"
            >
              <ArrowRightLeft className="size-3.5 text-purple-700" />
              <span>{isAr ? "تحرير إلى تكلفة المبيعات" : "Release Cost"}</span>
            </Button>
          )}

          {/* New Project Modal Trigger */}
          {canManage && (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{isAr ? "مشروع جديد" : "New Project"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* 3. Main Projects Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <tr className="text-start font-bold">
                <th className="px-4 py-3 text-start font-black">{isAr ? "كود المشروع" : "Code"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "اسم المشروع" : "Project Name"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "الميزانية" : "Budget"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "المرسمل (WIP)" : "Capitalised"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "المتحرر" : "Released"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "رصيد WIP" : "WIP Balance"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "الحالة" : "Status"}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filtered.length ? (
                filtered.map((p) => {
                  const budget = n(p.budget_amount);
                  const capitalised = n(p.capitalised);
                  const released = n(p.released);
                  const wipBal = n(p.wip_balance);
                  const isOverBudget = budget > 0 && capitalised > budget;

                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-slate-50/90">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-900">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {p.code}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 block text-xs sm:text-sm">
                            {isAr ? p.name_ar : p.name_en}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {isAr ? p.name_en : p.name_ar}
                          </span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-slate-700">
                        {budget > 0 ? (
                          <span>{budget.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono">
                        <span className={`font-bold ${isOverBudget ? "text-rose-600" : "text-amber-700"}`}>
                          {capitalised.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {isOverBudget && (
                          <span className="block text-[10px] text-rose-500 font-sans font-semibold">
                            {isAr ? "متجاوز الميزانية" : "Over Budget"}
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-purple-700">
                        {released.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono font-bold text-emerald-700 text-sm">
                        {wipBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] font-sans font-normal text-emerald-600">{currencySymbol}</span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {p.status === "IN_PROGRESS" ? (
                          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 font-bold text-[10px]">
                            {isAr ? "قيد التنفيذ" : "In Progress"}
                          </Badge>
                        ) : p.status === "PLANNING" ? (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 font-bold text-[10px]">
                            {isAr ? "تخطيط" : "Planning"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            {isAr ? "مكتمل" : "Completed"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500 space-y-2">
                    <Building className="size-8 mx-auto text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">
                      {isAr ? "لا توجد مشاريع مسجلة مطابقة للبحث" : "No projects found"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Dialogs */}
      {createOpen && (
        <ProjectForm
          open={createOpen}
          onOpenChange={setCreateOpen}
          assetAccounts={assetAccounts}
          expenseAccounts={expenseAccounts}
          properties={propertyOptions}
          locale={locale}
        />
      )}

      {capitaliseOpen && (
        <CapitaliseForm
          open={capitaliseOpen}
          onOpenChange={setCapitaliseOpen}
          projects={postableProjects.map((p) => ({
            id: p.id,
            label: `${p.code} — ${isAr ? p.name_ar : p.name_en}`,
          }))}
          creditAccounts={creditAccounts}
          locale={locale}
        />
      )}

      {releaseOpen && (
        <ReleaseForm
          open={releaseOpen}
          onOpenChange={setReleaseOpen}
          projects={releasableProjects.map((p) => ({
            id: p.id,
            label: `${p.code} — ${isAr ? p.name_ar : p.name_en} (${n(p.wip_balance).toLocaleString()} ${currencySymbol})`,
          }))}
          locale={locale}
        />
      )}
    </div>
  );
}
