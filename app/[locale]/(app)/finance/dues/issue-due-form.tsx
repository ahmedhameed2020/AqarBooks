"use client";

import { useActionState } from "react";
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
import { issueDueAction } from "@/lib/actions/receivables";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function IssueDueForm({
  organizationId,
  resortId,
  units,
  dueTypes,
  receivableAccounts,
  periods,
  locale,
  preselectedUnitId,
}: {
  organizationId: string;
  resortId: string;
  units: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  periods: Option[];
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    issueDueAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label htmlFor="unitId">{isAr ? "الوحدة" : "Unit"}</Label>
        <Select name="unitId" defaultValue={preselectedUnitId}>
          <SelectTrigger id="unitId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueTypeId">{isAr ? "نوع المستحق" : "Due type"}</Label>
        <Select name="dueTypeId">
          <SelectTrigger id="dueTypeId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dueTypes.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="receivableAccountId">{isAr ? "حساب الذمم" : "Receivable account"}</Label>
        <Select name="receivableAccountId">
          <SelectTrigger id="receivableAccountId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {receivableAccounts.map((a) => (
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
        <Label htmlFor="amount">{isAr ? "المبلغ" : "Amount"}</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="issueDate">{isAr ? "تاريخ الإصدار" : "Issue date"}</Label>
        <Input id="issueDate" name="issueDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueDate">{isAr ? "تاريخ الاستحقاق" : "Due date"}</Label>
        <Input id="dueDate" name="dueDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">{isAr ? "وصف" : "Description"}</Label>
        <Input id="description" name="description" />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "إصدار مستحق" : "Issue due"}
        </Button>
      </div>
    </form>
  );
}
