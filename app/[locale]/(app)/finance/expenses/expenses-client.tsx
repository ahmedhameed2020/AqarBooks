"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Receipt,
  Plus,
  Tag,
  Search,
  ArrowUpDown,
  Filter,
  Layers,
  Calendar,
  CreditCard,
  Building2,
  ExternalLink,
  FileText,
  DollarSign,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Download,
  Printer,
  PieChart,
  BarChart3,
  FileSpreadsheet,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrencyLabel } from "@/lib/currency";
import {
  RecordExpenseDialog,
  ExpenseCategoriesDialog,
  type OptionItem,
  type CategoryDetail,
} from "./expense-dialogs";
import { buildExpensesXlsxBuffer, downloadXlsxBuffer } from "./expenses-excel";
import { VoucherPrintModal } from "./voucher-print-modal";

export type ExpenseRow = {
  id: string;
  voucher_number: number | null;
  description: string;
  amount: number;
  expense_date: string;
  expense_category_id: string;
  payment_account_id?: string | null;
  journal_entry_id?: string | null;
  created_at?: string;
};

export function ExpensesClient({
  expenses,
  categories,
  categoryDetails,
  paymentAccounts,
  expenseAccounts,
  periods,
  organizationId,
  organizationName = "AqarBooks",
  resortId,
  currency = "EGP",
  locale,
}: {
  expenses: ExpenseRow[];
  categories: OptionItem[];
  categoryDetails: CategoryDetail[];
  paymentAccounts: OptionItem[];
  expenseAccounts: OptionItem[];
  periods: OptionItem[];
  organizationId: string;
  organizationName?: string;
  resortId: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Dialog states
  const [recordExpenseOpen, setRecordExpenseOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [printingExpense, setPrintingExpense] = useState<ExpenseRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "amount_desc" | "amount_asc"
  >("date_desc");

  // Maps
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.label])),
    [categories]
  );
  const paymentAccountMap = useMemo(
    () => new Map(paymentAccounts.map((a) => [a.id, a.label])),
    [paymentAccounts]
  );

  // Filtered & Sorted Expenses
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        // Category filter
        if (selectedCategory !== "ALL" && e.expense_category_id !== selectedCategory) {
          return false;
        }
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchVoucher = e.voucher_number ? String(e.voucher_number).includes(q) : false;
          const matchDesc = e.description?.toLowerCase().includes(q) || false;
          const matchCat = (categoryMap.get(e.expense_category_id) || "").toLowerCase().includes(q);
          const matchAmount = String(e.amount).includes(q);
          return matchVoucher || matchDesc || matchCat || matchAmount;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime();
        }
        if (sortBy === "date_asc") {
          return new Date(a.expense_date).getTime() - new Date(b.expense_date).getTime();
        }
        if (sortBy === "amount_desc") {
          return b.amount - a.amount;
        }
        if (sortBy === "amount_asc") {
          return a.amount - b.amount;
        }
        return 0;
      });
  }, [expenses, selectedCategory, searchQuery, sortBy, categoryMap]);

  // Overall Total
  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  // Top spending categories for visual distribution bar
  const distributionData = useMemo(() => {
    if (!totalAmount) return [];
    return categoryDetails
      .filter((c) => (c.totalAmount ?? 0) > 0)
      .sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: isAr ? c.name_ar : c.name_en,
        amount: c.totalAmount ?? 0,
        percentage: Math.round(((c.totalAmount ?? 0) / totalAmount) * 100),
      }));
  }, [categoryDetails, totalAmount, isAr]);

  // Excel Export Handler
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const buffer = await buildExpensesXlsxBuffer(
        filteredExpenses,
        categoryMap,
        paymentAccountMap,
        currencyLabel,
        isAr
      );
      const dateStr = new Date().toISOString().split("T")[0];
      downloadXlsxBuffer(`Expenses_Report_${dateStr}.xlsx`, buffer);
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Color generator for category badges and bars
  const categoryPalette = [
    {
      badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/60 dark:text-blue-300",
      bar: "bg-blue-600",
    },
    {
      badge: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/60 dark:text-purple-300",
      bar: "bg-purple-600",
    },
    {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300",
      bar: "bg-emerald-600",
    },
    {
      badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/60 dark:text-amber-300",
      bar: "bg-amber-600",
    },
    {
      badge: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/60 dark:text-teal-300",
      bar: "bg-teal-600",
    },
    {
      badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300",
      bar: "bg-rose-600",
    },
  ];

  const getCategoryStyles = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
    return categoryPalette[Math.abs(hash) % categoryPalette.length];
  };

  const sortItems = [
    { value: "date_desc", label: isAr ? "الأحدث تاريخاً" : "Newest Date" },
    { value: "date_asc", label: isAr ? "الأقدم تاريخاً" : "Oldest Date" },
    { value: "amount_desc", label: isAr ? "المبلغ (الأعلى أولاً)" : "Amount (High to Low)" },
    { value: "amount_asc", label: isAr ? "المبلغ (الأقل أولاً)" : "Amount (Low to High)" },
  ];

  const categoryFilterItems = [
    { value: "ALL", label: isAr ? "كل الفئات" : "All Categories" },
    ...categories.map((c) => ({ value: c.id, label: c.label })),
  ];

  return (
    <div className="space-y-6">
      {/* ── Visual Spending Distribution Summary Bar ─────────────────── */}
      {distributionData.length > 0 && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="size-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? "التوزيع النسبي للمصروفات حسب الفئات" : "Category Spending Breakdown"}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400 font-semibold">
              {isAr ? "أعلى الفئات إنفاقاً" : "Top Categories"}
            </span>
          </div>

          {/* Segmented Progress Bar */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 gap-0.5">
            {distributionData.map((cat) => (
              <div
                key={cat.id}
                style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                className={`${getCategoryStyles(cat.id).bar} transition-all`}
                title={`${cat.name}: ${cat.percentage}% (${cat.amount.toLocaleString()} ${currencyLabel})`}
              />
            ))}
          </div>

          {/* Legend Items */}
          <div className="flex items-center gap-4 flex-wrap text-xs pt-1">
            {distributionData.map((cat) => (
              <div key={cat.id} className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${getCategoryStyles(cat.id).bar}`} />
                <span className="text-slate-600 dark:text-slate-300 font-medium">{cat.name}:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {cat.percentage}%
                </span>
                <span className="text-[10px] text-slate-400">
                  ({cat.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currencyLabel})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top Header Controls & Triggers ──────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="size-5 text-blue-600 dark:text-blue-400" />
            <span>{isAr ? "سندات الصرف والعمليات" : "Expense Vouchers & Ledgers"}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? "سجل القيود وسندات الصرف المسجلة على المنشأة مع إمكانية الطباعة والتصدير والربط المحاسبي."
              : "Ledger of recorded expense vouchers with print, excel export, and automated journal linkage."}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Excel Export Button */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !filteredExpenses.length}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isExporting ? (isAr ? "جارٍ التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* Categories Dialog */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setCategoriesOpen(true)}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Tag className="size-3.5 text-purple-600 dark:text-purple-400" />
            <span>{isAr ? "إدارة الفئات" : "Expense Categories"}</span>
          </Button>

          {/* Record Expense Button */}
          <Button
            type="button"
            onClick={() => setRecordExpenseOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 h-9 shadow-sm cursor-pointer"
          >
            <Plus className="size-4" />
            <span>{isAr ? "تسجيل سند صرف جديد" : "Record Expense"}</span>
          </Button>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
        {/* Search bar */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
            <Search className="size-4" />
          </div>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr
                ? "البحث برقم السند، البيان، الفئة، أو المبلغ..."
                : "Search by voucher #, description, category, or amount..."
            }
            className="ps-9 pe-4 h-9 text-xs bg-slate-50/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-slate-400 shrink-0" />
            <Select
              value={selectedCategory}
              onValueChange={(val) => setSelectedCategory(val ?? "ALL")}
              items={categoryFilterItems}
            >
              <SelectTrigger className="h-9 min-w-[150px] text-xs bg-slate-50/70 dark:bg-slate-950/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryFilterItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="size-3.5 text-slate-400 shrink-0" />
            <Select
              value={sortBy}
              onValueChange={(val) => setSortBy((val as typeof sortBy) ?? "date_desc")}
              items={sortItems}
            >
              <SelectTrigger className="h-9 min-w-[150px] text-xs bg-slate-50/70 dark:bg-slate-950/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Table Container ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">{isAr ? "رقم السند" : "Voucher #"}</TableHead>
                <TableHead className="w-[170px]">{isAr ? "الفئة" : "Category"}</TableHead>
                <TableHead className="min-w-[240px]">{isAr ? "البيان / الوصف" : "Description"}</TableHead>
                <TableHead className="w-[140px]">{isAr ? "المبلغ" : "Amount"}</TableHead>
                <TableHead className="w-[130px]">{isAr ? "تاريخ الصرف" : "Date"}</TableHead>
                <TableHead className="w-[170px] text-end">{isAr ? "الإجراءات والقيود" : "Actions & Ledger"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length ? (
                filteredExpenses.map((exp) => (
                  <TableRow
                    key={exp.id}
                    onClick={() => setSelectedExpense(exp)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    {/* Voucher Number */}
                    <TableCell className="font-mono py-3.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
                        <Receipt className="size-3 text-slate-400" />
                        <span>#{exp.voucher_number ?? "—"}</span>
                      </div>
                    </TableCell>

                    {/* Category */}
                    <TableCell className="py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          getCategoryStyles(exp.expense_category_id).badge
                        }`}
                      >
                        <Tag className="size-3" />
                        <span>{categoryMap.get(exp.expense_category_id) ?? "—"}</span>
                      </span>
                    </TableCell>

                    {/* Description */}
                    <TableCell className="py-3.5">
                      <p className="font-medium text-slate-900 dark:text-white line-clamp-1">
                        {exp.description}
                      </p>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="py-3.5">
                      <div className="inline-flex items-baseline gap-1 font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                        <span>
                          {exp.amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {currencyLabel}
                        </span>
                      </div>
                    </TableCell>

                    {/* Date */}
                    <TableCell className="py-3.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <div className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-slate-400" />
                        <span>{exp.expense_date}</span>
                      </div>
                    </TableCell>

                    {/* Actions & Journal Entry */}
                    <TableCell className="py-3.5 text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2 justify-end">
                        {/* Quick Print Trigger */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPrintingExpense(exp)}
                          title={isAr ? "طباعة سند الصرف" : "Print Voucher"}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                        >
                          <Printer className="size-3.5" />
                        </Button>

                        {/* Journal Entry Link */}
                        {exp.journal_entry_id ? (
                          <Link
                            href={`/finance/journals/${exp.journal_entry_id}`}
                            locale={locale as Locale}
                            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            <span>{isAr ? "القيد" : "Entry"}</span>
                            <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
                      <Receipt className="size-7" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {searchQuery || selectedCategory !== "ALL"
                        ? isAr
                          ? "لا توجد نتائج تطابق خيارات البحث"
                          : "No expenses match your search"
                        : isAr
                        ? "لا توجد سندات صرف مسجلة بعد"
                        : "No expense vouchers recorded yet"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {searchQuery || selectedCategory !== "ALL"
                        ? isAr
                          ? "جرب تعديل كلمات البحث أو تصفية الفئات."
                          : "Try adjusting your search query or category filters."
                        : isAr
                        ? "ابدأ بإصدار أول سند صرف مباشر لتسجيل مصروفات التشغيل والصيانة."
                        : "Start by creating your first expense voucher."}
                    </p>
                    {!searchQuery && selectedCategory === "ALL" && (
                      <div className="mt-4">
                        <Button
                          type="button"
                          onClick={() => setRecordExpenseOpen(true)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                        >
                          <Plus className="size-3.5" />
                          <span>{isAr ? "تسجيل أول سند صرف" : "Record First Expense"}</span>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Footer Summary */}
        <div className="flex items-center justify-between border-t border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3 text-xs text-slate-500">
          <span>
            {isAr
              ? `عرض ${filteredExpenses.length} من إجمالي ${expenses.length} سند صرف`
              : `Showing ${filteredExpenses.length} of ${expenses.length} expense vouchers`}
          </span>
          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
            {isAr ? "المجموع المعروض: " : "Subtotal: "}
            <span className="text-rose-600 dark:text-rose-400">
              {filteredExpenses
                .reduce((sum, e) => sum + e.amount, 0)
                .toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
              {currencyLabel}
            </span>
          </span>
        </div>
      </div>

      {/* ── Voucher Detail Inspection Dialog ────────────────────────── */}
      {selectedExpense && (
        <Dialog open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <FileCheck className="size-5" />
              </div>
              <div>
                <DialogTitle>
                  {isAr
                    ? `تفاصيل سند صرف #${selectedExpense.voucher_number ?? "—"}`
                    : `Expense Voucher #${selectedExpense.voucher_number ?? "—"}`}
                </DialogTitle>
                <DialogDescription>
                  {isAr
                    ? "بيانات السند والقيد المحاسبي المرتبط"
                    : "Voucher details and general ledger posting"}
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <span className="text-xs text-slate-500">{isAr ? "المبلغ الإجمالي" : "Total Amount"}</span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-lg">
                    {selectedExpense.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">{isAr ? "فئة المصروف" : "Category"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {categoryMap.get(selectedExpense.expense_category_id) ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isAr ? "تاريخ الصرف" : "Date"}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {selectedExpense.expense_date}
                    </span>
                  </div>
                </div>

                <div className="text-xs pt-1">
                  <span className="text-slate-400 block">{isAr ? "حساب الدفع / الخزينة" : "Payment Account"}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                    {selectedExpense.payment_account_id
                      ? paymentAccountMap.get(selectedExpense.payment_account_id) ?? "—"
                      : "—"}
                  </span>
                </div>

                <div className="text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">{isAr ? "البيان / الوصف" : "Description"}</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-1 leading-relaxed">
                    {selectedExpense.description}
                  </p>
                </div>
              </div>

              {selectedExpense.journal_entry_id && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs flex items-center justify-between dark:border-blue-900/40 dark:bg-blue-950/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="font-bold text-blue-900 dark:text-blue-200">
                      {isAr ? "تم إنشاء قيد محاسبي متوازن" : "Double-Entry Ledger Posted"}
                    </span>
                  </div>
                  <Link
                    href={`/finance/journals/${selectedExpense.journal_entry_id}`}
                    locale={locale as Locale}
                    className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline"
                  >
                    <span>{isAr ? "فتح القيد" : "Open Ledger"}</span>
                    <ArrowRight className="size-3 rtl:rotate-180" />
                  </Link>
                </div>
              )}
            </DialogBody>

            <DialogFooter className="flex items-center justify-between w-full">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const exp = selectedExpense;
                  setSelectedExpense(null);
                  setPrintingExpense(exp);
                }}
                className="gap-1.5 text-xs font-bold"
              >
                <Printer className="size-3.5 text-blue-600" />
                <span>{isAr ? "طباعة السند الرسمي" : "Print Voucher"}</span>
              </Button>

              <Button variant="outline" size="sm" onClick={() => setSelectedExpense(null)}>
                {isAr ? "إغلاق" : "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Official Printable Voucher Modal ────────────────────────── */}
      <VoucherPrintModal
        open={!!printingExpense}
        onOpenChange={(open) => !open && setPrintingExpense(null)}
        expense={printingExpense}
        categoryName={
          printingExpense
            ? categoryMap.get(printingExpense.expense_category_id) ?? "—"
            : "—"
        }
        accountName={
          printingExpense && printingExpense.payment_account_id
            ? paymentAccountMap.get(printingExpense.payment_account_id) ?? "—"
            : "—"
        }
        organizationName={organizationName}
        currencyCode={currency}
        currencyLabel={currencyLabel}
        locale={locale}
      />

      {/* ── Dialogs: Record Expense & Categories ────────────────────── */}
      <RecordExpenseDialog
        open={recordExpenseOpen}
        onOpenChange={setRecordExpenseOpen}
        organizationId={organizationId}
        resortId={resortId}
        categories={categories}
        paymentAccounts={paymentAccounts}
        periods={periods}
        currency={currency}
        locale={locale}
      />

      <ExpenseCategoriesDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        organizationId={organizationId}
        categories={categoryDetails}
        expenseAccounts={expenseAccounts}
        locale={locale}
      />
    </div>
  );
}
