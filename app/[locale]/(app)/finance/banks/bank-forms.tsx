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
import { createBankAction, createBankAccountAction } from "@/lib/actions/treasury";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateBankForm({ organizationId, locale }: { organizationId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createBankAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label>{isAr ? "اسم البنك (عربي)" : "Bank name (Arabic)"}</Label>
        <Input name="nameAr" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "اسم البنك (إنجليزي)" : "Bank name (English)"}</Label>
        <Input name="nameEn" required />
      </div>
      <div className="flex items-end sm:col-span-1">
        <Button type="submit" variant="outline" disabled={pending}>
          {isAr ? "إضافة بنك" : "Add bank"}
        </Button>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
    </form>
  );
}

export function CreateBankAccountForm({
  organizationId,
  resortId,
  banks,
  assetAccounts,
  locale,
}: {
  organizationId: string;
  resortId: string;
  banks: { id: string; label: string }[];
  assetAccounts: { id: string; label: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createBankAccountAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="resortId" value={resortId} />
      <div className="space-y-2">
        <Label>{isAr ? "البنك" : "Bank"}</Label>
        <Select name="bankId" items={banks.map((b) => ({ value: b.id, label: b.label }))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {banks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "اسم الحساب" : "Account name"}</Label>
        <Input name="accountName" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "رقم الحساب" : "Account number"}</Label>
        <Input name="accountNumber" required />
      </div>
      <div className="space-y-2">
        <Label>{isAr ? "حساب الأستاذ" : "GL account"}</Label>
        <Select name="glAccountId" items={assetAccounts.map((a) => ({ value: a.id, label: a.label }))}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {assetAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "إضافة حساب بنكي" : "Add bank account"}
        </Button>
      </div>
    </form>
  );
}
