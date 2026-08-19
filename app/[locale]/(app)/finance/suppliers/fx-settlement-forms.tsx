"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settleSupplierInvoiceFxAction } from "@/lib/actions/purchasing";
import type { ActionResult } from "@/lib/actions/platform";

export type ForeignInvoice = {
  id: string;
  invoice_number: string;
  currency: string;
  exchange_rate: number;
  foreign_amount: number;
  base_amount: number;
};

function message(error: string, isAr: boolean) {
  if (error.includes("FX_ACCOUNTS_NOT_SET") || error.includes("FX_GAIN_ACCOUNT_NOT_SET") || error.includes("FX_LOSS_ACCOUNT_NOT_SET")) {
    return isAr
      ? "عيّن حسابي ربح وخسارة فرق العملة أولًا (الإدارة ← الحسابات المعيَّنة) — لن يختار النظام حسابًا نيابةً عنك."
      : "Designate the FX gain and loss accounts first (Admin → Designated Accounts). The system will not pick one for you.";
  }
  if (error.includes("INVOICE_NOT_FOREIGN_CURRENCY")) {
    return isAr ? "هذه الفاتورة بعملة المؤسسة، فلا فرق صرف لها." : "That invoice is in the organisation's own currency, so it has no FX difference.";
  }
  if (error.includes("NO_OPEN_FISCAL_PERIOD")) {
    return isAr
      ? "لا توجد فترة مالية مفتوحة تغطي تاريخ السداد."
      : "No open fiscal period covers that settlement date.";
  }
  if (error.includes("EXCHANGE_RATE_INVALID")) {
    return isAr ? "السعر يجب أن يكون أكبر من صفر." : "The rate must be greater than zero.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr ? "لا تملك صلاحية ترحيل فروق التسوية." : "You don't have permission to post settlement differences.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

export function SettleFxForm({
  invoice,
  baseCurrencyLabel,
  locale,
}: {
  invoice: ForeignInvoice;
  baseCurrencyLabel: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    settleSupplierInvoiceFxAction,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="invoiceId" value={invoice.id} />

      <div className="space-y-1.5">
        <Label htmlFor={`settle-date-${invoice.id}`} className="text-xs">
          {isAr ? "تاريخ السداد" : "Settlement date"}
        </Label>
        <Input
          id={`settle-date-${invoice.id}`}
          name="settlementDate"
          type="date"
          defaultValue={today}
          required
          dir="ltr"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`settle-rate-${invoice.id}`} className="text-xs">
          {isAr ? "سعر يوم السداد" : "Settlement rate"}
        </Label>
        <Input
          id={`settle-rate-${invoice.id}`}
          name="settlementRate"
          type="number"
          step="0.00000001"
          min="0.00000001"
          required
          dir="ltr"
        />
        {/* The booked rate is shown beside the field so the operator can see
            which way the difference will go before submitting. */}
        <p className="text-[11px] text-muted-foreground" dir="ltr">
          {isAr ? "سُجِّلت بسعر" : "booked at"} {invoice.exchange_rate}
        </p>
      </div>

      <div className="flex items-end sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? isAr ? "جارٍ…" : "Posting…"
            : isAr ? "ترحيل فرق التسوية" : "Post settlement difference"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {message(state.error, isAr)}
        </p>
      )}
      {state.ok === true && state.id === undefined && null}
    </form>
  );
}
