"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, RefreshCw, Undo2, Wallet } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { applyPaymentCreditAction, reverseCreditApplicationAction } from "@/lib/actions/customer-advances";
import { advanceErrorMessage, money4, periodForDate } from "@/lib/finance/customer-advances";
import { useOperationSubmit } from "@/lib/finance/use-operation-submit";
import { getCurrencyLabel } from "@/lib/currency";

export type CreditApplication = { allocationId: string; dueLabel: string; amount: number; appliedOn: string };
export type CreditPayment = {
  id: string;
  receiptNumber: string;
  memberName: string;
  unitId: string;
  unitCode: string;
  paymentDate: string;
  advanceAmount: number;
  remaining: number;
  isStranded: boolean;
  applications: CreditApplication[];
};
export type CreditDue = { id: string; unitId: string; label: string; remaining: number };
export type PeriodOption = { id: string; label: string; start: string; end: string };

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number, locale: string) => n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A customer-advance receipt: what is left, what was applied where, apply more of it to dues of the SAME unit, and reverse a wrong
 * application with a reason. Every submit goes through useOperationSubmit: one submission at a time, and the idempotency key is
 * kept across retries of the same request and renewed for a new one.
 */
export function PaymentCreditDialog({
  open,
  onOpenChange,
  payment,
  dues,
  periods,
  canApply,
  organizationId,
  currency = "EGP",
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: CreditPayment | null;
  dues: CreditDue[];
  periods: PeriodOption[];
  canApply: boolean;
  organizationId: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const cur = getCurrencyLabel(currency, isAr);
  const router = useRouter();
  const toast = useToast();
  const apply = useOperationSubmit();
  const reverse = useOperationSubmit();

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [applyDate, setApplyDate] = useState(today());
  const [applyError, setApplyError] = useState<string | null>(null);

  const [target, setTarget] = useState<CreditApplication | null>(null);
  const [reason, setReason] = useState("");
  const [reverseDate, setReverseDate] = useState(today());
  const [reverseError, setReverseError] = useState<string | null>(null);

  if (!payment) return null;
  const unitDues = dues.filter((d) => d.unitId === payment.unitId && d.remaining > 0);
  const lines = unitDues.filter((d) => selected[d.id]).map((d) => ({ dueId: d.id, amount: money4(Number(amounts[d.id] ?? 0)) }));
  const total = money4(lines.reduce((s, l) => s + l.amount, 0));
  const applyPeriod = periodForDate(periods, applyDate);
  const overDue = lines.some((l) => l.amount > (unitDues.find((d) => d.id === l.dueId)?.remaining ?? 0) + 1e-9);
  const canSubmitApply =
    canApply && !payment.isStranded && lines.length > 0 && lines.every((l) => l.amount > 0) && total <= payment.remaining + 1e-9 && !overDue &&
    !!applyPeriod && applyDate >= payment.paymentDate && applyDate <= today();

  const close = (next: boolean) => {
    if (!next) {
      apply.reset();
      reverse.reset();
      setTarget(null);
      setReason("");
      setApplyError(null);
      setReverseError(null);
    }
    onOpenChange(next);
  };

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmitApply || !applyPeriod) return;
    setApplyError(null);
    const input = { organizationId, paymentId: payment!.id, allocations: lines, applicationDate: applyDate, fiscalPeriodId: applyPeriod.id };
    const result = await apply.run(input, (operationKey) => applyPaymentCreditAction({ ...input, operationKey }));
    if (!result) return; // a submission is already running
    if (result.ok) {
      toast.add({
        type: "success",
        title: isAr ? "تم تطبيق الرصيد" : "Credit applied",
        description: isAr ? `طُبِّق ${fmt(total, locale)} ${cur}` : `Applied ${fmt(total, locale)} ${cur}`,
      });
      close(false);
      router.refresh();
    } else {
      setApplyError(advanceErrorMessage(result.error, isAr ? "ar" : "en"));
    }
  }

  async function submitReverse(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !reason.trim() || !periodForDate(periods, reverseDate)) return;
    setReverseError(null);
    const period = periodForDate(periods, reverseDate)!;
    const input = { organizationId, allocationId: target.allocationId, reason: reason.trim(), reversalDate: reverseDate, fiscalPeriodId: period.id };
    const result = await reverse.run(input, (operationKey) => reverseCreditApplicationAction({ ...input, operationKey }));
    if (!result) return;
    if (result.ok) {
      toast.add({ type: "success", title: isAr ? "تم عكس التطبيق" : "Application reversed" });
      close(false);
      router.refresh();
    } else {
      setReverseError(advanceErrorMessage(result.error, isAr ? "ar" : "en"));
    }
  }

  const errorBox = (message: string) => (
    <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
      <AlertCircle className="size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl" data-testid="payment-credit-dialog">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-600/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
            <Wallet className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? `رصيد الدفعة المقدمة — سند #${payment.receiptNumber}` : `Advance credit — receipt #${payment.receiptNumber}`}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "يُطبَّق الرصيد يدويًا على استحقاقات الوحدة نفسها، ويمكن عكس أي تطبيق خاطئ بسبب مسجَّل."
                : "Credit is applied by hand to dues of the same unit; a wrong application can be reversed with a recorded reason."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="grid grid-cols-3 gap-3 text-center" data-testid="credit-summary">
            <div className="rounded-xl border p-3">
              <p className="text-[11px] text-slate-500">{isAr ? "الدفعة المقدمة" : "Advance"}</p>
              <p className="mt-1 text-sm font-black tabular-nums">{fmt(payment.advanceAmount, locale)} {cur}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-[11px] text-slate-500">{isAr ? "المطبَّق" : "Applied"}</p>
              <p className="mt-1 text-sm font-black tabular-nums">{fmt(money4(payment.advanceAmount - payment.remaining), locale)} {cur}</p>
            </div>
            <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 dark:bg-sky-950/30">
              <p className="text-[11px] text-sky-700 dark:text-sky-300">{isAr ? "الرصيد المتبقي" : "Remaining credit"}</p>
              <p className="mt-1 text-sm font-black tabular-nums text-sky-800 dark:text-sky-200" data-testid="credit-remaining">{fmt(payment.remaining, locale)} {cur}</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {payment.memberName} — {isAr ? "الوحدة" : "Unit"} {payment.unitCode} — {payment.paymentDate}
          </p>
          {payment.isStranded && (
            <div data-testid="stranded-notice" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {isAr
                ? "معلّق — العضو لم يعد مرتبطًا بالوحدة. لا يمكن تطبيق هذا الرصيد؛ يمكن إلغاء الإيصال إن لم تكن له تطبيقات فعّالة."
                : "On hold — the member is no longer linked to the unit. This credit cannot be applied; the receipt can be voided when it has no applications in force."}
            </div>
          )}

          <section aria-label={isAr ? "التطبيقات" : "Applications"} className="space-y-2">
            <h3 className="text-xs font-black">{isAr ? `التطبيقات القائمة (${payment.applications.length})` : `Applications in force (${payment.applications.length})`}</h3>
            {payment.applications.length === 0 ? (
              <p className="text-xs text-slate-500">{isAr ? "لا توجد تطبيقات بعد." : "No applications yet."}</p>
            ) : (
              <ul className="divide-y rounded-xl border text-xs" data-testid="applications-list">
                {payment.applications.map((a) => (
                  <li key={a.allocationId} className="flex items-center justify-between gap-2 p-2.5">
                    <span className="font-mono text-[11px] text-slate-500">{a.appliedOn}</span>
                    <span className="flex-1 truncate font-semibold">{a.dueLabel}</span>
                    <span className="font-mono font-black tabular-nums">{fmt(a.amount, locale)} {cur}</span>
                    {canApply && (
                      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px] text-red-700"
                        onClick={() => { setTarget(a); setReverseError(null); setReverseDate(today() < a.appliedOn ? a.appliedOn : today()); }}>
                        <Undo2 className="size-3" /> {isAr ? "عكس التطبيق" : "Reverse"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {target && (
            <form onSubmit={submitReverse} className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-3 dark:border-red-900/50 dark:bg-red-950/20" data-testid="reverse-form">
              <p className="text-xs font-black text-red-800 dark:text-red-300">
                {isAr ? `عكس تطبيق ${fmt(target.amount, locale)} ${cur} على ${target.dueLabel}` : `Reverse the ${fmt(target.amount, locale)} ${cur} applied to ${target.dueLabel}`}
              </p>
              {reverseError && errorBox(reverseError)}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="reverse-reason" className="text-xs font-bold">{isAr ? "سبب العكس (إلزامي) *" : "Reason (required) *"}</Label>
                  <Textarea id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={2} className="text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reverse-date" className="text-xs font-bold">{isAr ? "تاريخ العكس *" : "Reversal date *"}</Label>
                  <Input id="reverse-date" type="date" value={reverseDate} min={target.appliedOn} max={today()} onChange={(e) => setReverseDate(e.target.value)} className="font-mono text-xs" />
                </div>
              </div>
              {!periodForDate(periods, reverseDate) && (
                <p className="text-[11px] font-semibold text-amber-700">{isAr ? "لا توجد فترة مالية مفتوحة تغطي هذا التاريخ." : "No open fiscal period covers this date."}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTarget(null)} disabled={reverse.pending}>{isAr ? "تراجع" : "Cancel"}</Button>
                <Button type="submit" size="sm" disabled={reverse.pending || !reason.trim() || !periodForDate(periods, reverseDate)} className="gap-1 bg-red-600 text-white hover:bg-red-700" data-testid="reverse-submit">
                  {reverse.pending ? <RefreshCw className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                  {isAr ? "تأكيد العكس" : "Confirm reversal"}
                </Button>
              </div>
            </form>
          )}

          {canApply && !payment.isStranded && payment.remaining > 0 && (
            <form onSubmit={submitApply} className="space-y-3" data-testid="apply-form">
              <h3 className="text-xs font-black">{isAr ? "تطبيق الرصيد على استحقاقات الوحدة" : "Apply credit to this unit's dues"}</h3>
              {applyError && errorBox(applyError)}
              {unitDues.length === 0 ? (
                <p className="rounded-xl border border-dashed p-3 text-xs text-slate-500">{isAr ? "لا توجد استحقاقات مفتوحة لهذه الوحدة." : "This unit has no open dues."}</p>
              ) : (
                <ul className="space-y-2">
                  {unitDues.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-xl border p-2.5 text-xs">
                      <Checkbox
                        checked={!!selected[d.id]}
                        onCheckedChange={(v) => {
                          setSelected((s) => ({ ...s, [d.id]: v === true }));
                          if (v === true && !amounts[d.id]) setAmounts((a) => ({ ...a, [d.id]: String(Math.min(d.remaining, payment.remaining)) }));
                        }}
                        aria-label={d.label}
                      />
                      <span className="flex-1 font-semibold">{d.label}</span>
                      <span className="text-[11px] text-slate-500">{isAr ? "متبقٍ" : "owes"} {fmt(d.remaining, locale)}</span>
                      <Input
                        type="number" step="0.01" min="0.01" max={d.remaining} dir="ltr" disabled={!selected[d.id]}
                        value={amounts[d.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [d.id]: e.target.value }))}
                        className="h-8 w-28 font-mono text-xs" aria-label={isAr ? "المبلغ" : "Amount"}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="apply-date" className="text-xs font-bold">{isAr ? "تاريخ التطبيق *" : "Application date *"}</Label>
                  <Input id="apply-date" type="date" value={applyDate} min={payment.paymentDate} max={today()} onChange={(e) => setApplyDate(e.target.value)} className="font-mono text-xs" />
                  {!applyPeriod && <p className="text-[11px] font-semibold text-amber-700">{isAr ? "لا توجد فترة مالية مفتوحة تغطي هذا التاريخ." : "No open fiscal period covers this date."}</p>}
                </div>
                <div className="rounded-xl border bg-slate-50 p-3 text-xs dark:bg-slate-900" data-testid="apply-total">
                  <div className="flex justify-between"><span>{isAr ? "الإجمالي" : "Total"}</span><b className="tabular-nums">{fmt(total, locale)} {cur}</b></div>
                  <div className="flex justify-between"><span>{isAr ? "المتبقي بعد التطبيق" : "Left after"}</span><b className="tabular-nums">{fmt(money4(payment.remaining - total), locale)} {cur}</b></div>
                  {total > payment.remaining + 1e-9 && <p className="mt-1 font-semibold text-red-600">{isAr ? "أكبر من الرصيد المتاح" : "More than the available credit"}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)} disabled={apply.pending}>{isAr ? "إغلاق" : "Close"}</Button>
                <Button type="submit" disabled={!canSubmitApply || apply.pending} className="gap-1.5 bg-sky-600 font-bold text-white hover:bg-sky-700" data-testid="apply-submit">
                  {apply.pending ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  {isAr ? "تطبيق الرصيد" : "Apply credit"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogBody>
        {!(canApply && !payment.isStranded && payment.remaining > 0) && (
          <DialogFooter>
            <Badge variant="outline" className="me-auto text-[10px]">{canApply ? "" : isAr ? "عرض فقط — تطبيق الرصيد يتطلب صلاحية إدارة التخصيصات" : "View only — applying credit needs allocation management"}</Badge>
            <Button type="button" variant="outline" onClick={() => close(false)}>{isAr ? "إغلاق" : "Close"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
