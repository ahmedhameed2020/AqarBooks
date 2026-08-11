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
import { createExpenseCategoryAction, recordExpenseAction } from "@/lib/actions/purchasing";
import type { ActionResult } from "@/lib/actions/platform";

type Option = { id: string; label: string };

export function CreateExpenseCategoryForm({
  organizationId,
  expenseAccounts,
  locale,
}: {
  organizationId: string;
  expenseAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createExpenseCategoryAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label>{isAr ? "الفئة (عربي)" : "Category (Arabic)"}</Label>
        <Input name="nameAr" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "الفئة (إنجليزي)" : "Category (English)"}</Label>
        <Input name="nameEn" required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>{isAr ? "حساب المصروف" : "Expense account"}</Label>
        <Select name="defaultExpenseAccountId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expenseAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" variant="outline" disabled={pending}>
          {isAr ? "إضافة فئة" : "Add category"}
        </Button>
      </div>
    </form>
  );
}

export function RecordExpenseForm({
  organizationId,
  resortId,
  categories,
  paymentAccounts,
  periods,
  locale,
}: {
  organizationId: string;
  resortId: string;
  categories: Option[];
  paymentAccounts: Option[];
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recordExpenseAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label>{isAr ? "الفئة" : "Category"}</Label>
        <Select name="expenseCategoryId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "حساب الدفع" : "Payment account"}</Label>
        <Select name="paymentAccountId">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paymentAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "الفترة المالية" : "Fiscal period"}</Label>
        <Select name="fiscalPeriodId">
          <SelectTrigger className="w-full">
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
        <Label>{isAr ? "المبلغ" : "Amount"}</Label>
        <Input name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>{isAr ? "الوصف" : "Description"}</Label>
        <Input name="description" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "التاريخ" : "Date"}</Label>
        <Input name="expenseDate" type="date" required />
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "تسجيل مصروف" : "Record expense"}
        </Button>
      </div>
    </form>
  );
}
