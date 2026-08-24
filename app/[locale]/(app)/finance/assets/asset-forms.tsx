"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Play,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
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
  if (
    error.includes("DISPOSAL_ACCOUNTS_NOT_SET") ||
    error.includes("DISPOSAL_GAIN_ACCOUNT_NOT_SET") ||
    error.includes("DISPOSAL_LOSS_ACCOUNT_NOT_SET")
  ) {
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

export function RegisterAssetForm({
  open = true,
  onOpenChange,
  assetAccounts,
  deprAccounts,
  accumulatedAccounts,
  expenseAccounts,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  assetAccounts: Option[];
  deprAccounts?: Option[];
  accumulatedAccounts?: Option[];
  expenseAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createFixedAsset,
    { ok: true }
  );

  const accumList = deprAccounts || accumulatedAccounts || [];

  const submitted = useRef(false);
  if (pending) submitted.current = true;

  useEffect(() => {
    if (submitted.current && !pending && state.ok && onOpenChange) {
      onOpenChange(false);
      submitted.current = false;
    }
  }, [state, pending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <Building2 className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "تسجيل أصل ثابت جديد" : "Register Fixed Asset"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "سجّل بيانات الأصل الثابت، التكلفة التاريخية، ومعدلات الإهلاك بالقسط الثابت."
                : "Record asset cost, acquisition date, and straight-line depreciation accounts."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="asset-code" className="text-xs font-bold text-foreground">
                  {isAr ? "كود الأصل" : "Asset Code"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-code"
                  name="code"
                  required
                  placeholder="FA-001"
                  dir="ltr"
                  className="font-mono text-xs font-bold uppercase h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-ar" className="text-xs font-bold text-foreground">
                  {isAr ? "الاسم بالعربية" : "Arabic Name"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-ar"
                  name="nameAr"
                  required
                  placeholder={isAr ? "مثال: مبنى الإدارة الرئيسي" : "Main Office Building"}
                  className="text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-en" className="text-xs font-bold text-foreground">
                  {isAr ? "الاسم بالإنجليزية" : "English Name"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-en"
                  name="nameEn"
                  required
                  placeholder="HQ Office Building"
                  dir="ltr"
                  className="text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="asset-cost" className="text-xs font-bold text-foreground">
                  {isAr ? "تكلفة الاقتناء" : "Acquisition Cost"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-cost"
                  name="acquisitionCost"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="500000.00"
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-salvage" className="text-xs font-bold text-foreground">
                  {isAr ? "القيمة التخريدية" : "Salvage Value"}
                </Label>
                <Input
                  id="asset-salvage"
                  name="salvageValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-life" className="text-xs font-bold text-foreground">
                  {isAr ? "العمر الإنتاجي (شهراً)" : "Useful Life (Months)"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-life"
                  name="usefulLifeMonths"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="60"
                  required
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="asset-date" className="text-xs font-bold text-foreground">
                  {isAr ? "تاريخ الاقتناء" : "Acquisition Date"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="asset-date"
                  name="acquisitionDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  dir="ltr"
                  className="text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-account" className="text-xs font-bold text-foreground">
                  {isAr ? "حساب الأصل" : "Asset Account"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="asset-account"
                  name="assetAccountId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="asset-accum" className="text-xs font-bold text-foreground">
                  {isAr ? "مجمع الإهلاك" : "Accumulated Account"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="asset-accum"
                  name="accumulatedAccountId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {accumList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-expense" className="text-xs font-bold text-foreground">
                {isAr ? "حساب مصروف الإهلاك الدوري" : "Depreciation Expense Account"} <span className="text-rose-500">*</span>
              </Label>
              <select
                id="asset-expense"
                name="expenseAccountId"
                required
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
              >
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            {!state.ok && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{message(state.error, isAr)}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs press-feedback motion-control cursor-pointer"
            >
              {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "تسجيل وتثبيت الأصل" : "Register Asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RunDepreciationForm({
  open = true,
  onOpenChange,
  periods,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  periods: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    runDepreciation,
    { ok: true }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 shadow-xs">
            <Play className="size-4.5 fill-current" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "احتساب وترحيل الإهلاك الدوري" : "Run Periodic Depreciation"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "سيقوم النظام باحتساب الإهلاك لكل الأصول النشطة وتوليد القيود اليومية في الفترة المالية المفتوحة."
                : "Straight-line depreciation will be calculated and posted to the general ledger for the selected open period."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dep-period" className="text-xs font-bold text-foreground">
                {isAr ? "الفترة المالية المفتوحة" : "Open Fiscal Period"} <span className="text-rose-500">*</span>
              </Label>
              <select
                id="dep-period"
                name="fiscalPeriodId"
                required
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {state.ok === true && state.id !== undefined && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {state.id === "0"
                    ? isAr
                      ? "لا توجد أصول تحتاج ترحيل — الفترة مُرحَّلة بالفعل."
                      : "Nothing to post — this period is already up to date."
                    : isAr
                    ? `تم ترحيل إهلاك ${state.id} أصل بنجاح إلى الدفاتر.`
                    : `Successfully posted depreciation for ${state.id} assets.`}
                </span>
              </div>
            )}

            {!state.ok && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{message(state.error, isAr)}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control"
              >
                {isAr ? "إغلاق" : "Close"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending || periods.length === 0}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs gap-1.5 press-feedback motion-control cursor-pointer"
            >
              <Play className="size-3.5 fill-white" />
              <span>{pending ? (isAr ? "جارٍ الترحيل..." : "Posting...") : isAr ? "ترحيل الإهلاك" : "Run Depreciation"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DisposeAssetForm({
  open = true,
  onOpenChange,
  assetId,
  assetCode,
  assetName,
  gainAccounts,
  lossAccounts,
  periods,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  assetId: string;
  assetCode: string;
  assetName: string;
  gainAccounts?: Option[];
  lossAccounts?: Option[];
  periods?: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    disposeAsset,
    { ok: true }
  );

  const today = new Date().toISOString().slice(0, 10);

  const submitted = useRef(false);
  if (pending) submitted.current = true;

  useEffect(() => {
    if (submitted.current && !pending && state.ok && onOpenChange) {
      onOpenChange(false);
      submitted.current = false;
    }
  }, [state, pending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 shadow-xs">
            <Trash2 className="size-4.5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "استبعاد / تخريد أصل ثابت" : "Dispose / Retire Asset"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? `سيتم استبعاد الأصل (${assetCode} · ${assetName}) وإقفال مجمع إهلاكه وإثبات الأرباح أو الخسائر الناتجة.`
                : `Retire asset ${assetCode} and post the net book value gain or loss.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <input type="hidden" name="assetId" value={assetId} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="dispose-date" className="text-xs font-bold text-foreground">
                  {isAr ? "تاريخ الاستبعاد" : "Disposal Date"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="dispose-date"
                  name="disposalDate"
                  type="date"
                  defaultValue={today}
                  required
                  dir="ltr"
                  className="h-10 text-xs font-bold rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dispose-proceeds" className="text-xs font-bold text-foreground">
                  {isAr ? "متحصلات البيع (إن وجدت)" : "Sales Proceeds"}
                </Label>
                <Input
                  id="dispose-proceeds"
                  name="proceeds"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  required
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
                <span className="text-[10px] text-muted-foreground block">
                  {isAr ? "0 = تخريد بدون عائد مالي" : "0 = Scrapped with zero proceeds"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dispose-reason" className="text-xs font-bold text-foreground">
                {isAr ? "سبب الاستبعاد أو التخريد" : "Reason / Note"}
              </Label>
              <Input
                id="dispose-reason"
                name="reason"
                placeholder={isAr ? "مثال: بيع، تلف غير قابل للإصلاح، استبدال" : "e.g. Sold or obsolete"}
                className="h-10 text-xs rounded-xl bg-background border-border"
              />
            </div>

            {!state.ok && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300"
              >
                <AlertCircle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{message(state.error, isAr)}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold border-border hover:bg-muted text-foreground press-feedback motion-control"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs press-feedback motion-control cursor-pointer"
            >
              {pending ? (isAr ? "جارٍ الاستبعاد..." : "Disposing...") : isAr ? "تأكيد الاستبعاد" : "Confirm Disposal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
