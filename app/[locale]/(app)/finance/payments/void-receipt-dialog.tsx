"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { voidPaymentAction } from "@/lib/actions/receivables";
import { financeErrorMessage } from "@/lib/actions/error-messages";
import { getCurrencyLabel } from "@/lib/currency";
import { isVoidReasonValid, normalizeVoidReason } from "./void-reason";

export type VoidReceiptTarget = {
  id: string;
  receipt_number: string;
  member_name?: string;
  amount: number;
  payment_date: string;
};

/**
 * Confirms the reversal of a posted receipt. The reason is required: the confirm button stays disabled until the trimmed reason is
 * non-empty. A submission in flight cannot be repeated (ref guard, so a double click cannot send twice) and the dialog cannot be
 * dismissed while the request runs. On failure the dialog stays open with a readable message; on success the list is refreshed.
 */
export function VoidReceiptDialog({
  target,
  onOpenChange,
  organizationId,
  currency = "EGP",
  locale,
}: {
  target: VoidReceiptTarget | null;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const toast = useToast();
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const reasonValid = isVoidReasonValid(reason);
  const showReasonError = touched && !reasonValid;

  const close = (next: boolean) => {
    if (!next && inFlight.current) return;
    if (!next) {
      setReason("");
      setTouched(false);
      setError(null);
    }
    onOpenChange(next);
  };

  async function confirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!target || !reasonValid || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await voidPaymentAction({ organizationId, paymentId: target.id, reason: normalizeVoidReason(reason) });
      if (result.ok) {
        toast.add({ type: "success", title: isAr ? "تم عكس الدفعة" : "Payment reversed" });
        setReason("");
        setTouched(false);
        setError(null);
        onOpenChange(false);
        router.refresh();
      } else {
        setError(financeErrorMessage(result.error, isAr));
      }
    } catch {
      setError(financeErrorMessage(null, isAr));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (!target) return null;

  const amountText = target.amount.toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reasonId = "void-reason";
  const reasonErrorId = "void-reason-error";

  return (
    <Dialog open={!!target} onOpenChange={close}>
      <DialogContent className="max-w-md" data-testid="void-receipt-dialog">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-red-600/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <DialogTitle>{isAr ? `عكس سند القبض #${target.receipt_number}` : `Reverse receipt #${target.receipt_number}`}</DialogTitle>
            <DialogDescription>
              {isAr
                ? "سيتم عكس القيد المحاسبي لهذا السند وإعادة فتح الاستحقاقات المرتبطة به. لا يمكن التراجع عن العكس من هذه الشاشة."
                : "Voiding reverses this receipt's journal entry and reopens its linked dues. This cannot be undone from this screen."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={confirmVoid}>
          <DialogBody className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-3 text-xs dark:bg-slate-900" data-testid="void-receipt-identity">
              <p className="font-bold">#{target.receipt_number}</p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                {target.member_name || (isAr ? "عميل نقدي / عام" : "General Customer")} — {target.payment_date} —{" "}
                <span className="font-mono font-bold tabular-nums">{amountText} {currencyLabel}</span>
              </p>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300" data-testid="void-receipt-error">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={reasonId} className="text-xs font-bold">
                {isAr ? "سبب العكس (إلزامي) *" : "Reversal reason (required) *"}
              </Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setTouched(true);
                }}
                onBlur={() => setTouched(true)}
                maxLength={1000}
                rows={3}
                disabled={pending}
                aria-invalid={showReasonError || undefined}
                aria-describedby={showReasonError ? reasonErrorId : undefined}
                className="text-xs"
                data-testid="void-reason-input"
              />
              {showReasonError && (
                <p id={reasonErrorId} className="text-[11px] font-semibold text-red-600" data-testid="void-reason-error-text">
                  {financeErrorMessage("reason_required", isAr)}
                </p>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              {isAr ? "تراجع" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={pending || !reasonValid}
              className="gap-1.5 bg-red-600 font-bold text-white hover:bg-red-700"
              data-testid="void-receipt-confirm"
            >
              {pending ? <RefreshCw className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
              {isAr ? "تأكيد العكس" : "Confirm reversal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
