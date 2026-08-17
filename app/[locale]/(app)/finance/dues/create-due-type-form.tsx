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
import { createDueTypeAction } from "@/lib/actions/receivables";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateDueTypeForm({
  organizationId,
  revenueAccounts,
  locale,
}: {
  organizationId: string;
  revenueAccounts: { id: string; code: string; name_ar: string; name_en: string }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createDueTypeAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="nameAr">{isAr ? "نوع المستحق (عربي)" : "Due type (Arabic)"}</Label>
        <Input id="nameAr" name="nameAr" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nameEn">{isAr ? "نوع المستحق (إنجليزي)" : "Due type (English)"}</Label>
        <Input id="nameEn" name="nameEn" required />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="defaultRevenueAccountId">{isAr ? "حساب الإيراد" : "Revenue account"}</Label>
        <Select
          name="defaultRevenueAccountId"
          items={revenueAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
        >
          <SelectTrigger id="defaultRevenueAccountId" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {revenueAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} — {isAr ? a.name_ar : a.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-4">
        <Button type="submit" variant="outline" disabled={pending}>
          {isAr ? "إضافة نوع مستحق" : "Add due type"}
        </Button>
      </div>
    </form>
  );
}
