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
import { createAccount } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

const CATEGORIES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;

export function CreateAccountForm({
  organizationId,
  accounts,
  locale,
}: {
  organizationId: string;
  accounts: { id: string; code: string; name_ar: string; name_en: string; is_group: boolean }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const groupAccounts = accounts.filter((a) => a.is_group);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createAccount,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="code">{isAr ? "رمز الحساب" : "Account code"}</Label>
        <Input id="code" name="code" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nameAr">{isAr ? "الاسم بالعربي" : "Arabic name"}</Label>
        <Input id="nameAr" name="nameAr" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nameEn">{isAr ? "الاسم بالإنجليزي" : "English name"}</Label>
        <Input id="nameEn" name="nameEn" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parentId">{isAr ? "الحساب الأب" : "Parent account"}</Label>
        <Select
          name="parentId"
          items={groupAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
        >
          <SelectTrigger id="parentId" className="w-full">
            <SelectValue placeholder={isAr ? "بدون" : "None"} />
          </SelectTrigger>
          <SelectContent>
            {groupAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.code} — {isAr ? a.name_ar : a.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">{isAr ? "التصنيف" : "Category"}</Label>
        <Select name="category" defaultValue="ASSET" items={CATEGORIES.map((c) => ({ value: c, label: c }))}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="normalBalance">{isAr ? "الرصيد الطبيعي" : "Normal balance"}</Label>
        <Select
          name="normalBalance"
          defaultValue="DEBIT"
          items={[
            { value: "DEBIT", label: isAr ? "مدين" : "Debit" },
            { value: "CREDIT", label: isAr ? "دائن" : "Credit" },
          ]}
        >
          <SelectTrigger id="normalBalance" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEBIT">{isAr ? "مدين" : "Debit"}</SelectItem>
            <SelectItem value="CREDIT">{isAr ? "دائن" : "Credit"}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="isGroup" className="size-4" />
        {isAr ? "حساب تجميعي (لا يُقيَّد عليه مباشرة)" : "Group account (not directly postable)"}
      </label>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {isAr ? "إضافة حساب" : "Add account"}
        </Button>
      </div>
    </form>
  );
}
