"use client";

import { useActionState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, ArrowRightLeft, AlertCircle, Calendar } from "lucide-react";
import { recordExchangeRate } from "@/lib/actions/exchange-rates";
import type { ActionResult } from "@/lib/actions/platform";
import { CURRENCY_CODES } from "@/lib/currency";

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
  open = true,
  onOpenChange,
  organizationId,
  baseCurrency,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  organizationId: string;
  baseCurrency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordExchangeRate,
    { ok: true }
  );
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state.ok && state.id && onOpenChange) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <ArrowRightLeft className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "تسجيل سعر صرف عملة جديد" : "Record Exchange Rate"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? `حدد سعر الصرف للعملة الأجنبية مقابل العملة الأساسية للمؤسسة (${baseCurrency}).`
              : `Define foreign currency valuation against organization base currency (${baseCurrency}).`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="baseCurrency" value={baseCurrency} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="fx-foreign" className="text-xs font-bold text-slate-700">
                {isAr ? "العملة الأجنبية" : "Foreign Currency"}
              </Label>
              <select
                id="fx-foreign"
                name="foreignCurrency"
                required
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                {CURRENCY_CODES.filter((c) => c !== baseCurrency).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fx-date" className="text-xs font-bold text-slate-700">
                {isAr ? "تاريخ السعر" : "Rate Date"}
              </Label>
              <Input
                id="fx-date"
                name="rateDate"
                type="date"
                defaultValue={today}
                required
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <Label htmlFor="fx-rate" className="text-xs font-bold text-blue-950">
              {isAr
                ? `كم ${baseCurrency} تساوي وحدة واحدة من العملة الأجنبية؟`
                : `Rate: How many ${baseCurrency} per 1 foreign unit?`}
            </Label>
            <Input
              id="fx-rate"
              name="basePerUnit"
              type="number"
              step="0.00000001"
              min="0.00000001"
              required
              placeholder="e.g. 50.25"
              dir="ltr"
              className="font-mono text-sm rounded-xl bg-white mt-1"
            />
            <p className="text-[11px] text-blue-700 font-medium">
              {isAr
                ? `مثال: 1 دولار أمريكي (USD) = 50.25 جنيه مصري (EGP)`
                : `e.g. 1 USD = 50.25 EGP`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fx-source" className="text-xs font-bold text-slate-700">
              {isAr ? "المصدر / البنك المعتمد" : "Source / Reference Bank"}
            </Label>
            <Input
              id="fx-source"
              name="source"
              placeholder={isAr ? "البنك المركزي / نشرة أسعار الصرف الرسمية" : "Central Bank / Official Registry"}
              className="text-sm rounded-xl"
            />
          </div>

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {pending ? (isAr ? "جارٍ التسجيل..." : "Recording...") : isAr ? "تسجيل السعر" : "Record Rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
