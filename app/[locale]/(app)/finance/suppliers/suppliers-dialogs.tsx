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
  Truck,
  Plus,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  FileText,
  CreditCard,
  Percent,
  Receipt,
} from "lucide-react";
import {
  createSupplierAction,
  postSupplierInvoiceAction,
  recordSupplierPaymentAction,
  createPurchaseOrderAction,
} from "@/lib/actions/purchasing";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };
export type InvoiceOption = Option & { remaining: number; supplierId: string };

/* ──────────────────────────────────────────────────────────────────────────
   1. CREATE SUPPLIER DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateSupplierDialog({
  open,
  onOpenChange,
  organizationId,
  payableAccounts,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  payableAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [payableAccountId, setPayableAccountId] = useState<string>(payableAccounts[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(isAr ? "يرجى إدخال اسم المورد" : "Please enter supplier name");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("name", name.trim());
      if (contactEmail.trim()) formData.set("contactEmail", contactEmail.trim());
      if (contactPhone.trim()) formData.set("contactPhone", contactPhone.trim());
      if (payableAccountId) formData.set("payableAccountId", payableAccountId);

      const res = await createSupplierAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل المورد بنجاح" : "Supplier Registered",
          description: isAr ? `تمت إضافة "${name}" إلى دليل الموردين` : `Added "${name}" to suppliers`,
        });
        onOpenChange(false);
        setName("");
        setContactEmail("");
        setContactPhone("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تسجيل المورد" : "Failed to register supplier"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Truck className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة مورد جديد" : "Register New Supplier"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تعريف مورد جديد بحساب الدائنين بالدليل المحاسبي لربط الفواتير والدفعات."
                : "Register a new vendor/supplier and map to payables GL account."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "اسم المورد أو الشركة *" : "Supplier / Company Name *"}
              </Label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isAr ? "مثال: شركة النيل للمقاولات والتوريدات" : "e.g. Nile Construction Supplies"}
                className="text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "البريد الإلكتروني" : "Email"}
                </Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="vendor@company.com"
                  className="text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رقم الهاتف" : "Phone"}
                </Label>
                <Input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="010..."
                  className="text-xs font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            {payableAccounts.length > 0 && (
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب الدائنين والموردين (الالتزامات)" : "Payable Account"}
                </Label>
                <Select value={payableAccountId} onValueChange={(val) => setPayableAccountId(val ?? "")} items={payableAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {payableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ المورد" : "Save Supplier"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. POST SUPPLIER INVOICE DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function PostInvoiceDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  suppliers,
  expenseAccounts,
  liabilityAccounts,
  periods,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  suppliers: Option[];
  expenseAccounts: Option[];
  liabilityAccounts: Option[];
  periods: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState<string>(expenseAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [netAmount, setNetAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [vatRate, setVatRate] = useState("0");
  const [vatAccountId, setVatAccountId] = useState<string>(liabilityAccounts[0]?.id ?? "");
  const [whtRate, setWhtRate] = useState("0");
  const [whtAccountId, setWhtAccountId] = useState<string>(liabilityAccounts[0]?.id ?? "");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);

  // Live Totals
  const net = Number(netAmount) || 0;
  const discount = Number(discountAmount) || 0;
  const taxableBase = Math.max(0, net - discount);
  const vRate = Number(vatRate) || 0;
  const vat = (taxableBase * vRate) / 100;
  const wRate = Number(whtRate) || 0;
  const wht = (taxableBase * wRate) / 100;
  const finalPayable = taxableBase + vat - wht;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supplierId || !invoiceNumber.trim() || !expenseAccountId || !fiscalPeriodId || !netAmount || net <= 0) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول الإلزامية" : "Please fill in all required fields");
      return;
    }

    if (vRate > 0 && !vatAccountId) {
      setErrorMsg(isAr ? "يرجى اختيار حساب ضريبة القيمة المضافة" : "Please select VAT account");
      return;
    }

    if (wRate > 0 && !whtAccountId) {
      setErrorMsg(isAr ? "يرجى اختيار حساب الخصم والإضافة" : "Please select WHT account");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("supplierId", supplierId);
      formData.set("invoiceNumber", invoiceNumber.trim());
      formData.set("expenseAccountId", expenseAccountId);
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("netAmount", netAmount);
      formData.set("discountAmount", discountAmount || "0");
      formData.set("vatRate", vatRate || "0");
      if (vRate > 0) formData.set("vatAccountId", vatAccountId);
      formData.set("whtRate", whtRate || "0");
      if (wRate > 0) formData.set("whtAccountId", whtAccountId);
      formData.set("invoiceDate", invoiceDate);
      formData.set("dueDate", dueDate);

      const res = await postSupplierInvoiceAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم ترحيل فاتورة المورد بنجاح" : "Supplier Invoice Posted",
          description: isAr
            ? `تم تسجيل فاتورة ${invoiceNumber} بمبلغ ${finalPayable.toLocaleString()} ${currencyLabel} وتوليد القيد`
            : `Posted invoice ${invoiceNumber} for ${finalPayable.toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setInvoiceNumber("");
        setNetAmount("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل ترحيل الفاتورة" : "Failed to post invoice"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <FileText className="size-5" />
            </div>
            <div>
              <DialogTitle>{isAr ? "ترحيل فاتورة مورد (Supplier Invoice)" : "Post Supplier Invoice"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "تسجيل فاتورة شراء/خدمة من مورد وترحيل قيد الاستحقاق مع حسابات الضريبة."
                  : "Record vendor invoice and post expense/liability journal entries."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <DialogBody className="p-5 space-y-4 overflow-y-auto flex-1">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المورد *" : "Supplier *"}
                </Label>
                <Select value={supplierId} onValueChange={(val) => setSupplierId(val ?? "")} items={suppliers.map((s) => ({ value: s.id, label: s.label }))}>
                  <SelectTrigger className="w-full text-xs font-bold">
                    <SelectValue placeholder={isAr ? "اختر المورد..." : "Select supplier..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رقم الفاتورة الدفتري *" : "Invoice Number *"}
                </Label>
                <Input
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-089"
                  className="text-xs font-mono font-bold"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب المصروف المرتبط *" : "Expense GL Account *"}
                </Label>
                <Select value={expenseAccountId} onValueChange={(val) => setExpenseAccountId(val ?? "")} items={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر حساب المصروف..." : "Select expense account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الفترة المالية *" : "Fiscal Period *"}
                </Label>
                <Select value={fiscalPeriodId} onValueChange={(val) => setFiscalPeriodId(val ?? "")} items={periods.map((p) => ({ value: p.id, label: p.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المبلغ الصافي (قبل الضريبة) *" : "Net Amount *"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-sm font-bold"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مبلغ الخصم المكتسب" : "Discount Amount"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0.00"
                  className="font-mono text-sm"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Taxes Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Percent className="size-3 text-slate-400" />
                  <span>{isAr ? "نسبة ضريبة القيمة المضافة %" : "VAT Rate %"}</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Percent className="size-3 text-slate-400" />
                  <span>{isAr ? "نسبة الخصم والإضافة WHT %" : "WHT Rate %"}</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={whtRate}
                  onChange={(e) => setWhtRate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ الفاتورة *" : "Invoice Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-rose-500" />
                  <span>{isAr ? "تاريخ الاستحقاق *" : "Due Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="font-mono text-xs font-bold text-rose-600"
                />
              </div>
            </div>

            {/* Total Summary Footer Box */}
            <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-800 dark:bg-slate-900/90 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "إجمالي المبلغ المستحق النهائي للدائنين:" : "Final Payable Total:"}
              </span>
              <span className="font-mono font-black text-sm text-purple-700 dark:text-purple-400">
                {finalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                <span className="text-xs font-normal text-slate-400">{currencyLabel}</span>
              </span>
            </div>
          </DialogBody>

          <DialogFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 flex items-center justify-between w-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !supplierId || !invoiceNumber.trim() || net <= 0} className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "ترحيل الفاتورة بالدفاتر" : "Post Invoice"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3. RECORD SUPPLIER PAYMENT DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function RecordSupplierPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  suppliers,
  invoices,
  paymentAccounts,
  periods,
  currency = "EGP",
  locale,
  preselectedInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  suppliers: Option[];
  invoices: InvoiceOption[];
  paymentAccounts: Option[];
  periods: Option[];
  currency?: string;
  locale: string;
  preselectedInvoiceId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(preselectedInvoiceId ?? invoices[0]?.id ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState<string>(paymentAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [amount, setAmount] = useState<string>(invoices[0]?.remaining ? invoices[0].remaining.toString() : "");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const target = invoices.find((i) => i.id === invId);
    if (target) {
      setAmount(target.remaining.toString());
      if (target.supplierId) {
        setSupplierId(target.supplierId);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supplierId || !paymentAccountId || !fiscalPeriodId || !amount || Number(amount) <= 0) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("supplierId", supplierId);
      formData.set("paymentAccountId", paymentAccountId);
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("method", method);
      formData.set("amount", amount);
      formData.set("paymentDate", paymentDate);
      if (reference.trim()) formData.set("reference", reference.trim());

      // If an invoice is selected, allocate to it
      if (selectedInvoiceId) {
        const allocations = [{ invoice_id: selectedInvoiceId, amount: Number(amount) }];
        formData.set("allocations", JSON.stringify(allocations));
      } else {
        formData.set("allocations", JSON.stringify([]));
      }

      const res = await recordSupplierPaymentAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل سداد المورد بنجاح" : "Supplier Payment Recorded",
          description: isAr
            ? `تم تسجيل سداد بمبلغ ${Number(amount).toLocaleString()} ${currencyLabel} وتوليد القيد`
            : `Recorded payment of ${Number(amount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تسجيل سداد المورد" : "Failed to record payment"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <CreditCard className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تسجيل سند صرف وسداد لمورد" : "Record Supplier Payment Voucher"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إثبات سداد مستحقات وفواتير الموردين من حساب البنك أو الصندوق."
                : "Record payment to vendor and settle open supplier invoice balances."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المورد المسدد له *" : "Supplier *"}
                </Label>
                <Select value={supplierId} onValueChange={(val) => setSupplierId(val ?? "")} items={suppliers.map((s) => ({ value: s.id, label: s.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر المورد..." : "Select supplier..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs font-bold">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "طريقة الصرف والسداد *" : "Payment Method *"}
                </Label>
                <Select value={method} onValueChange={(val) => setMethod(val ?? "BANK_TRANSFER")} items={[{ value: "BANK_TRANSFER", label: isAr ? "تحويل بنكي (Transfer)" : "Bank Transfer" }, { value: "CHEQUE", label: isAr ? "شيك بنكي (Cheque)" : "Cheque" }, { value: "CASH", label: isAr ? "نقدي من الصندوق (Cash)" : "Cash" }]}>
                  <SelectTrigger className="w-full text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">{isAr ? "تحويل بنكي" : "Bank Transfer"}</SelectItem>
                    <SelectItem value="CHEQUE">{isAr ? "شيك بنكي" : "Cheque"}</SelectItem>
                    <SelectItem value="CASH">{isAr ? "نقدي من الصندوق" : "Cash"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Invoices dropdown */}
            {invoices.length > 0 && (
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الفاتورة المراد سدادها وتخصيص الدفعة لها" : "Target Supplier Invoice"}
                </Label>
                <Select value={selectedInvoiceId} onValueChange={(val) => handleInvoiceChange(val ?? "")} items={[{ value: "", label: isAr ? "— دفعة عامة تحت الحساب —" : "— Unallocated Deposit —" }, ...invoices.map((i) => ({ value: i.id, label: `${i.label} (متبقي: ${i.remaining.toLocaleString()} ${currencyLabel})` })) ]}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الفاتورة..." : "Select invoice..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isAr ? "— دفعة عامة تحت الحساب —" : "— Unallocated Deposit —"}</SelectItem>
                    {invoices.map((i) => (
                      <SelectItem key={i.id} value={i.id} className="text-xs">
                        {i.label} — ({isAr ? "متبقي:" : "Rem:"} {i.remaining.toLocaleString()} {currencyLabel})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب الصرف (البنك / الصندوق) *" : "Payment Account *"}
                </Label>
                <Select value={paymentAccountId} onValueChange={(val) => setPaymentAccountId(val ?? "")} items={paymentAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الفترة المالية *" : "Fiscal Period *"}
                </Label>
                <Select value={fiscalPeriodId} onValueChange={(val) => setFiscalPeriodId(val ?? "")} items={periods.map((p) => ({ value: p.id, label: p.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "المبلغ المسدد *" : "Amount Paid *"}
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
                    className="font-mono text-sm font-bold ps-3 pe-12 text-start"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-2.5 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ السداد *" : "Payment Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المرجع / رقم التحويل أو الشيك" : "Reference / Cheque #"}
              </Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={isAr ? "مثال: تحويل بنكي رقم TR-109283" : "e.g. Wire Transfer #"}
                className="text-xs font-mono"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !supplierId || !paymentAccountId || !amount || Number(amount) <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAr ? "تسجيل سند الصرف" : "Record Payment"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
