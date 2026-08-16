"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/components/money";
import { STATUS_LABELS, type DueDbRow } from "@/lib/portal/row-types";
import { createOnlinePaymentCheckoutAction } from "@/lib/actions/online-payment-checkout";

// Bilingual fallback text for error codes that don't carry their own
// user-facing `message` (INVALID_INPUT / NOT_AUTHENTICATED /
// MEMBER_EMAIL_MISSING never should surface in normal use -- they're guard
// rails, not expected user-facing outcomes -- but we still need something to
// show if they ever do). CHECKOUT_TRANSACTION_FAILED and
// PROVIDER_CHECKOUT_FAILED both come with a `message` from
// online-payment-checkout.ts and that is preferred when present (see render
// below), since CHECKOUT_TRANSACTION_FAILED's message is often the RPC's own
// Arabic error text (e.g. cross-resort rejection).
const GENERIC_ERROR = {
  ar: "تعذر إتمام عملية الدفع، يرجى المحاولة مرة أخرى.",
  en: "Could not start the payment, please try again.",
};

export function DuesCheckout({ dues, locale }: { dues: DueDbRow[]; locale: string }) {
  const isAr = locale === "ar";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTotal = dues
    .filter((d) => selected.has(d.id))
    .reduce((sum, d) => sum + Number(d.amount), 0);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handlePay() {
    setError(null);
    startTransition(async () => {
      const result = await createOnlinePaymentCheckoutAction({
        dueIds: Array.from(selected),
        provider: "FAWRY",
      });
      if ("redirectUrl" in result && result.redirectUrl) {
        // Full external navigation to the provider's hosted checkout page --
        // not an internal route, so a real browser navigation (not
        // router.push) is correct here.
        window.location.href = result.redirectUrl;
        return;
      }
      setError(("message" in result && result.message) || (isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en));
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-background divide-y divide-border">
        {dues.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مستحقات مفتوحة." : "No open dues."}</p>
        )}
        {dues.map((d) => {
          const statusLabel = STATUS_LABELS[d.status];
          return (
            <div key={d.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selected.has(d.id)}
                  onCheckedChange={(checked) => toggle(d.id, checked === true)}
                  aria-label={isAr ? "تحديد الاستحقاق" : "Select due"}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {d.description ?? (isAr ? "استحقاق" : "Due")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.units?.code ?? "-"} · {isAr ? "الاستحقاق" : "Due"} {d.due_date}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{statusLabel ? (isAr ? statusLabel.ar : statusLabel.en) : d.status}</Badge>
                <Money amount={Number(d.amount)} locale={locale} className="font-bold" />
              </div>
            </div>
          );
        })}
      </div>

      {dues.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-bold text-primary">
              {isAr ? "إجمالي المستحقات المحددة" : "Total Selected"}
            </p>
            <Money amount={selectedTotal} locale={locale} className="text-lg font-bold" />
          </div>
          <div className="flex flex-col gap-1">
            {/* Single provider for now -- Paymob's adapter exists only as
                contract-tests-only (see Task 3); extend this into a
                provider selector once it's re-enabled for production. */}
            <Button onClick={handlePay} disabled={selected.size === 0 || isPending}>
              {isPending
                ? isAr
                  ? "جارٍ التحويل..."
                  : "Redirecting..."
                : isAr
                  ? "الدفع عبر فوري"
                  : "Pay with Fawry"}
            </Button>
            {error && <p className="text-xs text-destructive max-w-xs">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
