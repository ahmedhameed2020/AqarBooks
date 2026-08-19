"use client";

import { useState, useTransition, useMemo } from "react";
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
  CreditCard,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Lock,
  Unlock,
  Printer,
  Send,
  Sparkles,
  Calculator,
  Search,
  Check,
} from "lucide-react";
import {
  createCashboxAction,
  openCashierSessionAction,
  closeCashierSessionAction,
  payDueFromCashierAction,
} from "@/lib/actions/treasury";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";
import { generatePaymentReceiptPdf } from "@/lib/reports/payment-receipt-pdf";
import { generateCashierSessionZReportPdf } from "@/lib/reports/cashier-session-zreport-pdf";

export type Option = { id: string; label: string };

export type DueItem = {
  id: string;
  unit_id: string;
  unit_code: string;
  member_id?: string | null;
  member_name?: string | null;
  title: string;
  due_date: string;
  original_amount: number;
  remaining_amount: number;
};

/* ──────────────────────────────────────────────────────────────────────────
   1. CREATE CASHBOX DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateCashboxDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  assetAccounts,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  assetAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [glAccountId, setGlAccountId] = useState<string>(assetAccounts[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(isAr ? "يرجى كتابة اسم الصندوق / الخزينة" : "Please enter cashbox name");
      return;
    }
    if (!glAccountId) {
      setErrorMsg(isAr ? "يرجى تحديد حساب الأستاذ المالي" : "Please select GL account");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("name", name.trim());
      formData.set("glAccountId", glAccountId);

      const res = await createCashboxAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء صندوق الخزينة" : "Cashbox Created",
          description: isAr
            ? `تمت إضافة الخزينة "${name}" بنجاح`
            : `Cashbox "${name}" added successfully`,
        });
        onOpenChange(false);
        setName("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إنشاء الخزينة" : "Failed to create cashbox"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <CreditCard className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة صندوق خزينة جديد" : "Create New Cashbox"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تعريف خزينة نقدية جديدة وربطها بحساب أستاذ الأصول (1110 - الصندوق)."
                : "Register a physical/virtual cashbox and link to GL asset account."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "اسم صندوق الخزينة *" : "Cashbox Name *"}
              </Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isAr ? "مثال: خزينة الاستقبال الرئيسية" : "e.g. Main Reception Cashbox"}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "حساب الأستاذ العام (أصول / نقدية) *" : "GL Account (Asset / Cash) *"}
              </Label>
              <Select
                value={glAccountId}
                onValueChange={(val) => setGlAccountId(val ?? "")}
                items={assetAccounts.map((a) => ({ value: a.id, label: a.label }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                </SelectTrigger>
                <SelectContent>
                  {assetAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              disabled={isPending || !name.trim() || !glAccountId}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ الصندوق" : "Save Cashbox"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. OPEN CASHIER SESSION DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function OpenSessionDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  cashboxId,
  cashboxName,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  cashboxId: string;
  cashboxName: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [openingBalance, setOpeningBalance] = useState("0");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("cashboxId", cashboxId);
      formData.set("openingBalance", openingBalance || "0");

      const res = await openCashierSessionAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم فتح وردية الخزينة بنجاح" : "Cashier Shift Opened",
          description: isAr
            ? `تم فتح جلسة العمل على "${cashboxName}" برصيد افتتاحي ${Number(openingBalance).toLocaleString()} ${currencyLabel}`
            : `Opened shift on "${cashboxName}" with ${Number(openingBalance).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل فتح الوردية" : "Failed to open session"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Unlock className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "فتح وردية خزينة جديدة" : "Open Cashier Shift"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `بدء جلسة عمل جديدة لأمين الخزينة على "${cashboxName}".`
                : `Start a new cashier shift on "${cashboxName}".`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "الرصيد الافتتاحي (عهدة البداية / الفكة) *" : "Opening Cash Balance (Float) *"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={openingBalance}
                  onChange={(e) => {
                    const val = e.target.value.replace(/^0+(?=\d)/, "");
                    setOpeningBalance(val === "" ? "0" : val);
                  }}
                  onFocus={(e) => {
                    if (e.target.value === "0") setOpeningBalance("");
                  }}
                  placeholder="0.00"
                  className="font-mono text-base ps-3 pe-14 text-start h-10"
                  dir="ltr"
                />
                <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                  {currencyLabel}
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                {isAr ? "المبلغ النقدي الفعلي الموجود في الدرج قبل بدء أي تحصيلات." : "Actual cash present in drawer before transactions."}
              </p>
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />}
              <span>{isAr ? "تأكيد وفتح الوردية" : "Confirm & Open Shift"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3. CLOSE CASHIER SESSION DIALOG (Z-REPORT & RECONCILIATION)
   ────────────────────────────────────────────────────────────────────────── */
export function CloseSessionDialog({
  open,
  onOpenChange,
  sessionId,
  cashboxName,
  openingBalance,
  totalReceipts,
  totalPayments,
  currency = "EGP",
  organizationName,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  cashboxName: string;
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  currency?: string;
  organizationName?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const expectedClosing = openingBalance + totalReceipts - totalPayments;
  const [actualClosing, setActualClosing] = useState(expectedClosing.toString());

  const variance = Number(actualClosing || 0) - expectedClosing;
  const isBalanced = Math.abs(variance) < 0.01;
  const isSurplus = variance > 0.01;
  const isShortage = variance < -0.01;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("sessionId", sessionId);
      formData.set("actualClosingBalance", actualClosing || "0");

      const res = await closeCashierSessionAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إقفال وردية الخزينة والتسوية" : "Cashier Shift Closed",
          description: isAr
            ? `تم إقفال الوردية وتسجيل الجرد الفعلي ${Number(actualClosing).toLocaleString()} ${currencyLabel}`
            : `Shift closed with count of ${Number(actualClosing).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إقفال الوردية" : "Failed to close session"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
            <Lock className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إقفال وردية الخزينة ومطابقة الجرد" : "Close Cashier Shift & Z-Report"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `تسوية وحساب الفارق الدفتري وإقفال جلسة "${cashboxName}".`
                : `Reconcile drawer count, calculate variance, and close shift.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Reconciliation Breakdown Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">{isAr ? "الرصيد الافتتاحي للوردية:" : "Opening Balance:"}</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-emerald-600">
                <span>{isAr ? "إجمالي المقبوضات النقدية (+):" : "Cash Receipts (+):"}</span>
                <span className="font-mono font-bold">
                  + {totalReceipts.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-rose-600">
                <span>{isAr ? "إجمالي المصروفات النقدية (-):" : "Cash Payments (-):"}</span>
                <span className="font-mono font-bold">
                  - {totalPayments.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm font-black border-t border-slate-200 dark:border-slate-800 pt-2 text-slate-900 dark:text-white">
                <span>{isAr ? "الرصيد الدفتري المتوقع بالدرج:" : "Expected Closing Balance:"}</span>
                <span className="font-mono text-base text-blue-700 dark:text-blue-400">
                  {expectedClosing.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                </span>
              </div>
            </div>

            {/* Actual Count Input */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "الرصيد النقدي الفعلي المعدود بالدرج *" : "Actual Cash Count in Drawer *"}
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={actualClosing}
                  onChange={(e) => setActualClosing(e.target.value)}
                  className="font-mono text-lg font-bold ps-3 pe-14 text-start h-11"
                  dir="ltr"
                />
                <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                  {currencyLabel}
                </div>
              </div>
            </div>

            {/* Variance Status Banner */}
            <div
              className={`rounded-xl p-3 text-xs font-bold flex items-center justify-between border ${
                isBalanced
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                  : isSurplus
                  ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                  : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
              }`}
            >
              <span>
                {isBalanced
                  ? isAr ? "✓ مطابقة تامة (لا يوجد عجز أو زيادة)" : "✓ Perfectly Balanced"
                  : isSurplus
                  ? isAr ? "فائض نقدي بالخزينة:" : "Cash Surplus:"
                  : isAr ? "عجز نقدي بالخزينة:" : "Cash Shortage:"}
              </span>
              <span className="font-mono text-sm">
                {variance > 0 ? "+" : ""}{variance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
              </span>
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
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
              <span>{isAr ? "تأكيد الإقفال وترحيل التسوية" : "Close Shift & Post"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   4. COLLECT DUE / POS CASH COLLECTION DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CollectDueDialog({
  open,
  onOpenChange,
  organizationId,
  organizationName = "AqarBooks",
  resortId,
  sessionId,
  cashboxName,
  cashAccountId,
  dues,
  fiscalPeriodId,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName?: string;
  resortId: string;
  sessionId: string;
  cashboxName: string;
  cashAccountId: string;
  dues: DueItem[];
  fiscalPeriodId?: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedDueId, setSelectedDueId] = useState<string>(dues[0]?.id ?? "");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const selectedDue = useMemo(
    () => dues.find((d) => d.id === selectedDueId) || null,
    [dues, selectedDueId]
  );

  const [amount, setAmount] = useState<string>(
    selectedDue ? selectedDue.remaining_amount.toString() : "0"
  );

  // Update amount when due selection changes
  const handleDueChange = (id: string | null) => {
    if (!id) return;
    setSelectedDueId(id);
    const due = dues.find((d) => d.id === id);
    if (due) {
      setAmount(due.remaining_amount.toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedDueId) {
      setErrorMsg(isAr ? "يرجى اختيار المستحق المراد تحصيله" : "Please select due item");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setErrorMsg(isAr ? "يرجى إدخال مبلغ صحيح للتحصيل" : "Please enter valid payment amount");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("sessionId", sessionId);
      formData.set("depositAccountId", cashAccountId);
      formData.set("dueId", selectedDueId);
      formData.set("unitId", selectedDue?.unit_id || "");
      formData.set("amount", amount);
      formData.set("paymentDate", paymentDate);
      if (fiscalPeriodId) formData.set("fiscalPeriodId", fiscalPeriodId);

      const res = await payDueFromCashierAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تحصيل المبلغ وإصدار سند القبض" : "Payment Collected",
          description: isAr
            ? `تم تحصيل مبلغ ${Number(amount).toLocaleString()} ${currencyLabel} للوحدة ${selectedDue?.unit_code}`
            : `Collected ${Number(amount).toLocaleString()} ${currencyLabel} for unit ${selectedDue?.unit_code}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تسجيل التحصيل" : "Failed to record payment"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Receipt className="size-5" />
            </div>
            <div>
              <DialogTitle>{isAr ? "تحصيل نقدي بالخزينة (سند قبض)" : "POS Cash Receipt"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? `تحصيل مستحقات الوحدة نقداً عبر "${cashboxName}" وإصدار إيصال قبض فوري.`
                  : `Collect unit dues in cash via "${cashboxName}" and issue receipt.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogBody className="p-5 space-y-4 overflow-y-auto flex-1">
            {errorMsg && (
              <div
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Select Due */}
            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="size-3.5 text-blue-600" />
                <span>{isAr ? "اختر المستحق / الوحدة المطلوب تحصيلها *" : "Select Due / Unit *"}</span>
              </Label>
              <Select
                value={selectedDueId}
                onValueChange={handleDueChange}
                items={dues.map((d) => ({
                  value: d.id,
                  label: `${d.unit_code} — ${d.title} (${isAr ? "متبقي: " : "Remaining: "}${d.remaining_amount.toLocaleString()} ${currencyLabel})`,
                }))}
              >
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder={isAr ? "اختر المستحق..." : "Select due item..."} />
                </SelectTrigger>
                <SelectContent>
                  {dues.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">{d.unit_code}</span>
                      <span className="text-slate-500 ms-1">— {d.title}</span>
                      <span className="font-mono font-bold text-emerald-600 ms-2">
                        ({isAr ? "متبقي: " : "Remaining: "}{d.remaining_amount.toLocaleString()} {currencyLabel})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المبلغ المحصل نقداً *" : "Cash Amount Received *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono text-lg font-bold ps-3 pe-14 text-start h-10"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ التحصيل *" : "Payment Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="font-mono text-sm h-10"
                />
              </div>
            </div>

            {/* Live Due Summary Card */}
            {selectedDue && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 space-y-2 dark:border-blue-900/50 dark:bg-blue-950/40 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{isAr ? "الوحدة:" : "Unit:"}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedDue.unit_code}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{isAr ? "إجمالي قيمة المستحق الأصلي:" : "Original Due Amount:"}</span>
                  <span className="font-mono">{selectedDue.original_amount.toLocaleString()} {currencyLabel}</span>
                </div>
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-600 dark:text-slate-400">{isAr ? "المتبقي قبل السداد:" : "Remaining Balance:"}</span>
                  <span className="font-mono text-rose-600">{selectedDue.remaining_amount.toLocaleString()} {currencyLabel}</span>
                </div>
                <div className="flex items-center justify-between font-black border-t border-blue-200 dark:border-blue-900/60 pt-2 text-sm">
                  <span className="text-blue-950 dark:text-blue-200">{isAr ? "المتبقي بعد هذا التحصيل:" : "Remaining After Payment:"}</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {Math.max(0, selectedDue.remaining_amount - Number(amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                    {currencyLabel}
                  </span>
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 flex items-center justify-between w-full">
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
              disabled={isPending || !amount || Number(amount) <= 0 || !selectedDueId}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span>{isAr ? "تأكيد التحصيل وإصدار السند" : "Collect & Issue Receipt"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
