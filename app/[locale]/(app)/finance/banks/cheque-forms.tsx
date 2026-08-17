"use client";

import { useActionState, useState } from "react";
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
import {
  recordIncomingChequeAction,
  setChequeStatusAction,
  clearIncomingChequeAction,
} from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function RecordChequeForm({
  organizationId,
  resortId,
  bankAccounts,
  members,
  locale,
}: {
  organizationId: string;
  resortId: string;
  bankAccounts: Option[];
  members: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordIncomingChequeAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label>{isAr ? "الحساب البنكي" : "Bank account"}</Label>
        <Select name="bankAccountId" items={bankAccounts.map((a) => ({ value: a.id, label: a.label }))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bankAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "العضو" : "Member"}</Label>
        <Select name="memberId" items={members.map((m) => ({ value: m.id, label: m.label }))}>
          <SelectTrigger className="w-full">
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
        <Label>{isAr ? "رقم الشيك" : "Cheque number"}</Label>
        <Input name="chequeNumber" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "المبلغ" : "Amount"}</Label>
        <Input name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "تاريخ الشيك" : "Cheque date"}</Label>
        <Input name="chequeDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "تاريخ الاستحقاق" : "Due date"}</Label>
        <Input name="dueDate" type="date" required />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "تسجيل شيك وارد" : "Record incoming cheque"}
        </Button>
      </div>
    </form>
  );
}

export function ChequeStatusForm({
  chequeId,
  currentStatus,
  locale,
}: {
  chequeId: string;
  currentStatus: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setChequeStatusAction,
    { ok: true },
  );

  const nextStatuses: Record<string, string[]> = {
    RECEIVED: ["DEPOSITED", "CANCELLED"],
    DEPOSITED: ["RETURNED"],
  };
  const options = nextStatuses[currentStatus] ?? [];
  if (!options.length) return null;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="chequeId" value={chequeId} />
      <Select name="status" defaultValue={options[0]} items={options.map((s) => ({ value: s, label: s }))}>
        <SelectTrigger size="sm" className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {isAr ? "تحديث" : "Update"}
      </Button>
      {!state.ok && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

export function ClearChequeForm({
  chequeId,
  amount,
  fiscalPeriodId,
  dues,
  locale,
}: {
  chequeId: string;
  amount: number;
  fiscalPeriodId?: string;
  dues: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    clearIncomingChequeAction,
    { ok: true },
  );
  const [dueId, setDueId] = useState("");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="chequeId" value={chequeId} />
      <input type="hidden" name="fiscalPeriodId" value={fiscalPeriodId ?? ""} />
      <input type="hidden" name="amount" value={amount} />
      <div className="space-y-1">
        <Label className="text-xs">{isAr ? "المستحق" : "Due"}</Label>
        <select
          name="dueId"
          className="rounded-md border border-input bg-transparent p-1 text-xs"
          value={dueId}
          onChange={(e) => setDueId(e.target.value)}
        >
          <option value="" />
          {dues.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{isAr ? "تاريخ التحصيل" : "Clearing date"}</Label>
        <Input name="clearingDate" type="date" className="h-7 text-xs" required />
      </div>
      <Button type="submit" size="sm" disabled={pending || !dueId}>
        {isAr ? "تحصيل" : "Clear"}
      </Button>
      {!state.ok && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
