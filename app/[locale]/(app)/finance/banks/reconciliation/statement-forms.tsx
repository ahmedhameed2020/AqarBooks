"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBankStatement } from "@/lib/actions/bank-reconciliation";
import type { ActionResult } from "@/lib/actions/platform";

export type BankAccountOption = {
  id: string;
  label: string;
};

function errorText(error: string, isAr: boolean) {
  if (error === "duplicate_period") {
    return isAr
      ? "يوجد كشف حساب لنفس الحساب البنكي بنفس تاريخ النهاية. افتح الكشف الموجود بدل إنشاء نسخة ثانية."
      : "A statement already exists for this bank account with the same end date. Open it instead of creating a duplicate.";
  }
  if (error === "period_order") {
    return isAr ? "تاريخ النهاية يجب ألا يسبق تاريخ البداية." : "The end date cannot precede the start date.";
  }
  if (error === "invalid_input") {
    return isAr ? "تحقق من البيانات المدخلة." : "Check the values you entered.";
  }
  return isAr ? `تعذّر الحفظ: ${error}` : `Could not save: ${error}`;
}

export function CreateStatementForm({
  organizationId,
  bankAccounts,
  locale,
}: {
  organizationId: string;
  bankAccounts: BankAccountOption[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createBankStatement, {
    ok: true,
  });

  if (bankAccounts.length === 0) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {isAr
          ? "أضف حسابًا بنكيًا أولًا من صفحة البنوك والشيكات قبل استيراد كشف حساب."
          : "Add a bank account on the Banks & Cheques page before importing a statement."}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-2 sm:col-span-3">
        <Label htmlFor="bankAccountId">{isAr ? "الحساب البنكي" : "Bank account"}</Label>
        <select
          id="bankAccountId"
          name="bankAccountId"
          required
          className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
        >
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="periodStart">{isAr ? "من تاريخ" : "Period start"}</Label>
        <Input id="periodStart" name="periodStart" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="periodEnd">{isAr ? "إلى تاريخ" : "Period end"}</Label>
        <Input id="periodEnd" name="periodEnd" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">{isAr ? "ملاحظة" : "Note"}</Label>
        <Input id="note" name="note" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="openingBalance">{isAr ? "الرصيد الافتتاحي (حسب البنك)" : "Opening balance (per bank)"}</Label>
        <Input id="openingBalance" name="openingBalance" type="number" step="0.01" required className="tabular-nums" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="closingBalance">{isAr ? "الرصيد الختامي (حسب البنك)" : "Closing balance (per bank)"}</Label>
        <Input id="closingBalance" name="closingBalance" type="number" step="0.01" required className="tabular-nums" />
      </div>

      <div className="flex items-end gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending
            ? isAr
              ? "جارٍ الإنشاء…"
              : "Creating…"
            : isAr
              ? "إنشاء كشف حساب"
              : "Create statement"}
        </Button>
        {state.ok === false && (
          <span className="text-sm text-destructive">{errorText(state.error, isAr)}</span>
        )}
      </div>
    </form>
  );
}
