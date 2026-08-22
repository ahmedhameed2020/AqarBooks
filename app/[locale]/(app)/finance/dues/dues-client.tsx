"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileText,
  Plus,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Tag,
  ChevronRight,
  Filter,
  Layers,
  DollarSign,
  ArrowUpRight,
  Printer,
  Download,
} from "lucide-react";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrencyLabel } from "@/lib/currency";
import { CreateDueTypeDialog, IssueDueDialog, type Option } from "./dues-dialogs";

export type DueItem = {
  id: string;
  unit_id: string;
  unit_code: string;
  due_type_name?: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  issue_date?: string;
  due_date: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" | string;
  description?: string | null;
};

export function DuesClient({
  dues,
  units,
  dueTypes,
  revenueAccounts,
  receivableAccounts,
  periods,
  organizationId,
  resortId,
  currency = "EGP",
  locale,
  preselectedUnitId,
}: {
  dues: DueItem[];
  units: Option[];
  dueTypes: Option[];
  revenueAccounts: { id: string; code: string; name_ar: string; name_en: string }[];
  receivableAccounts: Option[];
  periods: Option[];
  organizationId: string;
  resortId: string;
  currency?: string;
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<string>(preselectedUnitId ?? "ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNPAID" | "PAID" | "OVERDUE">("ALL");

  const [issueDueOpen, setIssueDueOpen] = useState(false);
  const [createTypeOpen, setCreateTypeOpen] = useState(false);

  // Filtered Dues
  const filteredDues = useMemo(() => {
    return dues.filter((d) => {
      // Unit filter
      if (selectedUnit !== "ALL" && d.unit_id !== selectedUnit) return false;

      // Status filter
      if (statusFilter === "UNPAID" && d.status !== "ISSUED" && d.status !== "PARTIALLY_PAID") return false;
      if (statusFilter === "PAID" && d.status !== "PAID") return false;
      if (statusFilter === "OVERDUE" && d.status !== "OVERDUE") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const code = d.unit_code.toLowerCase();
        const type = (d.due_type_name || "").toLowerCase();
        const desc = (d.description || "").toLowerCase();
        const date = d.due_date.toLowerCase();
        return code.includes(q) || type.includes(q) || desc.includes(q) || date.includes(q);
      }

      return true;
    });
  }, [dues, selectedUnit, statusFilter, searchQuery]);

  const handleExportPdf = () => {
    const totalAmount = filteredDues.reduce((s, d) => s + d.amount, 0);
    const totalPaid = filteredDues.reduce((s, d) => s + d.paid_amount, 0);
    const totalRemaining = filteredDues.reduce((s, d) => s + d.remaining_amount, 0);

    generateFinancialStatementPdf(
      {
        title: isAr ? "سجل استحقاقات ومطالبات الوحدات" : "Property Units Dues & Demands Registry",
        subtitle: isAr
          ? `بيان المطالبات والاستحقاقات الدورية والتحصيلات — ${statusFilter === "ALL" ? "جميع الحالات" : statusFilter}`
          : `Units dues, periodic demands, collections and outstanding balances — Status: ${statusFilter}`,
        organizationName: "AqarBooks",
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "unit", align: "start", width: "16%" },
          { header: isAr ? "نوع المستحق والبيان" : "Due Type & Memo", key: "type", align: "start", width: "28%" },
          { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate", align: "center", width: "16%" },
          { header: isAr ? "مبلغ المستحق" : "Total Due", key: "amount", align: "end", isNumber: true, width: "14%" },
          { header: isAr ? "المسدد" : "Paid", key: "paid", align: "end", isNumber: true, width: "13%" },
          { header: isAr ? "المتبقي" : "Remaining", key: "remaining", align: "end", isNumber: true, width: "13%" },
        ],
        rows: filteredDues.map((d) => ({
          unit: d.unit_code,
          type: d.due_type_name ? `${d.due_type_name}${d.description ? ` (${d.description})` : ""}` : d.description || "—",
          dueDate: d.due_date,
          amount: d.amount,
          paid: d.paid_amount,
          remaining: d.remaining_amount,
        })),
        totalRow: {
          unit: isAr ? "الإجمالي" : "Total",
          type: "",
          dueDate: "",
          amount: totalAmount,
          paid: totalPaid,
          remaining: totalRemaining,
        },
        summaryCards: [
          { label: isAr ? "عدد المطالبات" : "Total Demands", value: filteredDues.length },
          {
            label: isAr ? "إجمالي المطالبات" : "Total Billed Dues",
            value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
          },
          {
            label: isAr ? "إجمالي المتأخرات المتبقية" : "Total Open Arrears",
            value: `${totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            highlight: true,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AqarBooks";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(isAr ? "مستحقات الوحدات" : "Unit Dues", {
      views: [{ rightToLeft: isAr }],
    });

    const headers = [
      isAr ? "كود الوحدة" : "Unit Code",
      isAr ? "نوع المستحق" : "Due Type",
      isAr ? "البيان / الوصف" : "Memo / Description",
      isAr ? "تاريخ الاستحقاق" : "Due Date",
      isAr ? "مبلغ المستحق" : "Total Due",
      isAr ? "المسدد" : "Paid",
      isAr ? "المتبقي" : "Remaining",
      isAr ? "حالة السداد" : "Status",
    ];

    worksheet.columns = [
      { header: headers[0], width: 16 },
      { header: headers[1], width: 24 },
      { header: headers[2], width: 30 },
      { header: headers[3], width: 16 },
      { header: headers[4], width: 18 },
      { header: headers[5], width: 18 },
      { header: headers[6], width: 18 },
      { header: headers[7], width: 16 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: isAr ? "right" : "left", vertical: "middle" };
    });

    for (const d of filteredDues) {
      const row = worksheet.addRow([
        d.unit_code,
        d.due_type_name || (isAr ? "مطالبة دورية" : "Standard Due"),
        d.description || "—",
        d.due_date,
        d.amount,
        d.paid_amount,
        d.remaining_amount,
        d.status,
      ]);
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(6).numFmt = "#,##0.00";
      row.getCell(7).numFmt = "#,##0.00";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Dues_${statusFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & FILTER CONTROLS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search & Unit Filter */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "بحث بالوحدة أو البيان..." : "Search unit or memo..."}
              className="ps-9 text-xs h-9"
            />
          </div>

          <Select value={selectedUnit} onValueChange={(val) => setSelectedUnit(val ?? "ALL")} items={[{ value: "ALL", label: isAr ? "كل الوحدات" : "All Units" }, ...units.map((u) => ({ value: u.id, label: u.label })) ]}>
            <SelectTrigger className="w-40 text-xs h-9">
              <SelectValue placeholder={isAr ? "الوحدة" : "Unit"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{isAr ? "كل الوحدات" : "All Units"}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status Tabs & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {(
              [
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "UNPAID", labelAr: "قيد التحصيل", labelEn: "Open" },
                { key: "PAID", labelAr: "مسددة", labelEn: "Paid" },
                { key: "OVERDUE", labelAr: "متأخرة", labelEn: "Overdue" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === tab.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / PDF" : "Print PDF"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
          </Button>

          {/* Create Due Type */}
          <Button
            onClick={() => setCreateTypeOpen(true)}
            variant="outline"
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Tag className="size-3.5 text-slate-500" />
            <span>{isAr ? "نوع مستحق" : "Due Type"}</span>
          </Button>

          {/* Issue Due Button */}
          <Button
            onClick={() => setIssueDueOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
          >
            <Plus className="size-3.5" />
            <span>{isAr ? "إصدار مستحق جديد" : "Issue Due"}</span>
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST DUES TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "الوحدة العقارية" : "Unit"}</th>
                <th className="p-3.5 text-start">{isAr ? "نوع المستحق والبيان" : "Due Type & Memo"}</th>
                <th className="p-3.5 text-start">{isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
                <th className="p-3.5 text-end">{isAr ? "مبلغ المستحق" : "Total Due"}</th>
                <th className="p-3.5 text-end">{isAr ? "المسدد" : "Paid"}</th>
                <th className="p-3.5 text-end">{isAr ? "المتبقي" : "Remaining"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-end">{isAr ? "التحصيل" : "Collect"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredDues.length ? (
                filteredDues.map((due) => {
                  const isPaid = due.status === "PAID";
                  const isPartiallyPaid = due.status === "PARTIALLY_PAID";
                  const isOverdue = due.status === "OVERDUE";
                  const isIssued = due.status === "ISSUED";

                  return (
                    <tr
                      key={due.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-blue-600 shrink-0" />
                          <span className="font-mono font-black text-sm">{due.unit_code}</span>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {due.due_type_name || (isAr ? "مطالبة دورية" : "Standard Due")}
                        </div>
                        {due.description && (
                          <div className="text-[11px] text-slate-400 font-medium truncate max-w-xs">
                            {due.description}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {due.due_date}
                      </td>

                      <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white text-xs">
                        {due.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                        {due.paid_amount > 0 ? (
                          <>
                            {due.paid_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {due.remaining_amount > 0 ? (
                          <span className={isOverdue ? "text-rose-600" : "text-amber-600"}>
                            {due.remaining_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </span>
                        ) : (
                          <span className="text-emerald-600">0.00</span>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isPaid
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                              : isPartiallyPaid
                              ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                              : isOverdue
                              ? "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                              : isIssued
                              ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isPaid && (isAr ? "✓ مسددة بالكامل" : "Paid in Full")}
                          {isPartiallyPaid && (isAr ? "سداد جزئي" : "Partial")}
                          {isOverdue && (isAr ? "متأخرة" : "Overdue")}
                          {isIssued && (isAr ? "صادرة / معلقة" : "Issued")}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end">
                        {!isPaid && (
                          <Link href={`/finance/cashier?unitId=${due.unit_id}`}>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-sm"
                            >
                              <CreditCard className="size-3" />
                              <span>{isAr ? "تحصيل سريع" : "Collect"}</span>
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد مستحقات مالية مطابقة لمعايير البحث" : "No dues found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          DIALOG MODALS
          ────────────────────────────────────────────────────────────────────────── */}
      <CreateDueTypeDialog
        open={createTypeOpen}
        onOpenChange={setCreateTypeOpen}
        organizationId={organizationId}
        revenueAccounts={revenueAccounts}
        locale={locale}
      />

      <IssueDueDialog
        open={issueDueOpen}
        onOpenChange={setIssueDueOpen}
        organizationId={organizationId}
        resortId={resortId}
        units={units}
        dueTypes={dueTypes}
        receivableAccounts={receivableAccounts}
        periods={periods}
        currency={currency}
        locale={locale}
        preselectedUnitId={preselectedUnitId}
      />
    </div>
  );
}
