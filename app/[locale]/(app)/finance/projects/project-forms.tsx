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
  Building,
  HardHat,
  ArrowRightLeft,
  AlertCircle,
} from "lucide-react";
import {
  saveProject,
  capitaliseProjectCost,
  releaseProjectWip,
} from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/platform";

export type Option = { id: string; label: string };

function message(error: string, isAr: boolean) {
  if (error.includes("PROJECT_ACCOUNTS_NOT_SET")) {
    return isAr
      ? "عيّن حساب الأعمال تحت التنفيذ وحساب تكلفة المبيعات للمشروع أولًا — لن يختار النظام حسابًا نيابةً عنك."
      : "Designate the project's WIP and cost-of-sales accounts first. The system will not pick them for you.";
  }
  if (error.includes("PROJECT_RELEASE_EXCEEDS_WIP")) {
    return isAr
      ? `التحرير يتجاوز الرصيد المتراكم. ${error.split(":").slice(1).join(":").trim()}`
      : `That release exceeds what has accumulated. ${error.split(":").slice(1).join(":").trim()}`;
  }
  if (error.includes("PROJECT_NOT_OPEN")) {
    return isAr
      ? "المشروع مقفل أو ملغى، فلا تُرسمل عليه تكلفة جديدة."
      : "That project is completed or cancelled, so no new cost may be capitalised onto it.";
  }
  if (error.includes("NO_OPEN_FISCAL_PERIOD")) {
    return isAr ? "لا توجد فترة مالية مفتوحة تغطي هذا التاريخ." : "No open fiscal period covers that date.";
  }
  if (error.includes("projects_organization_id_code_key") || error.includes("projects_code")) {
    return isAr ? "كود المشروع مستخدم بالفعل." : "That project code is already in use.";
  }
  if (error.includes("FORBIDDEN") || error.includes("row-level security")) {
    return isAr ? "لا تملك صلاحية إدارة المشاريع." : "You don't have permission to manage projects.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات المدخلة." : "Check the values entered.";
  return error;
}

export function ProjectForm({
  open = true,
  onOpenChange,
  organizationId,
  assetAccounts,
  expenseAccounts,
  properties,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  organizationId?: string;
  assetAccounts: Option[];
  expenseAccounts: Option[];
  properties: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveProject,
    { ok: true }
  );

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
            <Building className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "إنشاء مشروع تطوير عقاري جديد" : "Create Real Estate Project"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "سجّل بيانات المشروع وموازنته التقديرية وحسابات الأعمال تحت التنفيذ (WIP)."
                : "Register project identifiers, budget targets, and dedicated WIP / Cost of Sales ledger accounts."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="prj-code" className="text-xs font-bold text-foreground">
                  {isAr ? "كود المشروع" : "Project Code"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="prj-code"
                  name="code"
                  required
                  placeholder="PRJ-01"
                  dir="ltr"
                  className="font-mono text-xs font-bold uppercase h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prj-ar" className="text-xs font-bold text-foreground">
                  {isAr ? "اسم المشروع بالعربية" : "Arabic Name"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="prj-ar"
                  name="nameAr"
                  required
                  placeholder={isAr ? "مثال: برج الواحة السكني" : "Oasis Tower"}
                  className="text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prj-en" className="text-xs font-bold text-foreground">
                  {isAr ? "الاسم بالإنجليزية" : "English Name"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="prj-en"
                  name="nameEn"
                  required
                  placeholder="Oasis Residential Tower"
                  dir="ltr"
                  className="text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="prj-wip" className="text-xs font-bold text-foreground">
                  {isAr ? "حساب الأعمال تحت التنفيذ (أصل)" : "WIP Account (Asset)"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="prj-wip"
                  name="wipAccountId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  <option value="">{isAr ? "— اختر حساب الأصل —" : "— Select WIP account —"}</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prj-cos" className="text-xs font-bold text-foreground">
                  {isAr ? "حساب تكلفة المبيعات (مصروف)" : "Cost of Sales (Expense)"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="prj-cos"
                  name="costOfSalesAccountId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  <option value="">{isAr ? "— اختر حساب التكلفة —" : "— Select Cost account —"}</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="prj-budget" className="text-xs font-bold text-foreground">
                  {isAr ? "الموازنة التقديرية" : "Budget Target"}
                </Label>
                <Input
                  id="prj-budget"
                  name="budgetAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="10000000.00"
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            {properties.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="prj-property" className="text-xs font-bold text-foreground">
                  {isAr ? "العقار أو المنتجع المرتبط" : "Linked Property"}
                </Label>
                <select
                  id="prj-property"
                  name="propertyId"
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  <option value="">{isAr ? "— بلا ربط عقاري محدد —" : "— None —"}</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
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
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-black shadow-xs press-feedback motion-control cursor-pointer"
            >
              {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ وتثبيت المشروع" : "Save Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CapitaliseForm({
  open = true,
  onOpenChange,
  projects,
  creditAccounts,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  projects: Option[];
  creditAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    capitaliseProjectCost,
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 shadow-xs">
            <HardHat className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "رسملة تكلفة تطوير على المشروع (WIP)" : "Capitalise Project Cost"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "ترحيل تكاليف الإنشاء والمقاولات إلى حساب الأعمال تحت التنفيذ للمشروع."
                : "Record development and contractor expenses directly into the project WIP asset account."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="cap-project" className="text-xs font-bold text-foreground">
                  {isAr ? "المشروع" : "Project"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="cap-project"
                  name="projectId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cap-amount" className="text-xs font-bold text-foreground">
                  {isAr ? "المبلغ" : "Amount"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="cap-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="250000.00"
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="cap-credit" className="text-xs font-bold text-foreground">
                  {isAr ? "حساب التمويل (الطرف الدائن)" : "Funded From (Credit Account)"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="cap-credit"
                  name="creditAccountId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {creditAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cap-date" className="text-xs font-bold text-foreground">
                  {isAr ? "التاريخ" : "Date"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="cap-date"
                  name="entryDate"
                  type="date"
                  defaultValue={today}
                  required
                  dir="ltr"
                  className="h-10 text-xs font-bold rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cap-desc" className="text-xs font-bold text-foreground">
                {isAr ? "البيان والوصف المحاسبي" : "Description"} <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="cap-desc"
                name="description"
                required
                placeholder={isAr ? "مثال: مستخلص أعمال خرسانة وهيكل إنشائي رقم 3" : "Concrete works invoice #3"}
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
              disabled={pending || projects.length === 0}
              className="rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-xs press-feedback motion-control cursor-pointer"
            >
              {pending ? (isAr ? "جارٍ الترحيل..." : "Posting...") : isAr ? "رسملة التكلفة" : "Capitalise Cost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseForm({
  open = true,
  onOpenChange,
  projects,
  locale,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  projects: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    releaseProjectWip,
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
            <ArrowRightLeft className="size-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-black text-foreground">
              {isAr ? "تحرير تكلفة المشروع إلى تكلفة المبيعات" : "Release WIP to Cost of Sales"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "تحويل جزء من رصيد WIP المتراكم إلى تكلفة المبيعات عند تسليم أو بيع الوحدات."
                : "Move accumulated project WIP to cost of sales as units are recognized."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form action={formAction}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="rel-project" className="text-xs font-bold text-foreground">
                  {isAr ? "المشروع والرصيد المتاح" : "Project & Balance"} <span className="text-rose-500">*</span>
                </Label>
                <select
                  id="rel-project"
                  name="projectId"
                  required
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer motion-control"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rel-amount" className="text-xs font-bold text-foreground">
                  {isAr ? "المبلغ المراد تحريره" : "Release Amount"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="rel-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="100000.00"
                  dir="ltr"
                  className="font-mono text-xs font-bold h-10 rounded-xl bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="rel-date" className="text-xs font-bold text-foreground">
                  {isAr ? "التاريخ" : "Date"} <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="rel-date"
                  name="entryDate"
                  type="date"
                  defaultValue={today}
                  required
                  dir="ltr"
                  className="h-10 text-xs font-bold rounded-xl bg-background border-border"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rel-desc" className="text-xs font-bold text-foreground">
                  {isAr ? "البيان" : "Description"}
                </Label>
                <Input
                  id="rel-desc"
                  name="description"
                  placeholder={isAr ? "مثال: تسليم 5 وحدات سكنية" : "5 units delivered"}
                  className="h-10 text-xs rounded-xl bg-background border-border"
                />
              </div>
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
              disabled={pending || projects.length === 0}
              className="rounded-xl bg-primary hover:bg-primary/90 text-xs font-black text-primary-foreground shadow-xs cursor-pointer press-feedback motion-control"
            >
              {pending ? (isAr ? "جارٍ التحويل..." : "Posting...") : isAr ? "تحرير إلى تكلفة المبيعات" : "Release Cost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
