"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFixedAsset, runDepreciation } from "@/lib/actions/fixed-assets";
import type { ActionResult } from "@/lib/actions/platform";

export type Option = { id: string; label: string };

function message(error: string, isAr: boolean) {
  if (error.includes("fixed_assets_salvage_below_cost")) {
    return isAr
      ? "القيمة التخريدية يجب أن تقل عن التكلفة — الأصل الذي تساوي تخريديته تكلفته غير قابل للإهلاك."
      : "Salvage must be below cost: an asset whose salvage equals its cost has nothing to depreciate.";
  }
  if (error.includes("fixed_assets_code_unique")) {
    return isAr ? "كود الأصل مستخدم بالفعل." : "That asset code is already in use.";
  }
  if (error.includes("fixed_assets_life_positive")) {
    return isAr ? "العمر الإنتاجي بالأشهر يجب أن يكون أكبر من صفر." : "Useful life must be greater than zero months.";
  }
  if (error.includes("FISCAL_PERIOD_NOT_OPEN")) {
    return isAr
      ? "الفترة مقفلة، فلا يمكن ترحيل الإهلاك إليها. افتحها أولًا أو اختر فترة أخرى."
      : "That period is closed, so nothing can be posted into it. Reopen it or choose another.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr ? "لا تملك صلاحية إدارة الأصول الثابتة." : "You don't have permission to manage fixed assets.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات المدخلة." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return (
    <p role="alert" className="text-sm text-destructive sm:col-span-6">
      {message(state.error, isAr)}
    </p>
  );
}

export function RegisterAssetForm({
  organizationId,
  assetAccounts,
  accumulatedAccounts,
  expenseAccounts,
  locale,
}: {
  organizationId: string;
  assetAccounts: Option[];
  accumulatedAccounts: Option[];
  expenseAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createFixedAsset,
    { ok: true },
  );
  const select =
    "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-6">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-code" className="text-xs">{isAr ? "الكود" : "Code"}</Label>
        <Input id="asset-code" name="code" required placeholder="FA-001" dir="ltr" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-ar" className="text-xs">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label>
        <Input id="asset-ar" name="nameAr" required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-en" className="text-xs">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label>
        <Input id="asset-en" name="nameEn" required />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-cost" className="text-xs">{isAr ? "التكلفة" : "Cost"}</Label>
        <Input id="asset-cost" name="acquisitionCost" type="number" step="0.01" min="0.01" required dir="ltr" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-salvage" className="text-xs">
          {isAr ? "القيمة التخريدية" : "Salvage value"}
        </Label>
        <Input id="asset-salvage" name="salvageValue" type="number" step="0.01" min="0" defaultValue="0" dir="ltr" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-life" className="text-xs">
          {isAr ? "العمر الإنتاجي (شهرًا)" : "Useful life (months)"}
        </Label>
        <Input id="asset-life" name="usefulLifeMonths" type="number" min="1" step="1" required dir="ltr" />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-date" className="text-xs">{isAr ? "تاريخ الاقتناء" : "Acquisition date"}</Label>
        <Input id="asset-date" name="acquisitionDate" type="date" required dir="ltr" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-account" className="text-xs">{isAr ? "حساب الأصل" : "Asset account"}</Label>
        <select id="asset-account" name="assetAccountId" required className={select}>
          {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="asset-accum" className="text-xs">
          {isAr ? "حساب مجمع الإهلاك" : "Accumulated depreciation"}
        </Label>
        <select id="asset-accum" name="accumulatedAccountId" required className={select}>
          {accumulatedAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-3">
        <Label htmlFor="asset-expense" className="text-xs">
          {isAr ? "حساب مصروف الإهلاك" : "Depreciation expense account"}
        </Label>
        <select id="asset-expense" name="expenseAccountId" required className={select}>
          {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="flex items-end sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ…" : "Saving…") : isAr ? "تسجيل الأصل" : "Register asset"}
        </Button>
      </div>

      <Err state={state} isAr={isAr} />
    </form>
  );
}

export function RunDepreciationForm({
  organizationId,
  periods,
  locale,
}: {
  organizationId: string;
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    runDepreciation,
    { ok: true },
  );
  const select =
    "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5 min-w-56">
        <Label htmlFor="dep-period" className="text-xs">
          {isAr ? "الفترة المالية" : "Fiscal period"}
        </Label>
        <select id="dep-period" name="fiscalPeriodId" required className={select}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <Button type="submit" size="sm" disabled={pending || periods.length === 0}>
        {pending ? (isAr ? "جارٍ الترحيل…" : "Posting…") : isAr ? "ترحيل الإهلاك" : "Run depreciation"}
      </Button>

      {/* A run that posts nothing is a SUCCESS, not a failure: closing a month
          in two passes is normal and the second pass must be a no-op. Saying
          "posted 0" plainly is what stops an operator running it again. */}
      {state.ok === true && state.id !== undefined && (
        <p data-run-result={state.id} className="text-sm text-muted-foreground">
          {state.id === "0"
            ? isAr ? "لا شيء للترحيل — الفترة مُرحَّلة بالفعل." : "Nothing to post — this period is already done."
            : isAr ? `رُحِّل ${state.id} أصلًا.` : `Posted ${state.id} asset(s).`}
        </p>
      )}
      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive">{message(state.error, isAr)}</p>
      )}
    </form>
  );
}
