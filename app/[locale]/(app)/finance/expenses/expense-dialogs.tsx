"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Receipt,
  Plus,
  Tag,
  CreditCard,
  Calendar,
  Layers,
  FileText,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ListFilter,
} from "lucide-react";
import { createExpenseCategoryAction, recordExpenseAction } from "@/lib/actions/purchasing";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type OptionItem = { id: string; label: string; code?: string };

export type CategoryDetail = {
  id: string;
  name_ar: string;
  name_en: string;
  default_expense_account_id?: string | null;
  expenseCount?: number;
  totalAmount?: number;
};

/* ──────────────────────────────────────────────────────────────────────────
   1. RECORD EXPENSE DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function RecordExpenseDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  categories,
  paymentAccounts,
  periods,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  categories: OptionItem[];
  paymentAccounts: OptionItem[];
  periods: OptionItem[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState<string>(paymentAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!categoryId) {
      setErrorMsg(isAr ? "يرجى اختيار فئة المصروف" : "Please select an expense category");
      return;
    }
    if (!paymentAccountId) {
      setErrorMsg(isAr ? "يرجى اختيار حساب الدفع (خزينة/بنك)" : "Please select a payment account");
      return;
    }
    if (!fiscalPeriodId) {
      setErrorMsg(isAr ? "يرجى اختيار الفترة المالية" : "Please select a fiscal period");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setErrorMsg(isAr ? "يرجى إدخال مبلغ صحيح أكبر من الصفر" : "Please enter a valid amount greater than 0");
      return;
    }
    if (!description.trim()) {
      setErrorMsg(isAr ? "يرجى كتابة وصف أو بيان للمصروف" : "Please enter an expense description");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("expenseCategoryId", categoryId);
      formData.set("paymentAccountId", paymentAccountId);
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("amount", amount);
      formData.set("description", description.trim());
      formData.set("expenseDate", expenseDate);

      const res = await recordExpenseAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل المصروف بنجاح" : "Expense Recorded Successfully",
          description: isAr
            ? `تم إصدار سند الصرف وترحيل القيد المحاسبي بمبلغ ${Number(amount).toLocaleString()} ${currencyLabel}`
            : `Expense voucher created and ledger updated for ${Number(amount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        // Reset form
        setAmount("");
        setDescription("");
        router.refresh();
      } else {
        setErrorMsg(
          res.error ||
            (isAr ? "حدث خطأ أثناء تسجيل المصروف" : "Failed to record expense")
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Receipt className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تسجيل سند صرف جديد" : "Record New Expense Voucher"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إصدار سند صرف مباشر وترحيل القيود المحاسبية للمصروف والخزينة تلقائياً."
                : "Create a direct expense voucher and auto-post double-entry ledger transactions."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300 shadow-2xs"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Category & Payment Account */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Category */}
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Tag className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{isAr ? "فئة المصروف" : "Expense Category"}</span>
                </Label>
                <Select
                  value={categoryId}
                  onValueChange={(val) => setCategoryId(val ?? "")}
                  items={categories.map((c) => ({ value: c.id, label: c.label }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر الفئة..." : "Select category..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Account */}
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <CreditCard className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isAr ? "حساب الدفع / الخزينة" : "Payment Account / Vault"}</span>
                </Label>
                <Select
                  value={paymentAccountId}
                  onValueChange={(val) => setPaymentAccountId(val ?? "")}
                  items={paymentAccounts.map((a) => ({ value: a.id, label: a.label }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount & Fiscal Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Amount */}
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{isAr ? "المبلغ" : "Amount"}</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="font-mono text-base font-bold pe-12"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              {/* Fiscal Period */}
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="size-3.5 text-purple-600 dark:text-purple-400" />
                  <span>{isAr ? "الفترة المالية" : "Fiscal Period"}</span>
                </Label>
                <Select
                  value={fiscalPeriodId}
                  onValueChange={(val) => setFiscalPeriodId(val ?? "")}
                  items={periods.map((p) => ({ value: p.id, label: p.label }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="size-3.5 text-slate-500" />
                <span>{isAr ? "تاريخ الصرف" : "Expense Date"}</span>
              </Label>
              <Input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="size-3.5 text-slate-500" />
                <span>{isAr ? "البيان / تفاصيل المصروف" : "Description / Notes"}</span>
              </Label>
              <Input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isAr
                    ? "مثال: صيانة مصاعد البرج الشمالي لشهر أغسطس"
                    : "e.g. Monthly maintenance of North Tower elevators"
                }
                className="text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
            >
              {isPending ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>{isAr ? "جارٍ تسجيل السند..." : "Recording..."}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>{isAr ? "ترحيل سند الصرف" : "Post Expense Voucher"}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. EXPENSE CATEGORIES MANAGEMENT DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function ExpenseCategoriesDialog({
  open,
  onOpenChange,
  organizationId,
  categories,
  expenseAccounts,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  categories: CategoryDetail[];
  expenseAccounts: OptionItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? "");

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorMsg(isAr ? "يرجى كتابة اسم الفئة بالعربية والإنجليزية" : "Please provide Arabic and English names");
      return;
    }
    if (!expenseAccountId) {
      setErrorMsg(isAr ? "يرجى تحديد حساب المصروف من شجرة الحسابات" : "Please select an expense account");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("nameAr", nameAr.trim());
      formData.set("nameEn", nameEn.trim());
      formData.set("defaultExpenseAccountId", expenseAccountId);

      const res = await createExpenseCategoryAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء الفئة بنجاح" : "Category Created Successfully",
          description: isAr ? `تمت إضافة فئة "${nameAr}"` : `Added category "${nameEn}"`,
        });
        setNameAr("");
        setNameEn("");
        setShowAddForm(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "تعذر إنشاء الفئة" : "Failed to create category"));
      }
    });
  };

  const accountNameById = new Map(expenseAccounts.map((a) => [a.id, a.label]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
            <Tag className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إدارة فئات المصروفات" : "Expense Categories Management"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تصنيف المصروفات وربط كل فئة بحسابها المخصص في دليل الحسابات."
                : "Categorize expenses and link each to its dedicated General Ledger chart account."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300 shadow-2xs"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Toggle Add Category Form */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListFilter className="size-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? `الفئات المتاحة (${categories.length})` : `Available Categories (${categories.length})`}
              </span>
            </div>
            <Button
              type="button"
              variant={showAddForm ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setShowAddForm(!showAddForm);
                setErrorMsg(null);
              }}
              className="text-xs font-bold gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>{showAddForm ? (isAr ? "إغلاق النموذج" : "Close Form") : (isAr ? "إضافة فئة جديدة" : "Add New Category")}</span>
            </Button>
          </div>

          {/* Add Category Form Accordion */}
          {showAddForm && (
            <form
              onSubmit={handleCreateCategory}
              className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3.5 dark:border-blue-900/40 dark:bg-blue-950/20"
            >
              <div className="flex items-center justify-between border-b border-blue-200/60 dark:border-blue-900/40 pb-2">
                <span className="text-xs font-extrabold text-blue-900 dark:text-blue-200">
                  {isAr ? "بيانات الفئة الجديدة" : "New Category Information"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "الاسم (بالعربية)" : "Name (Arabic)"}
                  </Label>
                  <Input
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="مثال: صيانة وتشغيل"
                    className="bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div className="space-y-1 text-start">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? "الاسم (بالإنجليزية)" : "Name (English)"}
                  </Label>
                  <Input
                    required
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. Operations & Maintenance"
                    className="bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب المصروف في دليل الحسابات" : "General Ledger Expense Account"}
                </Label>
                <Select
                  value={expenseAccountId}
                  onValueChange={(val) => setExpenseAccountId(val ?? "")}
                  items={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-900">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-1 flex justify-end gap-2">
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                >
                  {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  <span>{isAr ? "حفظ الفئة" : "Save Category"}</span>
                </Button>
              </div>
            </form>
          )}

          {/* Categories List Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pe-1">
            {categories.length ? (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition-all dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {isAr ? cat.name_ar : cat.name_en}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {cat.name_en}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {cat.default_expense_account_id
                        ? accountNameById.get(cat.default_expense_account_id) ?? "—"
                        : isAr ? "غير مرتبط بحساب" : "No linked account"}
                    </p>
                  </div>

                  {cat.expenseCount !== undefined && (
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{isAr ? "عدد السندات" : "Vouchers"}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {cat.expenseCount}
                      </span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="col-span-2 py-8 text-center text-xs text-slate-500">
                {isAr ? "لا توجد فئات مصروفات مسجلة بعد" : "No expense categories created yet"}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
