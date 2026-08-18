"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/money";
import { recordDepositEvent } from "@/lib/actions/lease-deposits";
import type { ActionResult } from "@/lib/actions/platform";

export type DepositSummary = {
  received_total: number;
  refunded_total: number;
  deducted_total: number;
  held_total: number;
  agreed_amount: number;
  event_count: number;
};

export type DepositEvent = {
  id: string;
  event_type: "RECEIVED" | "REFUNDED" | "DEDUCTED";
  amount: number;
  reason: string | null;
  event_date: string;
};

export type AccountOption = { id: string; label: string };

const TYPE_LABEL: Record<string, { ar: string; en: string }> = {
  RECEIVED: { ar: "استلام", en: "Received" },
  REFUNDED: { ar: "ردّ", en: "Refunded" },
  DEDUCTED: { ar: "خصم", en: "Deducted" },
};

function errorText(error: string, isAr: boolean) {
  if (error.includes("DEPOSIT_EXCEEDS_HELD")) {
    const nums = error.match(/\(([\d.]+)\).*\(([\d.]+)\)/);
    return isAr
      ? `المبلغ ${nums?.[1] ?? ""} يتجاوز الوديعة المحتفظ بها ${nums?.[2] ?? ""}. لا يمكن ردّ أو خصم أكثر مما استُلم.`
      : `${nums?.[1] ?? "That amount"} exceeds the ${nums?.[2] ?? "held"} still held. You cannot refund or deduct more than was received.`;
  }
  if (error.includes("DEPOSIT_LIABILITY_ACCOUNT_NOT_SET")) {
    return isAr
      ? "لم يُحدَّد حساب التزام ودائع التأمين في إعدادات المالية. حدِّده أولًا حتى تُقيَّد الوديعة كالتزام."
      : "No security deposit liability account is configured in finance settings. Set one so deposits post as a liability.";
  }
  if (error.includes("NO_OPEN_FISCAL_PERIOD")) {
    return isAr
      ? "لا توجد فترة مالية مفتوحة تغطي هذا التاريخ. الوديعة نقد انتقل فعلًا، فلا يمكن تأجيل قيده — افتح الفترة أو صحّح التاريخ."
      : "No open fiscal period covers this date. A deposit is cash that already moved, so its entry cannot be deferred — open the period or correct the date.";
  }
  if (error.includes("DEPOSIT_REASON_REQUIRED") || error === "reason_required") {
    return isAr ? "يجب ذكر سبب الردّ أو الخصم." : "A reason is required for a refund or deduction.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr ? "لا تملك صلاحية إدارة عقود الإيجار." : "You don't have permission to manage leases.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

export function DepositPanel({
  leaseId,
  summary,
  events,
  cashAccounts,
  incomeAccounts,
  currency,
  locale,
  canManage,
}: {
  leaseId: string;
  summary: DepositSummary;
  events: DepositEvent[];
  cashAccounts: AccountOption[];
  incomeAccounts: AccountOption[];
  currency: string;
  locale: string;
  canManage: boolean;
}) {
  const isAr = locale === "ar";
  const [eventType, setEventType] = useState<"RECEIVED" | "REFUNDED" | "DEDUCTED">("RECEIVED");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(recordDepositEvent, {
    ok: true,
  });

  // A deduction lands in an income/recovery account; cash movements land in a
  // cash or bank account. Showing the wrong list is how a deposit ends up
  // credited to the wrong side of the balance sheet.
  const accounts = eventType === "DEDUCTED" ? incomeAccounts : cashAccounts;
  const needsReason = eventType !== "RECEIVED";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{isAr ? "وديعة التأمين" : "Security deposit"}</h3>
        <span className="text-xs text-muted-foreground">
          {isAr ? "التزام على المنشأة، وليست إيرادًا" : "a liability, not revenue"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{isAr ? "المستلم" : "Received"}</dt>
          <dd className="tabular-nums"><Money amount={summary.received_total} currency={currency} locale={locale} /></dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{isAr ? "المردود" : "Refunded"}</dt>
          <dd className="tabular-nums"><Money amount={summary.refunded_total} currency={currency} locale={locale} /></dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{isAr ? "المخصوم" : "Deducted"}</dt>
          <dd className="tabular-nums"><Money amount={summary.deducted_total} currency={currency} locale={locale} /></dd>
        </div>
        <div className="flex justify-between gap-2 font-medium">
          <dt>{isAr ? "المحتفظ به" : "Still held"}</dt>
          <dd className="tabular-nums"><Money amount={summary.held_total} currency={currency} locale={locale} /></dd>
        </div>
      </dl>

      {summary.agreed_amount > 0 && summary.received_total < summary.agreed_amount && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          {isAr
            ? "المستلم أقل من الوديعة المتفق عليها في العقد."
            : "Less has been received than the deposit agreed in the lease."}
        </p>
      )}

      {events.length > 0 && (
        <ul className="space-y-1 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-2 border-t pt-1">
              <span className="font-medium">
                {isAr ? TYPE_LABEL[e.event_type].ar : TYPE_LABEL[e.event_type].en}
              </span>
              <span className="tabular-nums">
                <Money amount={e.amount} currency={currency} locale={locale} />
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{e.event_date}</span>
              {e.reason && <span className="text-xs text-muted-foreground">— {e.reason}</span>}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form action={formAction} className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          <input type="hidden" name="leaseId" value={leaseId} />

          <div className="space-y-1.5">
            <Label htmlFor="eventType">{isAr ? "نوع الحركة" : "Movement"}</Label>
            <select
              id="eventType"
              name="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value as typeof eventType)}
              className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
            >
              <option value="RECEIVED">{isAr ? "استلام وديعة" : "Receive deposit"}</option>
              <option value="REFUNDED">{isAr ? "ردّ وديعة" : "Refund deposit"}</option>
              <option value="DEDUCTED">{isAr ? "خصم من الوديعة" : "Deduct from deposit"}</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">{isAr ? "المبلغ" : "Amount"}</Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required className="tabular-nums" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settlementAccountId">
              {eventType === "DEDUCTED"
                ? isAr
                  ? "حساب إثبات الخصم"
                  : "Account recognising the deduction"
                : isAr
                  ? "حساب النقدية/البنك"
                  : "Cash or bank account"}
            </Label>
            <select
              id="settlementAccountId"
              name="settlementAccountId"
              required
              className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eventDate">{isAr ? "التاريخ" : "Date"}</Label>
            <Input id="eventDate" name="eventDate" type="date" required defaultValue={today} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="reason">
              {isAr ? "السبب" : "Reason"}
              {needsReason && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              id="reason"
              name="reason"
              required={needsReason}
              placeholder={
                needsReason
                  ? isAr
                    ? "مطلوب عند الردّ أو الخصم"
                    : "Required for a refund or deduction"
                  : isAr
                    ? "اختياري"
                    : "Optional"
              }
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending || accounts.length === 0}>
              {pending ? (isAr ? "جارٍ التسجيل…" : "Recording…") : isAr ? "تسجيل الحركة" : "Record movement"}
            </Button>
            {state.ok === false && (
              <span className="text-sm text-destructive">{errorText(state.error, isAr)}</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
