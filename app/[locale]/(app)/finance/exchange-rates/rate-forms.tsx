"use client";

import { useActionState, useEffect, useRef } from "react";
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
import { ArrowRightLeft, AlertCircle } from "lucide-react";
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

  const submitted = useRef(false);
  if (pending) submitted.current = true;

  useEffect(() => {
    if (submitted.current && !pending && state.ok && onOpenChange) {
      onOpenChange(false);
      submitted.current = false;
    }
  }, [state, pending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <ArrowRightLeft className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "تسجيل سعر صرف عملة جديد" : "Record Exchange Rate"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? `حدد سعر الصرف للعملة الأجنبية مقابل العملة الأساسية للمؤسسة (${baseCurrency}).`
                : `Define foreign currency valuation against organization base currency (${baseCurrency}).`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="baseCurrency" value={baseCurrency} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="fx-foreign" className="text-xs font-bold text-foreground">
                  {isAr ? "العملة الأجنبية" : "Foreign Currency"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="fx-foreign"
                  name="foreignCurrency"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {CURRENCY_CODES.filter((c) => c !== baseCurrency).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fx-date" className="text-xs font-bold text-foreground">
                  {isAr ? "تاريخ السعر" : "Rate Date"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="fx-date"
                  name="rateDate"
                  type="date"
                  defaultValue={today}
                  required
                  dir="ltr"
                  className="h-10 text-xs font-bold rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <Label htmlFor="fx-rate" className="text-xs font-bold text-foreground block">
                {isAr
                  ? `كم ${baseCurrency} تساوي وحدة واحدة من العملة الأجنبية؟`
                  : `Rate: How many ${baseCurrency} per 1 foreign unit?`} <span className="text-rose-500">*</span>
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
                className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
              />
              <p className="text-[11px] text-muted-foreground font-medium">
                {isAr
                  ? `مثال: 1 دولار أمريكي (USD) = 50.25 جنيه مصري (EGP)`
                  : `e.g. 1 USD = 50.25 EGP`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fx-source" className="text-xs font-bold text-foreground">
                {isAr ? "المصدر / البنك المعتمد" : "Source / Reference Bank"}
              </Label>
              <Input
                id="fx-source"
                name="source"
                placeholder={isAr ? "مثال: البنك المركزي / نشرة أسعار الصرف الرسمية" : "Central Bank / Official Registry"}
                className="h-10 text-xs rounded-xl bg-background border-border"
              />
            </div>

            {!state.ok && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{message(state.error, isAr)}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs press-feedback motion-control cursor-pointer"
            >
              {pending ? (isAr ? "جارٍ التسجيل..." : "Recording...") : isAr ? "تسجيل وتثبيت السعر" : "Record Rate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
