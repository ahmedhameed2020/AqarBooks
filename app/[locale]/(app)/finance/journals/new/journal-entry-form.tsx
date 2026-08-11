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
import { createJournalEntryAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

type Account = { id: string; code: string; name_ar: string; name_en: string };
type Period = { id: string; name: string };

type LineDraft = {
  key: number;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
};

let keySeq = 0;
const emptyLine = (): LineDraft => ({
  key: keySeq++,
  account_id: "",
  description: "",
  debit: "",
  credit: "",
});

export function JournalEntryForm({
  organizationId,
  accounts,
  periods,
  locale,
}: {
  organizationId: string;
  accounts: Account[];
  periods: Period[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createJournalEntryAction,
    { ok: true },
  );

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const credit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    return { debit, credit, balanced: debit === credit && debit > 0 };
  }, [lines]);

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const linesJson = JSON.stringify(
    lines
      .filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0))
      .map((l) => ({
        account_id: l.account_id,
        description: l.description || undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="fiscalPeriodId">{isAr ? "الفترة المالية" : "Fiscal period"}</Label>
          <Select name="fiscalPeriodId" defaultValue={periods[0]?.id}>
            <SelectTrigger id="fiscalPeriodId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="entryDate">{isAr ? "تاريخ القيد" : "Entry date"}</Label>
          <Input id="entryDate" name="entryDate" type="date" required />
        </div>
        <div className="space-y-2 sm:col-span-1">
          <Label htmlFor="description">{isAr ? "البيان" : "Description"}</Label>
          <Input id="description" name="description" required />
        </div>
      </div>

      <div className="space-y-2">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="p-2 text-start">{isAr ? "الحساب" : "Account"}</th>
                <th className="p-2 text-start">{isAr ? "البيان" : "Memo"}</th>
                <th className="w-32 p-2 text-start">{isAr ? "مدين" : "Debit"}</th>
                <th className="w-32 p-2 text-start">{isAr ? "دائن" : "Credit"}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b last:border-0">
                  <td className="p-2">
                    <select
                      className="w-full rounded-md border border-input bg-transparent p-1.5 text-sm"
                      value={line.account_id}
                      onChange={(e) => updateLine(line.key, { account_id: e.target.value })}
                    >
                      <option value="" />
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {isAr ? a.name_ar : a.name_en}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: "" })}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: "" })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
        >
          {isAr ? "+ إضافة سطر" : "+ Add line"}
        </Button>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span>
          {isAr ? "إجمالي مدين" : "Total debit"}: {totals.debit.toFixed(2)}
        </span>
        <span>
          {isAr ? "إجمالي دائن" : "Total credit"}: {totals.credit.toFixed(2)}
        </span>
        {!totals.balanced && (
          <span className="text-destructive">{isAr ? "غير متوازن" : "Unbalanced"}</span>
        )}
      </div>

      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ كمسودة" : "Save as draft"}
      </Button>
    </form>
  );
}
