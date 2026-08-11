"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordPaymentAction } from "@/lib/actions/receivables";
import type { ActionResult } from "@/lib/actions/platform";

type DueOption = { id: string; label: string; remaining: number };
type Option = { id: string; label: string };

type AllocationDraft = { key: number; due_id: string; amount: string };
let keySeq = 0;

export function RecordPaymentForm({
  organizationId,
  resortId,
  members,
  dues,
  depositAccounts,
  periods,
  locale,
}: {
  organizationId: string;
  resortId: string;
  members: Option[];
  dues: DueOption[];
  depositAccounts: Option[];
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [allocations, setAllocations] = useState<AllocationDraft[]>([
    { key: keySeq++, due_id: "", amount: "" },
  ]);
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordPaymentAction,
    { ok: true },
  );

  const allocatedTotal = useMemo(
    () => allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0),
    [allocations],
  );

  function updateAllocation(key: number, patch: Partial<AllocationDraft>) {
    setAllocations((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  const allocationsJson = JSON.stringify(
    allocations
      .filter((a) => a.due_id && Number(a.amount) > 0)
      .map((a) => ({ due_id: a.due_id, amount: Number(a.amount) })),
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <input type="hidden" name="allocations" value={allocationsJson} />

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="memberId">{isAr ? "العضو" : "Member"}</Label>
          <Select name="memberId">
            <SelectTrigger id="memberId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="method">{isAr ? "طريقة الدفع" : "Method"}</Label>
          <Select name="method" defaultValue="CASH">
            <SelectTrigger id="method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">{isAr ? "نقدًا" : "Cash"}</SelectItem>
              <SelectItem value="BANK_TRANSFER">{isAr ? "تحويل بنكي" : "Bank transfer"}</SelectItem>
              <SelectItem value="CHEQUE">{isAr ? "شيك" : "Cheque"}</SelectItem>
              <SelectItem value="OTHER">{isAr ? "أخرى" : "Other"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="depositAccountId">{isAr ? "حساب الإيداع" : "Deposit account"}</Label>
          <Select name="depositAccountId">
            <SelectTrigger id="depositAccountId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {depositAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fiscalPeriodId">{isAr ? "الفترة المالية" : "Fiscal period"}</Label>
          <Select name="fiscalPeriodId">
            <SelectTrigger id="fiscalPeriodId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentDate">{isAr ? "تاريخ الدفع" : "Payment date"}</Label>
          <Input id="paymentDate" name="paymentDate" type="date" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">{isAr ? "المبلغ الإجمالي" : "Total amount"}</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{isAr ? "توزيع المبلغ على المستحقات" : "Allocate to dues"}</p>
        {allocations.map((allocation) => (
          <div key={allocation.key} className="flex items-center gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-transparent p-1.5 text-sm"
              value={allocation.due_id}
              onChange={(e) => updateAllocation(allocation.key, { due_id: e.target.value })}
            >
              <option value="" />
              {dues.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({isAr ? "متبقي" : "remaining"}: {d.remaining.toFixed(2)})
                </option>
              ))}
            </select>
            <Input
              className="w-32"
              type="number"
              step="0.01"
              value={allocation.amount}
              onChange={(e) => updateAllocation(allocation.key, { amount: e.target.value })}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAllocations((prev) => [...prev, { key: keySeq++, due_id: "", amount: "" }])}
        >
          {isAr ? "+ إضافة توزيع" : "+ Add allocation"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {isAr ? "إجمالي الموزّع" : "Total allocated"}: {allocatedTotal.toFixed(2)}
          {Number(amount) > 0 && allocatedTotal !== Number(amount) && (
            <span className="text-destructive"> ({isAr ? "يجب أن يساوي المبلغ الإجمالي" : "must equal total amount"})</span>
          )}
        </p>
      </div>

      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (isAr ? "جارٍ التسجيل..." : "Recording...") : isAr ? "تسجيل الدفعة" : "Record payment"}
      </Button>
    </form>
  );
}
