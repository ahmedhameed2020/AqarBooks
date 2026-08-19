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
  FileText,
  Plus,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { issueDueAction, createDueTypeAction } from "@/lib/actions/receivables";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";

export type Option = { id: string; label: string };

/* ──────────────────────────────────────────────────────────────────────────
   1. CREATE DUE TYPE DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function CreateDueTypeDialog({
  open,
  onOpenChange,
  organizationId,
  revenueAccounts,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  revenueAccounts: { id: string; code: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState<string>(revenueAccounts[0]?.id ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!nameAr.trim() || !nameEn.trim() || !revenueAccountId) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول الإلزامية" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("nameAr", nameAr.trim());
      formData.set("nameEn", nameEn.trim());
      formData.set("defaultRevenueAccountId", revenueAccountId);

      const res = await createDueTypeAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إنشاء نوع المستحق بنجاح" : "Due Type Created",
          description: isAr ? `تمت إضافة "${nameAr}" إلى أنواع المطالبات` : `Added "${nameEn}" to due types`,
        });
        onOpenChange(false);
        setNameAr("");
        setNameEn("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إنشاء نوع المستحق" : "Failed to create due type"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Tag className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إضافة نوع مستحق / مطالبة جديدة" : "New Due Type / Demand Category"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "تعريف نوع مطالبة (مثل: صيانة سنوية، استهلاك مياه، اشتراك نادي) وربطه بحساب الإيراد."
                : "Define due category and map it to general ledger revenue account."}
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
                {isAr ? "مسمى المستحق (بالعربية) *" : "Due Type Name (Arabic) *"}
              </Label>
              <Input
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={isAr ? "مثال: مصاريف صيانة وخدمات دورية" : "e.g. Annual Maintenance Fees"}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "مسمى المستحق (بالإنجليزية) *" : "Due Type Name (English) *"}
              </Label>
              <Input
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Annual Maintenance Fees"
                className="text-sm font-mono"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "حساب الإيراد المحاسبي المربوط *" : "Linked Revenue GL Account *"}
              </Label>
              <Select value={revenueAccountId} onValueChange={(val) => setRevenueAccountId(val ?? "")} items={revenueAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue placeholder={isAr ? "اختر حساب الإيراد..." : "Select revenue account..."} />
                </SelectTrigger>
                <SelectContent>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.code} — {isAr ? a.name_ar : a.name_en}
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
            <Button type="submit" disabled={isPending || !nameAr.trim() || !nameEn.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "حفظ نوع المستحق" : "Save Due Type"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   2. ISSUE DUE DIALOG
   ────────────────────────────────────────────────────────────────────────── */
export function IssueDueDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  units,
  dueTypes,
  receivableAccounts,
  periods,
  currency = "EGP",
  locale,
  preselectedUnitId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  units: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  periods: Option[];
  currency?: string;
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [unitId, setUnitId] = useState<string>(preselectedUnitId ?? units[0]?.id ?? "");
  const [dueTypeId, setDueTypeId] = useState<string>(dueTypes[0]?.id ?? "");
  const [receivableAccountId, setReceivableAccountId] = useState<string>(receivableAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!unitId || !dueTypeId || !receivableAccountId || !fiscalPeriodId || !amount || Number(amount) <= 0) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("resortId", resortId);
      formData.set("unitId", unitId);
      formData.set("dueTypeId", dueTypeId);
      formData.set("receivableAccountId", receivableAccountId);
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("amount", amount);
      formData.set("issueDate", issueDate);
      formData.set("dueDate", dueDate);
      if (description.trim()) formData.set("description", description.trim());

      const res = await issueDueAction({ ok: true }, formData);

      if (res.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم إصدار المستحق بنجاح" : "Due Issued Successfully",
          description: isAr
            ? `تم إصدار مطالبة بمبلغ ${Number(amount).toLocaleString()} ${currencyLabel} وترحيلها لدفتر الأستاذ`
            : `Issued due for ${Number(amount).toLocaleString()} ${currencyLabel}`,
        });
        onOpenChange(false);
        setAmount("");
        setDescription("");
        router.refresh();
      } else {
        setErrorMsg(res.error || (isAr ? "فشل إصدار المستحق" : "Failed to issue due"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <FileText className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "إصدار مطالبة / مستحق مالي لوحدة" : "Issue Financial Due / Demand"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "قيد مستحق مالي على مالك/مستأجر الوحدة وترحيل قيد الاستحقاق المحاسبي."
                : "Create receivable due against unit and post accrual journal entry."}
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
                  {isAr ? "الوحدة المستحقة *" : "Unit *"}
                </Label>
                <Select value={unitId} onValueChange={(val) => setUnitId(val ?? "")} items={units.map((u) => ({ value: u.id, label: u.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الوحدة..." : "Select unit..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs font-mono font-bold">
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "نوع المستحق / البند *" : "Due Type *"}
                </Label>
                <Select value={dueTypeId} onValueChange={(val) => setDueTypeId(val ?? "")} items={dueTypes.map((d) => ({ value: d.id, label: d.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر النوع..." : "Select type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {dueTypes.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "حساب الذمم المدينة (أصول) *" : "Receivable Asset Account *"}
                </Label>
                <Select value={receivableAccountId} onValueChange={(val) => setReceivableAccountId(val ?? "")} items={receivableAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {receivableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "الفترة المالية المفتوحة *" : "Fiscal Period *"}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? "مبلغ المستحق *" : "Due Amount *"}
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
                  <span>{isAr ? "تاريخ الإصدار *" : "Issue Date *"}</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
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

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? "البيان / ملاحظات المطالبة" : "Description / Notes"}
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? "مثال: صيانة الربع الثاني عن شهر يونيو" : "e.g. Q2 maintenance fee"}
                className="text-xs"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !unitId || !dueTypeId || !amount || Number(amount) <= 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "إصدار المطالبة وترحيل القيد" : "Issue Due & Post"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
