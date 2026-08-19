"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFixedAsset, runDepreciation, disposeAsset } from "@/lib/actions/fixed-assets";
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
  if (error.includes("DISPOSAL_ACCOUNTS_NOT_SET") || error.includes("DISPOSAL_GAIN_ACCOUNT_NOT_SET") || error.includes("DISPOSAL_LOSS_ACCOUNT_NOT_SET")) {
    return isAr
      ? "عيّن حسابي أرباح وخسائر الاستبعاد أولًا (الإدارة ← الحسابات المعيَّنة) — لن يختار النظام حسابًا نيابةً عنك."
      : "Designate the disposal gain and loss accounts first (Admin → Designated Accounts). The system will not pick one for you.";
  }
  if (error.includes("ASSET_ALREADY_DISPOSED")) {
    return isAr ? "هذا الأصل مستبعَد بالفعل." : "That asset has already been disposed of.";
  }
  if (error.includes("DISPOSAL_BEFORE_ACQUISITION")) {
    return isAr ? "تاريخ الاستبعاد قبل تاريخ الاقتناء." : "The disposal date is before the acquisition date.";
  }
  if (error.includes("NO_OPEN_FISCAL_PERIOD")) {
    return isAr
      ? "لا توجد فترة مالية مفتوحة تغطي تاريخ الاستبعاد."
      : "No open fiscal period covers that disposal date.";
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


export function DisposeAssetForm({
  assets,
  cashAccounts,
  locale,
}: {
  assets: { id: string; label: string }[];
  cashAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    disposeAsset,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);
  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="dispose-asset" className="text-xs">{isAr ? "الأصل" : "Asset"}</Label>
        <select id="dispose-asset" name="assetId" required className={select}>
          {assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispose-date" className="text-xs">{isAr ? "تاريخ الاستبعاد" : "Disposal date"}</Label>
        <Input id="dispose-date" name="disposalDate" type="date" defaultValue={today} required dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispose-proceeds" className="text-xs">{isAr ? "المتحصلات" : "Proceeds"}</Label>
        <Input id="dispose-proceeds" name="proceeds" type="number" step="0.01" min="0" defaultValue="0" required dir="ltr" />
        {/* Zero is a real answer, not a placeholder: scrapping yields nothing
            and books the whole remaining book value as a loss. */}
        <p className="text-[11px] text-muted-foreground">
          {isAr ? "صفر = خردة بلا عائد" : "Zero = scrapped for nothing"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dispose-account" className="text-xs">
          {isAr ? "حساب المتحصلات" : "Proceeds account"}
        </Label>
        <select id="dispose-account" name="proceedsAccountId" required className={select}>
          {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="space-y-1.5 sm:col-span-4">
        <Label htmlFor="dispose-reason" className="text-xs">{isAr ? "السبب" : "Reason"}</Label>
        <Input id="dispose-reason" name="reason" placeholder={isAr ? "بيع / خردة" : "Sold / scrapped"} />
      </div>

      <div className="flex items-end">
        <Button type="submit" size="sm" variant="destructive" disabled={pending || assets.length === 0}>
          {pending ? (isAr ? "جارٍ…" : "Disposing…") : isAr ? "استبعاد" : "Dispose"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-5">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}
