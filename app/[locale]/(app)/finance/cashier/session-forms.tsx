"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  openCashierSessionAction,
  closeCashierSessionAction,
  payDueFromCashierAction,
} from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/platform";

export function OpenSessionForm({
  organizationId,
  resortId,
  cashboxId,
  locale,
}: {
  organizationId: string;
  resortId: string;
  cashboxId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    openCashierSessionAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-end gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="cashboxId" value={cashboxId} />
      <div className="space-y-2">
        <Label>{isAr ? "الرصيد الافتتاحي" : "Opening balance"}</Label>
        <Input name="openingBalance" type="number" step="0.01" defaultValue={0} className="w-32" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {isAr ? "فتح جلسة" : "Open session"}
      </Button>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function CloseSessionForm({ sessionId, locale }: { sessionId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    closeCashierSessionAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-end gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="space-y-2">
        <Label>{isAr ? "الرصيد الفعلي عند الإغلاق" : "Actual closing balance"}</Label>
        <Input name="actualClosingBalance" type="number" step="0.01" required className="w-40" />
      </div>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {isAr ? "إغلاق الجلسة" : "Close session"}
      </Button>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function PayDueForm({
  organizationId,
  resortId,
  sessionId,
  cashAccountId,
  dues,
  fiscalPeriodId,
  locale,
}: {
  organizationId: string;
  resortId: string;
  sessionId: string;
  cashAccountId: string;
  dues: { id: string; label: string; remaining: number }[];
  fiscalPeriodId?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    payDueFromCashierAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="depositAccountId" value={cashAccountId} />
      <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId ?? ""} />
      <div className="space-y-2 sm:col-span-2">
        <Label>{isAr ? "المستحق" : "Due"}</Label>
        <select name="dueId" className="w-full rounded-md border border-input bg-transparent p-1.5 text-sm">
          <option value="" />
          {dues.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({isAr ? "متبقي" : "remaining"}: {d.remaining.toFixed(2)})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "المبلغ" : "Amount"}</Label>
        <Input name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "التاريخ" : "Date"}</Label>
        <Input name="paymentDate" type="date" required />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {isAr ? "دفع" : "Pay"}
        </Button>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-5">{state.error}</p>}
    </form>
  );
}
