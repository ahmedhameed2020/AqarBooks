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
  Building2,
  Plus,
  CreditCard,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Landmark,
  FileCheck,
  User,
  Check,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import {
  createBankAction,
  createBankAccountAction,
  recordIncomingChequeAction,
  setChequeStatusAction,
  clearIncomingChequeAction,
} from "@/lib/actions/treasury";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };

/* ──────────────────────────────────────────────────────────────────────────
   1. CREATE BANK DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateBankDialog({
  open,
  onOpenChange,
  organizationId,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorMsg(isAr ? "يرجى كتابة اسم البنك بالعربية والإنجليزية" : "Please fill in bank name in both languages");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("nameAr", nameAr.trim());
      formData.set("nameEn", nameEn.trim());

      const res = await createBankAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تمت إضافة البنك بنجاح" : "Bank Added Successfully",
          description: isAr ? `تم تسجيل ${nameAr} في قائمة البنوك` : `Added ${nameEn} to banks directory`,
        });
        onOpenChange(false);
        setNameAr("");
        setNameEn("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إضافة البنك" : "Failed to add bank"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Landmark className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة بنك جديد" : "Add New Bank"}</DialogTitle>
            <DialogDescription>
              {isAr ? "تسجيل بنك تجاري جديد في دليل البنوك المعتمدة." : "Register a new commercial bank in directory."}
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
                {isAr ? "اسم البنك (بالعربية) *" : "Bank Name (Arabic) *"}
              </Label>
              <Input
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={isAr ? "مثال: البنك الأهلي المصري" : "e.g. National Bank of Egypt"}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "اسم البنك (بالإنجليزية) *" : "Bank Name (English) *"}
              </Label>
              <Input
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. National Bank of Egypt"
                className="text-sm font-mono"
                dir="ltr"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !nameAr.trim() || !nameEn.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ البنك" : "Save Bank"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. CREATE BANK ACCOUNT DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateBankAccountDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  banks,
  assetAccounts,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  banks: Option[];
  assetAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? "");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [glAccountId, setGlAccountId] = useState<string>(assetAccounts[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!bankId || !accountName.trim() || !accountNumber.trim() || !glAccountId) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول الإلزامية" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("bankId", bankId);
      formData.set("accountName", accountName.trim());
      formData.set("accountNumber", accountNumber.trim());
      formData.set("glAccountId", glAccountId);

      const res = await createBankAccountAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء الحساب البنكي بنجاح" : "Bank Account Created",
          description: isAr ? `تمت إضافة الحساب "${accountName}" بنجاح` : `Added "${accountName}" successfully`,
        });
        onOpenChange(false);
        setAccountName("");
        setAccountNumber("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إنشاء الحساب البنكي" : "Failed to create bank account"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Building2 className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة حساب بنكي للمنشأة" : "Add Organization Bank Account"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "ربط حساب بنكي رسمي بدليل شجرة الحسابات (1120 - البنوك) للتسويات والمطابقات."
                : "Link bank account to General Ledger (1120 - Banks) for reconciliations."}
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
                {isAr ? "البنك التابع له الحساب *" : "Bank *"}
              </Label>
              <Select value={bankId} onValueChange={(val) => setBankId(val ?? "")} items={banks.map((b) => ({ value: b.id, label: b.label }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isAr ? "اختر البنك..." : "Select bank..."} />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مسمى الحساب البنكي *" : "Account Description/Name *"}
                </Label>
                <Input
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder={isAr ? "مثال: جاري العمليات - جنيه مصري" : "e.g. Operations Current - EGP"}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رقم الحساب / الآيبان (IBAN) *" : "Account Number / IBAN *"}
                </Label>
                <Input
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="EG00000000000000000000000"
                  className="text-sm font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "حساب الأستاذ العام المربوط (أصول / بنوك) *" : "Linked GL Asset Account *"}
              </Label>
              <Select value={glAccountId} onValueChange={(val) => setGlAccountId(val ?? "")} items={assetAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isAr ? "اختر حساب الأستاذ..." : "Select GL account..."} />
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !accountName.trim() || !accountNumber.trim() || !bankId} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ الحساب البنكي" : "Save Bank Account"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   3. RECORD INCOMING CHEQUE DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function RecordChequeDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  bankAccounts,
  members,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  bankAccounts: Option[];
  members: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [bankAccountId, setBankAccountId] = useState<string>(bankAccounts[0]?.id ?? "");
  const [memberId, setMemberId] = useState<string>(members[0]?.id ?? "");
  const [chequeNumber, setChequeNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!chequeNumber.trim() || !amount || Number(amount) <= 0 || !bankAccountId || !memberId) {
      setErrorMsg(isAr ? "يرجى إكمال جميع بيانات الشيك" : "Please fill in all cheque details");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("bankAccountId", bankAccountId);
      formData.set("memberId", memberId);
      formData.set("chequeNumber", chequeNumber.trim());
      formData.set("amount", amount);
      formData.set("chequeDate", chequeDate);
      formData.set("dueDate", dueDate);

      const res = await recordIncomingChequeAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل الشيك الوارد بنجاح" : "Cheque Recorded Successfully",
          description: isAr
            ? `تم تسجيل الشيك رقم ${chequeNumber} بمبلغ ${Number(amount).toLocaleString()} ${currencyLabel}`
            : `Recorded cheque #${chequeNumber} for ${Number(amount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setChequeNumber("");
        setAmount("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تسجيل الشيك" : "Failed to record cheque"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <FileCheck className="size-5" />
            </div>
            <div>
              <DialogTitle>{isAr ? "تسجيل استلام شيك وارد (أوراق قبض)" : "Record Incoming Cheque"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "إثبات استلام شيك من العميل وإدراجه بحافظة الشيكات تحت التحصيل."
                  : "Record received cheque in treasury portfolio under collection."}
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
                  {isAr ? "العميل / الساحب *" : "Client / Drawer *"}
                </Label>
                <Select value={memberId} onValueChange={(val) => setMemberId(val ?? "")} items={members.map((m) => ({ value: m.id, label: m.label }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر العميل..." : "Select client..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الحساب البنكي المودع به *" : "Deposit Bank Account *"}
                </Label>
                <Select value={bankAccountId} onValueChange={(val) => setBankAccountId(val ?? "")} items={bankAccounts.map((b) => ({ value: b.id, label: b.label }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select bank account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "رقم الشيك *" : "Cheque Number *"}
                </Label>
                <Input
                  required
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  placeholder="00012345"
                  className="font-mono text-sm font-bold"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مبلغ الشيك *" : "Cheque Amount *"}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="font-mono text-base font-bold ps-3 pe-14 text-start"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-slate-400">
                    {currencyLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ تحرير الشيك *" : "Cheque Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={chequeDate}
                  onChange={(e) => setChequeDate(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="size-3 text-rose-500" />
                  <span>{isAr ? "تاريخ الاستحقاق والصرف *" : "Maturity / Due Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="font-mono text-sm font-bold text-rose-600"
                />
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shrink-0 flex items-center justify-between w-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !chequeNumber.trim() || !amount || Number(amount) <= 0} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <FileCheck className="size-3.5" />}
              <span>{isAr ? "حفظ وإدراج الشيك" : "Save & Register Cheque"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   4. CLEAR CHEQUE DIALOG (DEPOSIT & ALLOCATE TO DUE)
   ────────────────────────────────────────────────────────────────────────── */
export function ClearChequeDialog({
  open,
  onOpenChange,
  chequeId,
  chequeNumber,
  amount,
  fiscalPeriodId,
  dues,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chequeId: string;
  chequeNumber: string;
  amount: number;
  fiscalPeriodId?: string;
  dues: Option[];
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [dueId, setDueId] = useState<string>(dues[0]?.id ?? "");
  const [clearingDate, setClearingDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!dueId) {
      setErrorMsg(isAr ? "يرجى تحديد المستحق لإسقاط الشيك عليه" : "Please select due item to clear against");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("chequeId", chequeId);
      formData.set("dueId", dueId);
      formData.set("amount", amount.toString());
      formData.set("clearingDate", clearingDate);
      if (fiscalPeriodId) formData.set("fiscalPeriodId", fiscalPeriodId);

      const res = await clearIncomingChequeAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تحصيل الشيك وإقفال المستحق" : "Cheque Cleared Successfully",
          description: isAr
            ? `تم تحصيل الشيك رقم ${chequeNumber} بمبلغ ${amount.toLocaleString()} ${currencyLabel} وإضافته لرصيد البنك وترحيل القيد.`
            : `Cleared cheque #${chequeNumber} for ${amount.toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تحصيل الشيك" : "Failed to clear cheque"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تحصيل شيك وارد وإقفاله" : "Clear Incoming Cheque"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `إثبات تحصيل الشيك رقم "${chequeNumber}" وإسقاط قيمته على مستحقات الوحدة.`
                : `Clear cheque #${chequeNumber} and allocate payment to unit due.`}
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

            {/* Cheque Summary Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5 dark:border-slate-800 dark:bg-slate-900/60 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{isAr ? "رقم الشيك:" : "Cheque #:"}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{chequeNumber}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-sm">
                <span className="text-slate-700 dark:text-slate-300">{isAr ? "مبلغ الشيك المحصل:" : "Amount to Clear:"}</span>
                <span className="font-mono text-emerald-600">{amount.toLocaleString()} {currencyLabel}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "المستحق المراد سداده بالشيك *" : "Allocate to Due Item *"}
              </Label>
              <Select value={dueId} onValueChange={(val) => setDueId(val ?? "")} items={dues.map((d) => ({ value: d.id, label: d.label }))}>
                <SelectTrigger className="w-full text-xs h-10">
                  <SelectValue placeholder={isAr ? "اختر المستحق..." : "Select due..."} />
                </SelectTrigger>
                <SelectContent>
                  {dues.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Calendar className="size-3 text-slate-400" />
                <span>{isAr ? "تاريخ التحصيل الفعلي بالبنك *" : "Bank Clearing Date *"}</span>
              </Label>
              <Input
                type="date"
                required
                value={clearingDate}
                onChange={(e) => setClearingDate(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !dueId} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span>{isAr ? "تأكيد التحصيل والترحيل" : "Confirm Clearance"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   5. UPDATE CHEQUE STATUS DIALOG (DEPOSIT / RETURN / CANCEL)
   ────────────────────────────────────────────────────────────────────────── */
export function UpdateChequeStatusDialog({
  open,
  onOpenChange,
  chequeId,
  chequeNumber,
  targetStatus,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chequeId: string;
  chequeNumber: string;
  targetStatus: "DEPOSITED" | "RETURNED" | "CANCELLED";
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const actionTitle =
    targetStatus === "DEPOSITED"
      ? isAr ? "إيداع الشيك بالبنك للتحصيل" : "Deposit Cheque to Bank"
      : targetStatus === "RETURNED"
      ? isAr ? "إثبات ارتداد / رفض الشيك" : "Mark Cheque as Returned"
      : isAr ? "إلغاء الشيك" : "Cancel Cheque";

  const actionColor =
    targetStatus === "DEPOSITED"
      ? "bg-blue-600 hover:bg-blue-700"
      : targetStatus === "RETURNED"
      ? "bg-rose-600 hover:bg-rose-700"
      : "bg-slate-700 hover:bg-slate-800";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("chequeId", chequeId);
      formData.set("status", targetStatus);

      const res = await setChequeStatusAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تحديث حالة الشيك" : "Status Updated",
          description: isAr ? `تم تعديل حالة الشيك #${chequeNumber} بنجاح` : `Cheque #${chequeNumber} updated successfully`,
        });
        onOpenChange(false);
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل تحديث الحالة" : "Failed to update status"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <ArrowUpRight className="size-5" />
          </div>
          <div>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {isAr
                ? `تعديل حالة الشيك رقم "${chequeNumber}" إلى ${targetStatus}.`
                : `Update status of cheque #${chequeNumber} to ${targetStatus}.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {targetStatus === "DEPOSITED"
                ? isAr ? "سيتم نقل الشيك إلى حالة (أودع بالبنك برسم التحصيل) بانتظار إشعار الإضافة." : "Cheque will be marked as deposited in bank awaiting clearance."
                : targetStatus === "RETURNED"
                ? isAr ? "سيتم تسجيل الشيك كشيك مرتد ومرفوض وإبلاغ إدارة التحصيل." : "Cheque will be marked as returned/bounced."
                : isAr ? "سيتم إلغاء الشيك نهائياً من الحافظة." : "Cheque will be cancelled."}
            </p>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "تراجع" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending} className={`${actionColor} text-white font-bold gap-1.5`}>
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span>{isAr ? "تأكيد التحديث" : "Confirm Update"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
