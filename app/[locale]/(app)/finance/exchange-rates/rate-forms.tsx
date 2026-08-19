"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordExchangeRate } from "@/lib/actions/exchange-rates";
import type { ActionResult } from "@/lib/actions/platform";

function message(error: string, isAr: boolean) {
  if (error.includes("exchange_rates_unique")) {
    return isAr
      ? "لهذا الزوج سعر مسجَّل في هذا التاريخ بالفعل. السعر واحد لكل يوم — صحّح القائم بدل إضافة ثانٍ."
      : "This pair already has a rate on that date. One rate per pair per day — correct the existing one rather than adding a second.";
  }
  if (error.includes("exchange_rates_distinct")) {
    return isAr
      ? "لا يوجد سعر صرف لعملة مقابل نفسها."
      : "A currency has no exchange rate against itself.";
  }
  if (error.includes("exchange_rates_positive")) {
    return isAr ? "السعر يجب أن يكون أكبر من صفر." : "The rate must be greater than zero.";
  }
  if (error.includes("exchange_rates_iso")) {
    return isAr
      ? "رمز العملة ثلاثة حروف لاتينية كبيرة (EUR، USD، SAR)."
      : "A currency code is three uppercase letters (EUR, USD, SAR).";
  }
  if (error.includes("FORBIDDEN") || error.includes("row-level security")) {
    return isAr ? "لا تملك صلاحية تسجيل أسعار الصرف." : "You don't have permission to record exchange rates.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات المدخلة." : "Check the values entered.";
  return error;
}

export function RecordRateForm({
  organizationId,
  baseCurrency,
  locale,
}: {
  organizationId: string;
  baseCurrency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordExchangeRate,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      {/* The base is the organisation's own currency and is not a choice: a
          rate into some other base would never be read by `convert_to_base`. */}
      <input type="hidden" name="baseCurrency" value={baseCurrency} />

      <div className="space-y-1.5">
        <Label htmlFor="fx-foreign" className="text-xs">
          {isAr ? "العملة الأجنبية" : "Foreign currency"}
        </Label>
        <Input
          id="fx-foreign"
          name="foreignCurrency"
          required
          maxLength={3}
          placeholder="EUR"
          dir="ltr"
          className="uppercase"
        />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="fx-rate" className="text-xs">
          {isAr
            ? `كم ${baseCurrency} تساوي وحدة واحدة؟`
            : `How many ${baseCurrency} to one unit?`}
        </Label>
        <Input
          id="fx-rate"
          name="basePerUnit"
          type="number"
          step="0.00000001"
          min="0.00000001"
          required
          dir="ltr"
        />
        {/* Spelling the direction out on screen, because inverting the rate is
            the classic mistake and a bare "rate" label invites it. */}
        <p className="text-[11px] text-muted-foreground">
          {isAr
            ? `1 وحدة أجنبية = هذا العدد من ${baseCurrency}`
            : `1 foreign unit = this many ${baseCurrency}`}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fx-date" className="text-xs">{isAr ? "تاريخ السعر" : "Rate date"}</Label>
        <Input id="fx-date" name="rateDate" type="date" defaultValue={today} required dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fx-source" className="text-xs">{isAr ? "المصدر" : "Source"}</Label>
        <Input
          id="fx-source"
          name="source"
          placeholder={isAr ? "البنك المركزي" : "Central bank"}
        />
      </div>

      <div className="flex items-end sm:col-span-5">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "تسجيل السعر" : "Record rate"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-5">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}
