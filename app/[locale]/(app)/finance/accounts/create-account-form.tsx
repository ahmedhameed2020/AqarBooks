"use client";

import { useActionState, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccount } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import {
  ACCOUNT_CATEGORIES,
  CASH_FLOW_SECTIONS,
  categoryLabel,
  cashFlowSectionLabel,
} from "@/lib/accounting/account-labels";

function errorMessage(code: string | undefined, isAr: boolean): string {
  switch (code) {
    case "duplicate_code":
      return isAr ? "رمز الحساب مستخدم بالفعل." : "That account code is already in use.";
    case "invalid_parent":
      return isAr ? "الحساب الأب غير صالح." : "The selected parent account is not valid.";
    case "forbidden":
      return isAr
        ? "لا تملك صلاحية إضافة حسابات."
        : "You do not have permission to add accounts.";
    case "invalid_input":
      return isAr ? "تحقّق من الحقول المدخلة." : "Please check the fields and try again.";
    default:
      return isAr ? "تعذّر إضافة الحساب. حاول مرة أخرى." : "Could not add the account. Please try again.";
  }
}

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
  const [open, setOpen] = useState(false);
  const groupAccounts = accounts
    .filter((a) => a.is_group)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createAccount, {
    ok: true,
  });

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" />
        {isAr ? "إضافة حساب" : "Add account"}
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{isAr ? "حساب جديد" : "New account"}</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          className="h-7 gap-1 px-2 text-xs"
        >
          <ChevronDown className="size-3.5" />
          {isAr ? "إخفاء" : "Hide"}
        </Button>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <input type="hidden" name="organizationId" value={organizationId} />

        <div className="space-y-2">
          <Label htmlFor="code">{isAr ? "رمز الحساب" : "Account code"}</Label>
          <Input id="code" name="code" required maxLength={20} dir="ltr" className="font-mono" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameAr">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label>
          <Input id="nameAr" name="nameAr" required maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nameEn">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label>
          <Input id="nameEn" name="nameEn" required maxLength={200} dir="ltr" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="parentId">{isAr ? "الحساب الأب" : "Parent account"}</Label>
          <select
            id="parentId"
            name="parentId"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">{isAr ? "بدون (حساب رئيسي)" : "None (top level)"}</option>
            {groupAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {isAr ? a.name_ar : a.name_en}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">{isAr ? "التصنيف" : "Category"}</Label>
          <select
            id="category"
            name="category"
            defaultValue="ASSET"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            {ACCOUNT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c, isAr)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="normalBalance">{isAr ? "الرصيد الطبيعي" : "Normal balance"}</Label>
          <select
            id="normalBalance"
            name="normalBalance"
            defaultValue="DEBIT"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="DEBIT">{isAr ? "مدين" : "Debit"}</option>
            <option value="CREDIT">{isAr ? "دائن" : "Credit"}</option>
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="cashFlowSection">
            {isAr ? "قسم قائمة التدفقات النقدية" : "Cash flow statement section"}
          </Label>
          <select
            id="cashFlowSection"
            name="cashFlowSection"
            defaultValue=""
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">{cashFlowSectionLabel(null, isAr)}</option>
            {CASH_FLOW_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {cashFlowSectionLabel(s, isAr)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            {isAr
              ? "الحسابات بلا قسم لا تظهر في قائمة التدفقات النقدية."
              : "Accounts with no section are omitted from the cash flow statement."}
          </p>
        </div>

        <label className="flex items-start gap-2.5 self-end pb-1 text-sm">
          <input type="checkbox" name="isCashEquivalent" className="mt-0.5 size-4" />
          {isAr ? "نقدية أو ما في حكمها" : "Cash or cash equivalent"}
        </label>

        <label className="flex items-start gap-2.5 text-sm sm:col-span-3">
          <input type="checkbox" name="isGroup" className="mt-0.5 size-4" />
          {isAr ? "حساب تجميعي (لا يُقيَّد عليه مباشرة)" : "Group account (not directly postable)"}
        </label>

        {!state.ok && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive sm:col-span-3"
          >
            {errorMessage(state.error, isAr)}
          </p>
        )}

        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? isAr
                ? "جارٍ الحفظ..."
                : "Saving..."
              : isAr
                ? "إضافة الحساب"
                : "Add account"}
          </Button>
        </div>
      </div>
    </form>
  );
}
