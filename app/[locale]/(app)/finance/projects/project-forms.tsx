"use client";

import { useActionState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Coins,
  Calendar,
  CheckCircle2,
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

  useEffect(() => {
    if (state.ok && state.id && onOpenChange) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Building className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "إنشاء مشروع تطوير عقاري جديد" : "Create Real Estate Project"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? "سجّل بيانات المشروع وموازنته التقديرية وحسابات الأعمال تحت التنفيذ (WIP)."
              : "Register project identifiers, budget targets, and dedicated WIP / Cost of Sales ledger accounts."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="prj-code" className="text-xs font-bold text-slate-700">
                {isAr ? "كود المشروع" : "Project Code"}
              </Label>
              <Input
                id="prj-code"
                name="code"
                required
                placeholder="PRJ-01"
                dir="ltr"
                className="font-mono text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prj-ar" className="text-xs font-bold text-slate-700">
                {isAr ? "اسم المشروع بالعربية" : "Arabic Name"}
              </Label>
              <Input
                id="prj-ar"
                name="nameAr"
                required
                placeholder={isAr ? "برج الواحة السكني" : "Oasis Tower"}
                className="text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prj-en" className="text-xs font-bold text-slate-700">
                {isAr ? "الاسم بالإنجليزية" : "English Name"}
              </Label>
              <Input
                id="prj-en"
                name="nameEn"
                required
                placeholder="Oasis Residential Tower"
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="prj-wip" className="text-xs font-bold text-slate-700">
                {isAr ? "حساب الأعمال تحت التنفيذ (أصل)" : "WIP Account (Asset)"}
              </Label>
              <select
                id="prj-wip"
                name="wipAccountId"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
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
              <Label htmlFor="prj-cos" className="text-xs font-bold text-slate-700">
                {isAr ? "حساب تكلفة المبيعات (مصروف)" : "Cost of Sales (Expense)"}
              </Label>
              <select
                id="prj-cos"
                name="costOfSalesAccountId"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
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
              <Label htmlFor="prj-budget" className="text-xs font-bold text-slate-700">
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
                className="font-mono text-sm rounded-xl"
              />
            </div>
          </div>

          {properties.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="prj-property" className="text-xs font-bold text-slate-700">
                {isAr ? "العقار أو المنتجع المرتبط" : "Linked Property"}
              </Label>
              <select
                id="prj-property"
                name="propertyId"
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
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
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ المشروع" : "Save Project"}
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

  useEffect(() => {
    if (state.ok && state.id && onOpenChange) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <HardHat className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "رسملة تكلفة تطوير على المشروع (WIP)" : "Capitalise Project Cost"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? "ترحيل تكاليف الإنشاء والمقاولات إلى حساب الأعمال تحت التنفيذ للمشروع."
              : "Record development and contractor expenses directly into the project WIP asset account."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="cap-project" className="text-xs font-bold text-slate-700">
                {isAr ? "المشروع" : "Project"}
              </Label>
              <select
                id="cap-project"
                name="projectId"
                required
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cap-amount" className="text-xs font-bold text-slate-700">
                {isAr ? "المبلغ" : "Amount"}
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
                className="font-mono text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="cap-credit" className="text-xs font-bold text-slate-700">
                {isAr ? "حساب التمويل (الطرف الدائن)" : "Funded From (Credit Account)"}
              </Label>
              <select
                id="cap-credit"
                name="creditAccountId"
                required
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
              >
                {creditAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cap-date" className="text-xs font-bold text-slate-700">
                {isAr ? "التاريخ" : "Date"}
              </Label>
              <Input
                id="cap-date"
                name="entryDate"
                type="date"
                defaultValue={today}
                required
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cap-desc" className="text-xs font-bold text-slate-700">
              {isAr ? "البيان والوصف المحاسبي" : "Description"}
            </Label>
            <Input
              id="cap-desc"
              name="description"
              required
              placeholder={isAr ? "مستخلص أعمال خرسانة وهيكل إنشائي رقم 3" : "Concrete works invoice #3"}
              className="text-sm rounded-xl"
            />
          </div>

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending || projects.length === 0}
              className="rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700"
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

  useEffect(() => {
    if (state.ok && state.id && onOpenChange) {
      onOpenChange(false);
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
              <ArrowRightLeft className="size-4.5" />
            </div>
            <DialogTitle className="text-lg font-black text-slate-900">
              {isAr ? "تحرير تكلفة المشروع إلى تكلفة المبيعات" : "Release WIP to Cost of Sales"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            {isAr
              ? "تحويل جزء من رصيد WIP المتراكم إلى تكلفة المبيعات عند تسليم أو بيع الوحدات."
              : "Move accumulated project WIP to cost of sales as units are recognized."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="rel-project" className="text-xs font-bold text-slate-700">
                {isAr ? "المشروع والرصيد المتاح" : "Project & Balance"}
              </Label>
              <select
                id="rel-project"
                name="projectId"
                required
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rel-amount" className="text-xs font-bold text-slate-700">
                {isAr ? "المبلغ المراد تحريره" : "Release Amount"}
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
                className="font-mono text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="rel-date" className="text-xs font-bold text-slate-700">
                {isAr ? "التاريخ" : "Date"}
              </Label>
              <Input
                id="rel-date"
                name="entryDate"
                type="date"
                defaultValue={today}
                required
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rel-desc" className="text-xs font-bold text-slate-700">
                {isAr ? "البيان" : "Description"}
              </Label>
              <Input
                id="rel-desc"
                name="description"
                placeholder={isAr ? "تسليم 5 وحدات سكنية" : "5 units delivered"}
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <span>{message(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            {onOpenChange && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
            )}
            <Button
              type="submit"
              disabled={pending || projects.length === 0}
              className="rounded-xl bg-purple-600 text-xs font-bold text-white hover:bg-purple-700"
            >
              {pending ? (isAr ? "جارٍ التحويل..." : "Posting...") : isAr ? "تحرير إلى تكلفة المبيعات" : "Release Cost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
