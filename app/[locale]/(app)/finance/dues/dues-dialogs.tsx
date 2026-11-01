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
import { issueDueAction, createDueTypeAction, saveDefaultReceivableAccountAction } from "@/lib/actions/receivables";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";
import { financeErrorMessage } from "@/lib/actions/error-messages";

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
        setErrorMsg(res.error ? financeErrorMessage(res.error, isAr) : (isAr ? "فشل إنشاء نوع المستحق" : "Failed to create due type"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <Tag className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "إضافة نوع مستحق / مطالبة جديدة" : "New Due Type / Demand Category"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "تعريف نوع مطالبة (مثل: صيانة سنوية، استهلاك مياه، اشتراك نادي) وربطه بحساب الإيراد."
                : "Define due category and map it to general ledger revenue account."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "مسمى المستحق (بالعربية)" : "Due Type Name (Arabic)"} <span className="text-rose-500">*</span>
              </Label>
              <Input
                required
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={isAr ? "مثال: مصاريف صيانة وخدمات دورية" : "e.g. Annual Maintenance Fees"}
                className="h-10 text-xs font-bold bg-background border-border"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "مسمى المستحق (بالإنجليزية)" : "Due Type Name (English)"} <span className="text-rose-500">*</span>
              </Label>
              <Input
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Annual Maintenance Fees"
                className="h-10 text-xs font-bold bg-background border-border"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "حساب الإيراد المحاسبي المربوط" : "Linked Revenue GL Account"} <span className="text-rose-500">*</span>
              </Label>
              <Select value={revenueAccountId} onValueChange={(val) => setRevenueAccountId(val ?? "")} items={revenueAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}>
                <SelectTrigger className="h-10 w-full text-xs font-bold bg-background border-border">
                  <SelectValue placeholder={isAr ? "اختر حساب الإيراد..." : "Select revenue account..."} />
                </SelectTrigger>
                <SelectContent>
                  {revenueAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs font-bold">
                      {a.code} — {isAr ? a.name_ar : a.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !nameAr.trim() || !nameEn.trim()} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs gap-1.5 press-feedback motion-control cursor-pointer">
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
  defaultReceivableAccountId = null,
  canSaveReceivableDefault = false,
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
  /** the organization's approved receivable account; null = not configured, the user must choose */
  defaultReceivableAccountId?: string | null;
  canSaveReceivableDefault?: boolean;
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
  const [receivableAccountId, setReceivableAccountId] = useState<string>(
    defaultReceivableAccountId && receivableAccounts.some((a) => a.id === defaultReceivableAccountId) ? defaultReceivableAccountId : "",
  );
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const hasApprovedDefault = Boolean(defaultReceivableAccountId && receivableAccounts.some((a) => a.id === defaultReceivableAccountId));
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
      if (saveAsDefault && canSaveReceivableDefault) formData.set("saveAsDefault", "true");
      formData.set("fiscalPeriodId", fiscalPeriodId);
      formData.set("amount", amount);
      formData.set("issueDate", issueDate);
      formData.set("dueDate", dueDate);
      if (description.trim()) formData.set("description", description.trim());

      const res = await issueDueAction({ ok: true }, formData);

      if (res.ok && res.data?.warning === "DEFAULT_NOT_SAVED") {
        // The due IS issued; only the optional default was not saved. Say so separately and offer a retry that
        // saves the setting alone (issuing again would be skipped by the duplicate guard).
        const accountId = receivableAccountId;
        // One attempt at a time, and never again once it has succeeded (a double click or a double dispatch of the
        // toast control must not save - and audit - the setting twice).
        let busy = false;
        let saved = false;
        toast.add({
          type: "warning",
          title: res.data.outcome === "ALREADY_EXISTS"
            ? isAr ? "المستحق موجود بالفعل، ولم يُحفظ الحساب الافتراضي" : "Due already exists, and the default account was not saved"
            : isAr ? "صدر المستحق، لكن لم يُحفظ الحساب الافتراضي" : "Due issued, but the default account was not saved",
          description: res.data.detail ? financeErrorMessage(res.data.detail, isAr) : "",
          actionProps: {
            children: isAr ? "إعادة محاولة الحفظ" : "Retry saving",
            onClick: async () => {
              if (busy || saved) return;
              busy = true;
              const retry = await saveDefaultReceivableAccountAction({ organizationId, resortId, accountId });
              busy = false;
              saved = retry.ok;
              toast.add(
                retry.ok
                  ? { type: "success", title: isAr ? "حُفظ الحساب الافتراضي" : "Default account saved" }
                  : { type: "error", title: isAr ? "تعذّر الحفظ" : "Could not save", description: financeErrorMessage(retry.error, isAr) },
              );
              router.refresh();
            },
          },
        });
        onOpenChange(false);
        setAmount("");
        setDescription("");
        router.refresh();
      } else if (res.ok && res.data?.outcome === "ALREADY_EXISTS") {
        // Nothing was created: say so instead of "issued".
        toast.add({
          type: "info",
          title: isAr ? "المستحق موجود بالفعل" : "Due already exists",
          description: isAr
            ? "يوجد مستحق مطابق لنفس الوحدة والنوع والتاريخ والبيان، فلم يُصدر مستحق جديد."
            : "An identical due (same unit, type, date and description) is already there, so no new due was issued.",
        });
        onOpenChange(false);
        router.refresh();
      } else if (res.ok) {
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
        setErrorMsg(res.error ? financeErrorMessage(res.error, isAr) : (isAr ? "فشل إصدار المستحق" : "Failed to issue due"));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <FileText className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "إصدار مطالبة / مستحق مالي لوحدة" : "Issue Financial Due / Demand"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "قيد مستحق مالي على مالك/مستأجر الوحدة وترحيل قيد الاستحقاق المحاسبي."
                : "Create receivable due against unit and post accrual journal entry."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {errorMsg && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs font-bold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "الوحدة المستحقة" : "Unit"} <span className="text-rose-500">*</span>
                </Label>
                <Select value={unitId} onValueChange={(val) => setUnitId(val ?? "")} items={units.map((u) => ({ value: u.id, label: u.label }))}>
                  <SelectTrigger className="h-10 w-full text-xs font-mono font-bold bg-background border-border">
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
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "نوع المستحق / البند" : "Due Type"} <span className="text-rose-500">*</span>
                </Label>
                <Select value={dueTypeId} onValueChange={(val) => setDueTypeId(val ?? "")} items={dueTypes.map((d) => ({ value: d.id, label: d.label }))}>
                  <SelectTrigger className="h-10 w-full text-xs font-bold bg-background border-border">
                    <SelectValue placeholder={isAr ? "اختر النوع..." : "Select type..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {dueTypes.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs font-bold">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "حساب الذمم المدينة (أصول)" : "Receivable Asset Account"} <span className="text-rose-500">*</span>
                </Label>
                <Select value={receivableAccountId} onValueChange={(val) => setReceivableAccountId(val ?? "")} items={receivableAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="h-10 w-full text-xs font-bold bg-background border-border">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {receivableAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs font-bold">
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!hasApprovedDefault && (
                  <p data-testid="receivable-not-configured" className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    {isAr
                      ? "لم يُعتمد حساب ذمم افتراضي لهذه المؤسسة. اختر الحساب بنفسك؛ لن نخمّنه."
                      : "No receivable account has been approved for this organization. Choose it yourself; it is not guessed."}
                  </p>
                )}
                {!hasApprovedDefault && canSaveReceivableDefault && (
                  <label className="flex items-center gap-2 text-[11px] font-medium text-foreground">
                    <input
                      type="checkbox"
                      data-testid="save-receivable-default"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                    />
                    {isAr ? "اعتمد هذا الحساب كحساب الذمم الافتراضي" : "Approve this account as the default receivable account"}
                  </label>
                )}
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "الفترة المالية المفتوحة" : "Fiscal Period"} <span className="text-rose-500">*</span>
                </Label>
                <Select value={fiscalPeriodId} onValueChange={(val) => setFiscalPeriodId(val ?? "")} items={periods.map((p) => ({ value: p.id, label: p.label }))}>
                  <SelectTrigger className="h-10 w-full text-xs font-bold bg-background border-border">
                    <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs font-bold">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "مبلغ المستحق" : "Due Amount"} <span className="text-rose-500">*</span>
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
                    className="font-mono text-xs font-bold ps-3 pe-12 text-start h-10 bg-background border-border"
                    dir="ltr"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center pe-3 pointer-events-none text-xs font-bold text-muted-foreground">
                    {currencyLabel}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Calendar className="size-3 text-muted-foreground" />
                  <span>{isAr ? "تاريخ الإصدار" : "Issue Date"}</span> <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="text-xs font-bold h-10 bg-background border-border"
                />
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Calendar className="size-3 text-primary" />
                  <span>{isAr ? "تاريخ الاستحقاق" : "Due Date"}</span> <span className="text-rose-500">*</span>
                </Label>
                <Input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs font-bold h-10 bg-background border-border text-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-start">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "البيان / ملاحظات المطالبة" : "Description / Notes"}
              </Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isAr ? "مثال: صيانة الربع الثاني عن شهر يونيو" : "e.g. Q2 maintenance fee"}
                className="h-10 text-xs rounded-xl bg-background border-border"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control">
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isPending || !unitId || !dueTypeId || !amount || Number(amount) <= 0} className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs gap-1.5 press-feedback motion-control cursor-pointer">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>{isAr ? "إصدار المطالبة وترحيل القيد" : "Issue Due & Post"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
