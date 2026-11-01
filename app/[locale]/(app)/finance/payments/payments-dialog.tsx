"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, AlertCircle, RefreshCw, CheckCircle2, Receipt, ArrowUpRight, PiggyBank } from "lucide-react";
import { recordPaymentAction } from "@/lib/actions/receivables";
import { recordAdvancePaymentAction } from "@/lib/actions/customer-advances";
import { advanceErrorMessage, money4, periodForDate } from "@/lib/finance/customer-advances";
import { useOperationSubmit } from "@/lib/finance/use-operation-submit";
import { useToast } from "@/components/ui/toast";
import { getCurrencyLabel } from "@/lib/currency";
import { financeErrorMessage } from "@/lib/actions/error-messages";
import type { PeriodOption } from "./payment-credit-dialog";

export type Option = { id: string; label: string };
export type DueOption = { id: string; unitId: string; label: string; remaining: number };
export type UnitOption = { id: string; code: string; ownerId: string | null };

const PAYMENT_METHODS = [
  { value: "CASH", labelAr: "نقدي (Cash)", labelEn: "Cash" },
  { value: "BANK_TRANSFER", labelAr: "تحويل بنكي (Bank transfer)", labelEn: "Bank transfer" },
  { value: "CHEQUE", labelAr: "شيك بنكي (Cheque)", labelEn: "Cheque" },
  { value: "ONLINE", labelAr: "دفع إلكتروني (Online)", labelEn: "Online" },
] as const;

const today = () => new Date().toISOString().split("T")[0];
const fmt = (n: number, locale: string) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Mode = "due" | "advance";

export function RecordPaymentDialog({
  open,
  onOpenChange,
  organizationId,
  resortId,
  members,
  dues,
  units = [],
  depositAccounts,
  periods,
  advanceAccountConfigured = false,
  canManageAdvanceAccount = false,
  currency = "EGP",
  locale,
  preselectedUnitId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  resortId: string;
  members: Option[];
  dues: DueOption[];
  units?: UnitOption[];
  depositAccounts: Option[];
  periods: PeriodOption[];
  advanceAccountConfigured?: boolean;
  canManageAdvanceAccount?: boolean;
  currency?: string;
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const submitter = useOperationSubmit();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("due");
  const [memberId, setMemberId] = useState<string>(members[0]?.id ?? "");
  const [advanceUnitId, setAdvanceUnitId] = useState<string>(preselectedUnitId ?? units[0]?.id ?? "");
  const [method, setMethod] = useState<string>("CASH");
  const [depositAccountId, setDepositAccountId] = useState<string>(depositAccounts[0]?.id ?? "");
  const [fiscalPeriodId, setFiscalPeriodId] = useState<string>(periods[0]?.id ?? "");
  const [selectedDueId, setSelectedDueId] = useState<string>(dues[0]?.id ?? "");
  const [amount, setAmount] = useState<string>(dues[0]?.remaining ? dues[0].remaining.toString() : "");
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState("");
  const [confirmAdvance, setConfirmAdvance] = useState(false);

  const handleDueChange = (dueId: string) => {
    setSelectedDueId(dueId);
    setConfirmAdvance(false);
    const target = dues.find((d) => d.id === dueId);
    if (target && target.remaining > 0) setAmount(target.remaining.toString());
  };

  const selectedDue = dues.find((d) => d.id === selectedDueId);
  const amountNum = money4(Number(amount) || 0);
  // Part of the amount that no due absorbs. In due mode it is the excess over what the due still owes; in advance mode it is everything.
  const excess = mode === "advance" ? amountNum : selectedDue ? money4(amountNum - selectedDue.remaining) : 0;
  const isAdvance = mode === "advance" || excess > 0.00005;
  const unitId = mode === "advance" ? advanceUnitId : selectedDue?.unitId ?? "";
  const unitCode = units.find((u) => u.id === unitId)?.code ?? "";
  // The period follows the payment date (periods are monthly); the picker is only the fallback when the date has none.
  const autoPeriod = periodForDate(periods, paymentDate);
  const effectivePeriodId = autoPeriod?.id ?? fiscalPeriodId;

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setConfirmAdvance(false);
    setErrorMsg(null);
    if (next === "advance") {
      const owner = units.find((u) => u.id === advanceUnitId)?.ownerId;
      if (owner) setMemberId(owner);
    }
  };
  const handleUnitChange = (id: string) => {
    setAdvanceUnitId(id);
    const owner = units.find((u) => u.id === id)?.ownerId;
    if (owner) setMemberId(owner);
  };

  const advanceBlocked = isAdvance && !advanceAccountConfigured;
  const advanceMethodBlocked = isAdvance && method === "ONLINE";
  const needsConfirm = mode === "due" && isAdvance;
  const canSubmit =
    !submitter.pending &&
    !!memberId && !!depositAccountId && !!effectivePeriodId && amountNum > 0 &&
    (mode === "advance" ? !!advanceUnitId : !!selectedDueId) &&
    !advanceBlocked && !advanceMethodBlocked && (!needsConfirm || confirmAdvance) &&
    paymentDate <= today();

  const close = (next: boolean) => {
    if (!next) {
      submitter.reset();
      setErrorMsg(null);
      setConfirmAdvance(false);
    }
    onOpenChange(next);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!canSubmit) {
      setErrorMsg(isAr ? "يرجى تعبئة جميع الحقول المطلوبة" : "Please fill in all required fields");
      return;
    }

    if (isAdvance) {
      // An advance receipt: whatever the due absorbs is allocated now, the rest becomes credit on the unit's account.
      const allocations = mode === "due" && selectedDue ? [{ dueId: selectedDue.id, amount: selectedDue.remaining }] : [];
      const input = {
        organizationId, resortId, memberId, unitId, amount: amountNum, method, paymentDate,
        depositAccountId, fiscalPeriodId: effectivePeriodId, allocations: allocations.filter((a) => a.amount > 0),
      };
      const result = await submitter.run(input, (operationKey) => recordAdvancePaymentAction({ ...input, operationKey }));
      if (!result) return;
      if (result.ok) {
        toast.add({
          type: "success",
          title: isAr ? "تم تسجيل الدفعة المقدمة" : "Advance recorded",
          description: isAr ? `سُجِّل ${fmt(excess, locale)} ${currencyLabel} رصيدًا دائنًا على الوحدة ${unitCode}` : `${fmt(excess, locale)} ${currencyLabel} is now credit on unit ${unitCode}`,
        });
        close(false);
        router.refresh();
      } else {
        setErrorMsg(advanceErrorMessage(result.error, isAr ? "ar" : "en"));
      }
      return;
    }

    // Ordinary receipt: the amount fits the due (unchanged behaviour)
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("resortId", resortId);
    formData.set("memberId", memberId);
    if (selectedDue?.unitId) formData.set("unitId", selectedDue.unitId);
    formData.set("method", method);
    formData.set("depositAccountId", depositAccountId);
    formData.set("fiscalPeriodId", effectivePeriodId);
    formData.set("amount", amount);
    formData.set("paymentDate", paymentDate);
    if (reference.trim()) formData.set("reference", reference.trim());
    formData.set("allocations", JSON.stringify([{ dueId: selectedDueId, amount: Number(amount) }]));
    const result = await submitter.run({ kind: "plain", memberId, selectedDueId, amount, method, paymentDate, depositAccountId, effectivePeriodId }, async () => {
      const res = await recordPaymentAction({ ok: true }, formData);
      return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error || "unexpected" } as const);
    });
    if (!result) return;
    if (result.ok) {
      toast.add({
        type: "success",
        title: isAr ? "تم تسجيل سند القبض بنجاح" : "Payment Recorded Successfully",
        description: isAr
          ? `تم تحصيل ${Number(amount).toLocaleString()} ${currencyLabel} وتوليد القيد المحاسبي`
          : `Recorded payment of ${Number(amount).toLocaleString()} ${currencyLabel}`,
      });
      close(false);
      router.refresh();
    } else {
      setErrorMsg(result.error ? financeErrorMessage(result.error, isAr) : (isAr ? "فشل تسجيل الدفعة" : "Failed to record payment"));
    }
  }

  const label = (t: string) => <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{t}</Label>;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg" data-testid="record-payment-dialog">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Receipt className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? "تسجيل سند قبض وتحصيل مالي" : "Record Payment Receipt"}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "إثبات استلام دفعة نقدية أو بنكية من عميل وإسقاطها على المطالبات المفتوحة."
                : "Record customer receipt and allocate payment against open dues."}
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

            {/* what is being recorded: a payment on a due, or an advance without one */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80" role="tablist" aria-label={isAr ? "نوع الدفعة" : "Payment kind"}>
              {([
                ["due", isAr ? "سداد مطالبة" : "Pay a due"],
                ["advance", isAr ? "دفعة مقدمة بلا استحقاق" : "Advance, no due"],
              ] as const).map(([key, text]) => (
                <button
                  key={key} type="button" role="tab" aria-selected={mode === key} data-testid={`mode-${key}`}
                  onClick={() => handleModeChange(key)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${mode === key ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-600 dark:text-slate-400"}`}
                >
                  {text}
                </button>
              ))}
            </div>

            {mode === "due" ? (
              dues.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                  <p className="mb-2 font-bold">
                    {isAr ? "لا توجد مطالبات أو مستحقات مفتوحة حالياً للتحصيل." : "No open dues available for payment allocation."}
                  </p>
                  <Link href="/finance/dues" className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline">
                    <span>{isAr ? "الانتقال لصفحة المستحقات لإصدار مطالبة" : "Go to Dues page to issue a demand"}</span>
                    <ArrowUpRight className="size-3" />
                  </Link>
                  <button type="button" className="mt-2 block w-full text-[11px] font-bold underline" onClick={() => handleModeChange("advance")}>
                    {isAr ? "أو سجّلها كدفعة مقدمة على الوحدة" : "or record it as an advance on a unit"}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 text-start">
                  {label(isAr ? "المطالبة / المستحق المراد سداده وإسقاط الدفعة عليه *" : "Target Due Demand *")}
                  <Select
                    value={selectedDueId}
                    onValueChange={(val) => handleDueChange(val ?? "")}
                    items={dues.map((d) => ({
                      value: d.id,
                      label: `${d.label} (${isAr ? "متبقي" : "owes"}: ${d.remaining.toLocaleString()} ${currencyLabel})`,
                    }))}
                  >
                    <SelectTrigger className="w-full text-xs font-bold">
                      <SelectValue placeholder={isAr ? "اختر المطالبة..." : "Select due..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {dues.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="text-xs">
                          {d.label} — ({isAr ? "متبقي:" : "Rem:"} {d.remaining.toLocaleString()} {currencyLabel})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            ) : (
              <div className="space-y-1.5 text-start">
                {label(isAr ? "الوحدة صاحبة الرصيد *" : "Unit that holds the credit *")}
                <Select value={advanceUnitId} onValueChange={(val) => handleUnitChange(val ?? "")} items={units.map((u) => ({ value: u.id, label: u.code }))}>
                  <SelectTrigger className="w-full text-xs font-bold" data-testid="advance-unit">
                    <SelectValue placeholder={isAr ? "اختر الوحدة..." : "Select unit..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">{u.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-start">
                {label(isAr ? "العميل / القائم بالسداد *" : "Client / Member *")}
                <Select value={memberId} onValueChange={(val) => setMemberId(val ?? "")} items={members.map((m) => ({ value: m.id, label: m.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر العميل..." : "Select member..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 text-start">
                {label(isAr ? "طريقة السداد *" : "Payment Method *")}
                <Select value={method} onValueChange={(val) => setMethod(val ?? "CASH")} items={PAYMENT_METHODS.map((m) => ({ value: m.value, label: isAr ? m.labelAr : m.labelEn }))}>
                  <SelectTrigger className="w-full text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-xs">{isAr ? m.labelAr : m.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-start">
                {label(isAr ? "حساب الإيداع (الخزينة / البنك) *" : "Deposit Account *")}
                <Select value={depositAccountId} onValueChange={(val) => setDepositAccountId(val ?? "")} items={depositAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder={isAr ? "اختر الحساب..." : "Select account..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {depositAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {depositAccounts.length === 0 ? (
                  <p className="text-[11px] text-destructive">
                    {isAr
                      ? "لا يوجد حساب إيداع مرتبط بخزينة أو حساب بنكي فعّال. اربط حساب النقدية بخزينة (أو أضف حسابًا بنكيًا) قبل تسجيل المقبوضات."
                      : "No deposit account is linked to an active cash box or bank account. Link the cash account to a cash box (or add a bank account) before recording receipts."}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5 text-start">
                {label(isAr ? "الفترة المالية *" : "Fiscal Period *")}
                {autoPeriod ? (
                  <div className="flex h-8 items-center rounded-lg border bg-slate-50 px-2.5 text-xs font-semibold dark:bg-slate-900" data-testid="auto-period">{autoPeriod.label}</div>
                ) : (
                  <Select value={fiscalPeriodId} onValueChange={(val) => setFiscalPeriodId(val ?? "")} items={periods.map((p) => ({ value: p.id, label: p.label }))}>
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue placeholder={isAr ? "اختر الفترة..." : "Select period..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 text-start">
                {label(isAr ? "المبلغ المحصل *" : "Amount Paid *")}
                <div className="relative">
                  <Input
                    type="number" step="0.01" min="0.01" required value={amount}
                    onChange={(e) => { setAmount(e.target.value); setConfirmAdvance(false); }}
                    placeholder="0.00" className="pl-3 pr-12 text-left font-mono text-sm font-bold" dir="ltr" data-testid="amount-input"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs font-bold text-slate-400">{currencyLabel}</div>
                </div>
              </div>

              <div className="space-y-1.5 text-start">
                <Label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <Calendar className="size-3 text-slate-400" />
                  <span>{isAr ? "تاريخ السداد *" : "Payment Date *"}</span>
                </Label>
                <Input type="date" required value={paymentDate} max={today()} onChange={(e) => setPaymentDate(e.target.value)} className="font-mono text-xs" />
              </div>
            </div>

            {mode === "due" && (
              <div className="space-y-1.5 text-start">
                {label(isAr ? "المرجع / رقم الشيك أو الإشعار البنكي" : "Reference / Cheque #")}
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={isAr ? "مثال: تحويل رقم TR-987654" : "e.g. Wire Ref #"} className="font-mono text-xs" />
              </div>
            )}

            {/* the explicit statement of what will become credit */}
            {isAdvance && (
              <div className="space-y-2 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs dark:border-sky-800 dark:bg-sky-950/30" data-testid="advance-notice">
                <div className="flex items-start gap-2 font-bold text-sky-900 dark:text-sky-200">
                  <PiggyBank className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {mode === "advance"
                      ? isAr
                        ? `سيُسجَّل ${fmt(excess, locale)} ${currencyLabel} دفعة مقدمة (رصيد دائن) على الوحدة ${unitCode || "—"}، ويُطبَّق يدويًا لاحقًا.`
                        : `${fmt(excess, locale)} ${currencyLabel} will be recorded as an advance (credit) on unit ${unitCode || "—"} and applied by hand later.`
                      : isAr
                        ? `الباقي ${fmt(excess, locale)} ${currencyLabel} بعد سداد ${fmt(selectedDue?.remaining ?? 0, locale)} ${currencyLabel} يُسجَّل دفعة مقدمة (رصيد دائن) على الوحدة ${unitCode || "—"}.`
                        : `The remaining ${fmt(excess, locale)} ${currencyLabel} after paying ${fmt(selectedDue?.remaining ?? 0, locale)} ${currencyLabel} is recorded as an advance (credit) on unit ${unitCode || "—"}.`}
                  </span>
                </div>
                {needsConfirm && (
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-sky-900 dark:text-sky-200">
                    <Checkbox checked={confirmAdvance} onCheckedChange={(v) => setConfirmAdvance(v === true)} data-testid="confirm-advance" />
                    <span>{isAr ? "أؤكد تسجيل الباقي دفعة مقدمة" : "I confirm the remainder is recorded as an advance"}</span>
                  </label>
                )}
                {advanceBlocked && (
                  <p className="font-bold text-red-700 dark:text-red-300" data-testid="advance-not-configured">
                    {advanceErrorMessage("ADVANCE_ACCOUNT_NOT_CONFIGURED", isAr ? "ar" : "en")}{" "}
                    {canManageAdvanceAccount
                      ? isAr ? "اعتمد الحساب من بطاقة «حساب سلف العملاء» أعلى الصفحة." : "Approve it in the “Customer advance account” card at the top of the page."
                      : isAr ? "اطلب من المالك أو المدير المالي اعتماد الحساب." : "Ask the owner or a finance manager to approve it."}
                  </p>
                )}
                {advanceMethodBlocked && <p className="font-bold text-red-700 dark:text-red-300">{advanceErrorMessage("METHOD_INVALID", isAr ? "ar" : "en")}</p>}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={submitter.pending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="record-submit" className="gap-1.5 bg-emerald-600 font-bold text-white hover:bg-emerald-700">
              {submitter.pending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>{isAdvance ? (isAr ? "حفظ الدفعة المقدمة" : "Record advance") : isAr ? "حفظ وترحيل سند القبض" : "Record Receipt"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
