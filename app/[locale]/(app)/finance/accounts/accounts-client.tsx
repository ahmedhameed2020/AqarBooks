"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ChevronRight,
  ChevronDown,
  Pencil,
  AlertTriangle,
  Folder,
  FileText,
  Download,
  Filter,
  CheckCircle2,
  Layers,
  Sparkles,
  PieChart,
  ArrowUpDown,
  X,
  Plus,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCOUNT_CATEGORIES,
  categoryLabel,
  categoryTone,
  normalBalanceLabel,
  cashFlowSectionLabel,
} from "@/lib/accounting/account-labels";
import { EditAccountDialog } from "./edit-account-dialog";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import ExcelJS from "exceljs";

export type AccountRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  parent_id: string | null;
  category: string;
  normal_balance: string;
  is_group: boolean;
  is_active: boolean;
  is_used: boolean;
  requires_cost_center: boolean;
  is_cash_equivalent: boolean;
  cash_flow_section: string | null;
};

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "UNCLASSIFIED";

function needsSection(account: AccountRow): boolean {
  return !account.is_group && !account.is_cash_equivalent && !account.cash_flow_section;
}

/** Depth-first order, parents before children, siblings by code. */
function buildTree(accounts: AccountRow[]) {
  const byParent = new Map<string | null, AccountRow[]>();
  for (const account of accounts) {
    const list = byParent.get(account.parent_id) ?? [];
    list.push(account);
    byParent.set(account.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }

  const ids = new Set(accounts.map((a) => a.id));
  const roots = accounts.filter((a) => !a.parent_id || !ids.has(a.parent_id));
  roots.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const out: (AccountRow & { depth: number; childCount: number })[] = [];
  const walk = (node: AccountRow, depth: number) => {
    const children = (byParent.get(node.id) ?? []).filter((c) => ids.has(c.id));
    out.push({ ...node, depth, childCount: children.length });
    for (const child of children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return out;
}

export function AccountsClient({
  accounts,
  canManage,
  locale,
  organizationName,
}: {
  accounts: AccountRow[];
  canManage: boolean;
  locale: string;
  organizationName?: string;
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const unclassifiedCount = useMemo(() => accounts.filter(needsSection).length, [accounts]);
  const postableCount = useMemo(() => accounts.filter((a) => !a.is_group).length, [accounts]);
  const groupCount = useMemo(() => accounts.filter((a) => a.is_group).length, [accounts]);

  const perCategory = useMemo(
    () =>
      ACCOUNT_CATEGORIES.map((cat) => ({
        category: cat,
        count: accounts.filter((a) => a.category === cat).length,
      })),
    [accounts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((account) => {
      if (category !== "ALL" && account.category !== category) return false;
      if (status === "ACTIVE" && !account.is_active) return false;
      if (status === "INACTIVE" && account.is_active) return false;
      if (status === "UNCLASSIFIED" && !needsSection(account)) return false;
      if (!q) return true;
      return (
        account.code.toLowerCase().includes(q) ||
        account.name_ar.toLowerCase().includes(q) ||
        account.name_en.toLowerCase().includes(q)
      );
    });
  }, [accounts, category, status, query]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  const visible = useMemo(() => {
    if (query.trim()) return tree;

    const hidden = new Set<string>();
    for (const node of tree) {
      if (node.parent_id && hidden.has(node.parent_id)) {
        hidden.add(node.id);
        continue;
      }
      if (collapsed.has(node.id)) {
        hidden.add(node.id);
      }
    }
    return tree.filter((node) => !node.parent_id || !hidden.has(node.parent_id));
  }, [tree, collapsed, query]);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseAll = () => {
    const idsWithChildren = accounts.filter((a) => a.is_group).map((a) => a.id);
    setCollapsed(new Set(idsWithChildren));
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "AqarBooks Financial System";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet(
        isAr ? "دليل الحسابات" : "Chart of Accounts",
        {
          views: [{ rightToLeft: isAr }],
        }
      );

      // Header info
      worksheet.mergeCells("A1:G1");
      const titleCell = worksheet.getCell("A1");
      titleCell.value = `${isAr ? "دليل وشجرة الحسابات المحاسبية" : "Chart of Accounts"} - ${
        organizationName || "AqarBooks"
      }`;
      titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A8A" },
      };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      worksheet.getRow(1).height = 30;

      // Table columns
      worksheet.getRow(3).values = [
        isAr ? "رمز الحساب" : "Account Code",
        isAr ? "الاسم بالعربية" : "Arabic Name",
        isAr ? "الاسم بالإنجليزية" : "English Name",
        isAr ? "التصنيف الرئيسي" : "Category",
        isAr ? "طبيعة الحساب" : "Normal Balance",
        isAr ? "النوع" : "Type",
        isAr ? "تصنيف التدفقات النقدية" : "Cash Flow Section",
      ];

      worksheet.getRow(3).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(3).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      worksheet.getRow(3).height = 24;

      // Add rows
      tree.forEach((a) => {
        worksheet.addRow([
          a.code,
          a.name_ar,
          a.name_en,
          categoryLabel(a.category, isAr),
          normalBalanceLabel(a.normal_balance, isAr),
          a.is_group ? (isAr ? "حساب تجميعي" : "Group") : (isAr ? "حساب فرعي مرحل" : "Postable"),
          a.is_cash_equivalent
            ? isAr
              ? "نقدية وما في حكمها"
              : "Cash & Equivalents"
            : cashFlowSectionLabel(a.cash_flow_section, isAr),
        ]);
      });

      worksheet.columns = [
        { width: 16 },
        { width: 32 },
        { width: 32 },
        { width: 18 },
        { width: 16 },
        { width: 18 },
        { width: 24 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Chart_of_Accounts_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export accounts to Excel:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "دليل وشجرة الحسابات المحاسبية" : "Chart of Accounts Registry",
        subtitle: isAr
          ? "دليل الحسابات وتصنيفاتها وقوائم التدفقات النقدية"
          : "Full account hierarchy and cash flow assignments",
        organizationName: organizationName || "AqarBooks",
        currencyLabel: "—",
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "رمز الحساب" : "Account Code", key: "code", align: "start", width: "16%" },
          { header: isAr ? "اسم الحساب" : "Account Name", key: "name", align: "start", width: "32%" },
          { header: isAr ? "التصنيف" : "Category", key: "category", align: "center", width: "16%" },
          { header: isAr ? "الرصيد الطبيعي" : "Normal Balance", key: "normalBalance", align: "center", width: "16%" },
          { header: isAr ? "قسم التدفقات النقدية" : "Cash Flow Section", key: "cashFlow", align: "start", width: "20%" },
        ],
        rows: tree.map((a) => ({
          code: a.code,
          name: isAr ? a.name_ar : a.name_en,
          category: categoryLabel(a.category, isAr),
          normalBalance:
            a.normal_balance === "DEBIT" ? (isAr ? "مدين" : "Debit") : isAr ? "دائن" : "Credit",
          cashFlow: cashFlowSectionLabel(a.cash_flow_section, isAr),
        })),
        summaryCards: [
          { label: isAr ? "إجمالي الحسابات" : "Total Accounts", value: accounts.length },
          {
            label: isAr ? "الحسابات النشطة" : "Active Accounts",
            value: accounts.filter((a) => a.is_active).length,
          },
          {
            label: isAr ? "الحسابات التجميعية" : "Group Accounts",
            value: accounts.filter((a) => a.is_group).length,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Interactive Metrics Cards & Category Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Accounts Metric */}
        <button
          type="button"
          onClick={() => {
            setCategory("ALL");
            setStatus("ALL");
          }}
          className={`flex flex-col justify-between rounded-2xl border p-4 text-start transition-all cursor-pointer ${
            category === "ALL" && status === "ALL"
              ? "border-blue-600 bg-blue-50/90 shadow-md ring-2 ring-blue-600/20"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              {isAr ? "إجمالي الحسابات" : "Total Accounts"}
            </span>
            <Layers className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{accounts.length}</span>
            <span className="text-[10px] font-semibold text-slate-400">
              ({postableCount} {isAr ? "مرحّل" : "postable"})
            </span>
          </div>
        </button>

        {/* Categories Breakdown (Clickable filters) */}
        {perCategory.map(({ category: cat, count }) => {
          const isSelected = category === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(category === cat ? "ALL" : cat)}
              className={`flex flex-col justify-between rounded-2xl border p-4 text-start transition-all cursor-pointer ${
                isSelected
                  ? "border-blue-600 bg-blue-50/90 shadow-md ring-2 ring-blue-600/20 scale-[1.02]"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 truncate">
                  {categoryLabel(cat, isAr)}
                </span>
                <span
                  className={`size-2 rounded-full ${
                    cat === "ASSET"
                      ? "bg-sky-500"
                      : cat === "LIABILITY"
                      ? "bg-amber-500"
                      : cat === "EQUITY"
                      ? "bg-violet-500"
                      : cat === "REVENUE"
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                  }`}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900">{count}</span>
                {isSelected && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-100/80 px-1.5 py-0.5 rounded">
                    {isAr ? "محدد" : "Active"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Unclassified Cash Flow Warning Banner */}
      {unclassifiedCount > 0 && status !== "UNCLASSIFIED" && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-xs font-semibold text-amber-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="size-4.5 text-amber-600 shrink-0" />
            <span>
              {isAr
                ? `يوجد ${unclassifiedCount} حساب فرعي غير مصنّف في التدفقات النقدية (تشغيلي، استثماري، تمويلي).`
                : `There are ${unclassifiedCount} postable accounts without a cash flow section.`}
            </span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStatus("UNCLASSIFIED")}
            className="h-8 shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100/60 text-xs font-bold gap-1.5"
          >
            <Filter className="size-3.5" />
            {isAr ? "عرض الحسابات غير المصنفة" : "View Unclassified"}
          </Button>
        </div>
      )}

      {/* 2. Search, Filter, and Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-slate-400 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAr
                ? "ابحث برمز الحساب، الاسم بالعربية أو الإنجليزية..."
                : "Search by account code, name in Arabic or English..."
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

        {/* Filters and Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Dropdown */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label={isAr ? "تصفية حسب الحالة" : "Filter by status"}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="ALL">{isAr ? "جميع الحالات" : "All Statuses"}</option>
            <option value="ACTIVE">{isAr ? "الحسابات النشطة" : "Active Only"}</option>
            <option value="INACTIVE">{isAr ? "الحسابات الموقوفة" : "Inactive Only"}</option>
            <option value="UNCLASSIFIED">
              {isAr ? "بلا تصنيف تدفقات" : "Unclassified Cash Flow"}
            </option>
          </select>

          {/* Expand / Collapse Tree Buttons */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={expandAll}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white transition-colors"
            >
              {isAr ? "فتح الكل" : "Expand All"}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white transition-colors"
            >
              {isAr ? "طي الكل" : "Collapse"}
            </button>
          </div>

          {/* Export to PDF Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={!accounts.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / PDF" : "Print / PDF"}</span>
          </Button>

          {/* Export to Excel Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !accounts.length}
            className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-800 hover:bg-slate-50 gap-2 cursor-pointer"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isExporting ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          {isAr
            ? `عرض ${visible.length} من أصل ${accounts.length} حساب في الشجرة المحاسبية`
            : `Showing ${visible.length} of ${accounts.length} accounts`}
        </span>
        {(category !== "ALL" || status !== "ALL" || query) && (
          <button
            type="button"
            onClick={() => {
              setCategory("ALL");
              setStatus("ALL");
              setQuery("");
            }}
            className="text-blue-600 hover:underline font-bold"
          >
            {isAr ? "إلغاء كل الفلاتر" : "Reset filters"}
          </button>
        )}
      </div>

      {/* 3. Main Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <tr className="text-start font-bold">
                <th className="px-4 py-3 text-start font-black">{isAr ? "الرمز" : "Code"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "اسم الحساب" : "Account Name"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "التصنيف" : "Category"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "الرصيد الطبيعي" : "Balance"}</th>
                <th className="px-4 py-3 text-start font-black">{isAr ? "التدفقات النقدية" : "Cash Flow"}</th>
                <th className="px-4 py-3 text-end font-black">
                  <span className="sr-only">{isAr ? "إجراءات" : "Actions"}</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {visible.length ? (
                visible.map((account) => {
                  const name = isAr ? account.name_ar : account.name_en;
                  const isCollapsed = collapsed.has(account.id);
                  return (
                    <tr
                      key={account.id}
                      className={`group transition-colors hover:bg-slate-50/90 ${
                        account.is_active ? "" : "opacity-60 bg-slate-50/40"
                      }`}
                    >
                      {/* Code */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-slate-900">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 border border-slate-200">
                          {account.code}
                        </span>
                      </td>

                      {/* Name with Hierarchy */}
                      <td className="px-4 py-3">
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingInlineStart: `${account.depth * 1.25}rem` }}
                        >
                          {/* Folder Toggle Icon */}
                          {account.childCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggle(account.id)}
                              aria-expanded={!isCollapsed}
                              aria-label={
                                isAr ? `طي أو فتح ${name}` : `Collapse or expand ${name}`
                              }
                              className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="size-4 rtl:rotate-180 text-blue-600" />
                              ) : (
                                <ChevronDown className="size-4 text-blue-600" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block w-6" />
                          )}

                          {/* Node Icon */}
                          {account.is_group ? (
                            <div className="flex size-6 items-center justify-center rounded-md bg-blue-50 text-blue-700 border border-blue-200/60">
                              <Folder className="size-3.5" />
                            </div>
                          ) : (
                            <div className="flex size-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 border border-slate-200/60">
                              <FileText className="size-3.5" />
                            </div>
                          )}

                          {/* Account Label */}
                          <span
                            className={`font-bold text-slate-900 ${
                              account.is_group ? "text-sm text-slate-950 font-black" : "text-xs font-semibold"
                            }`}
                          >
                            {name}
                          </span>

                          {/* Badges */}
                          {!account.is_active && (
                            <Badge
                              variant="outline"
                              className="ms-1 border-slate-300 text-[10px] text-slate-500 bg-slate-100"
                            >
                              {isAr ? "موقوف" : "Inactive"}
                            </Badge>
                          )}
                          {account.is_used && (
                            <span
                              className="ms-1 rounded-full bg-emerald-50 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 border border-emerald-200"
                              title={isAr ? "توجد قيود مرحّلة على هذا الحساب" : "Has posted entries"}
                            >
                              {isAr ? "مرحَّل" : "posted"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-lg border px-2.5 py-1 text-[11px] font-bold ${categoryTone(
                            account.category
                          )}`}
                        >
                          {categoryLabel(account.category, isAr)}
                        </span>
                      </td>

                      {/* Normal Balance */}
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-xs text-slate-600">
                        {normalBalanceLabel(account.normal_balance, isAr)}
                      </td>

                      {/* Cash Flow Classification */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {account.is_group ? (
                          <span className="text-slate-400">{isAr ? "تجميعي" : "Group"}</span>
                        ) : account.is_cash_equivalent ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <Sparkles className="size-3 text-emerald-600" />
                            {isAr ? "نقدية وما في حكمها" : "Cash & equivalents"}
                          </span>
                        ) : account.cash_flow_section ? (
                          <span className="font-semibold text-slate-700">
                            {cashFlowSectionLabel(account.cash_flow_section, isAr)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                            <AlertTriangle className="size-3 text-amber-600" />
                            {isAr ? "غير مصنف" : "Unclassified"}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-end">
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(account)}
                            className="h-8 gap-1.5 px-2.5 text-xs font-bold text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <Pencil className="size-3.5" />
                            {isAr ? "تعديل" : "Edit"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 space-y-2">
                    <Layers className="size-8 mx-auto text-slate-300" />
                    <p className="text-sm font-bold text-slate-700">
                      {isAr ? "لا توجد حسابات مطابقة للبحث أو التصفية" : "No accounts match your filter"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {isAr ? "جرب تغيير مصطلح البحث أو الفئات المختارة" : "Try adjusting your search query or filters"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Account Modal Dialog */}
      {editing && (
        <EditAccountDialog
          account={editing}
          accounts={accounts}
          open={!!editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          locale={locale}
        />
      )}
    </div>
  );
}
