"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    // The database message carries both numbers, which is the useful part.
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
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

export function ProjectForm({
  organizationId,
  assetAccounts,
  expenseAccounts,
  properties,
  locale,
}: {
  organizationId: string;
  assetAccounts: Option[];
  expenseAccounts: Option[];
  properties: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveProject,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-6">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-code" className="text-xs">{isAr ? "الكود" : "Code"}</Label>
        <Input id="prj-code" name="code" required placeholder="TOWER-A" dir="ltr" />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-ar" className="text-xs">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label>
        <Input id="prj-ar" name="nameAr" required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-en" className="text-xs">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label>
        <Input id="prj-en" name="nameEn" required />
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-wip" className="text-xs">
          {isAr ? "حساب الأعمال تحت التنفيذ (أصل)" : "WIP account (asset)"}
        </Label>
        <select id="prj-wip" name="wipAccountId" className={selectClass}>
          <option value="">{isAr ? "— غير معيَّن —" : "— not set —"}</option>
          {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-cos" className="text-xs">
          {isAr ? "حساب تكلفة المبيعات (مصروف)" : "Cost of sales (expense)"}
        </Label>
        <select id="prj-cos" name="costOfSalesAccountId" className={selectClass}>
          <option value="">{isAr ? "— غير معيَّن —" : "— not set —"}</option>
          {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="prj-budget" className="text-xs">
          {isAr ? "الموازنة (اختيارية)" : "Budget (optional)"}
        </Label>
        <Input id="prj-budget" name="budgetAmount" type="number" step="0.01" min="0.01" dir="ltr" />
      </div>

      {properties.length > 0 && (
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="prj-property" className="text-xs">{isAr ? "العقار" : "Property"}</Label>
          <select id="prj-property" name="propertyId" className={selectClass}>
            <option value="">{isAr ? "— بلا —" : "— none —"}</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      )}

      <div className="flex items-end sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ…" : "Saving…") : isAr ? "حفظ المشروع" : "Save project"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-6">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}

export function CapitaliseForm({
  projects,
  creditAccounts,
  locale,
}: {
  projects: Option[];
  creditAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    capitaliseProjectCost,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-5">
      <div className="space-y-1.5">
        <Label htmlFor="cap-project" className="text-xs">{isAr ? "المشروع" : "Project"}</Label>
        <select id="cap-project" name="projectId" required className={selectClass}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cap-amount" className="text-xs">{isAr ? "المبلغ" : "Amount"}</Label>
        <Input id="cap-amount" name="amount" type="number" step="0.01" min="0.01" required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cap-credit" className="text-xs">
          {isAr ? "الطرف الدائن" : "Funded from"}
        </Label>
        <select id="cap-credit" name="creditAccountId" required className={selectClass}>
          {creditAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cap-date" className="text-xs">{isAr ? "التاريخ" : "Date"}</Label>
        <Input id="cap-date" name="entryDate" type="date" defaultValue={today} required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cap-desc" className="text-xs">{isAr ? "البيان" : "Description"}</Label>
        <Input id="cap-desc" name="description" required placeholder={isAr ? "خرسانة" : "Concrete"} />
      </div>

      <div className="flex items-end sm:col-span-5">
        <Button type="submit" size="sm" disabled={pending || projects.length === 0}>
          {pending ? (isAr ? "جارٍ…" : "Posting…") : isAr ? "رسملة التكلفة" : "Capitalise cost"}
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

export function ReleaseForm({
  projects,
  locale,
}: {
  projects: { id: string; label: string; balance: number }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    releaseProjectWip,
    { ok: true },
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-4">
      <div className="space-y-1.5">
        <Label htmlFor="rel-project" className="text-xs">{isAr ? "المشروع" : "Project"}</Label>
        {/* The accumulated balance is inside each label, so the operator sees
            the ceiling before choosing rather than after being refused. */}
        <select id="rel-project" name="projectId" required className={selectClass}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rel-amount" className="text-xs">{isAr ? "المبلغ" : "Amount"}</Label>
        <Input id="rel-amount" name="amount" type="number" step="0.01" min="0.01" required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rel-date" className="text-xs">{isAr ? "التاريخ" : "Date"}</Label>
        <Input id="rel-date" name="entryDate" type="date" defaultValue={today} required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rel-desc" className="text-xs">{isAr ? "البيان" : "Description"}</Label>
        <Input id="rel-desc" name="description" placeholder={isAr ? "بيع 10 وحدات" : "10 units sold"} />
      </div>

      <div className="flex items-end sm:col-span-4">
        <Button type="submit" size="sm" variant="secondary" disabled={pending || projects.length === 0}>
          {pending
            ? isAr ? "جارٍ…" : "Posting…"
            : isAr ? "تحرير إلى تكلفة المبيعات" : "Release to cost of sales"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}
