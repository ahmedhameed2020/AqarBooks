"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeAllocations,
  createServiceChargeLevy,
  issueLevy,
  setAllocationWeight,
} from "@/lib/actions/service-charges";
import type { ActionResult } from "@/lib/actions/platform";

export type Option = { id: string; label: string };

function message(error: string, isAr: boolean) {
  if (error.includes("SERVICE_CHARGE_MISSING_AREA")) {
    const n = error.match(/:\s*(\d+)/)?.[1] ?? "";
    return isAr
      ? `${n} وحدة بلا مساحة مسجّلة. التوزيع بالمساحة يتطلب مساحة كل وحدة — سجّل المساحات الناقصة أو استخدم أساسًا آخر. لم تُوزَّع أي مبالغ.`
      : `${n} unit(s) have no recorded area. Area-based allocation needs every unit's area — record the missing ones or pick another basis. Nothing was allocated.`;
  }
  if (error.includes("SERVICE_CHARGE_ZERO_BASIS")) {
    return isAr
      ? "مجموع أوزان التوزيع صفر، فلا يمكن قسمة المبلغ."
      : "The allocation weights sum to zero, so the amount cannot be divided.";
  }
  if (error.includes("SERVICE_CHARGE_NOT_BALANCED")) {
    return isAr
      ? "مجموع الأنصبة لا يساوي إجمالي التحصيلة. أعد حساب التوزيع قبل الإصدار."
      : "The shares don't sum to the levy total. Recompute the allocation before issuing.";
  }
  if (error.includes("SERVICE_CHARGE_LEVY_NOT_DRAFT")) {
    return isAr ? "التحصيلة صادرة بالفعل." : "This levy has already been issued.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr ? "لا تملك صلاحية تنفيذ هذا الإجراء." : "You don't have permission for this action.";
  }
  if (error === "period_order") {
    return isAr ? "نهاية الفترة قبل بدايتها." : "Period end precedes its start.";
  }
  if (error === "due_order") {
    return isAr ? "تاريخ الاستحقاق قبل تاريخ الإصدار." : "Due date precedes the issue date.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function CreateLevyForm({
  organizationId,
  properties,
  dueTypes,
  receivableAccounts,
  locale,
}: {
  organizationId: string;
  properties: Option[];
  dueTypes: Option[];
  receivableAccounts: Option[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createServiceChargeLevy,
    { ok: true },
  );

  const missing =
    properties.length === 0 || dueTypes.length === 0 || receivableAccounts.length === 0;
  if (missing) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {isAr
          ? "تحتاج عقارًا واحدًا على الأقل، ونوع مستحق، وحساب ذمم مدينة قبل إنشاء تحصيلة رسوم خدمة."
          : "You need at least one property, a due type, and a receivable account before creating a service charge levy."}
      </p>
    );
  }

  const select = "w-full rounded-md border border-input bg-transparent p-2 text-sm";

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">{isAr ? "اسم التحصيلة" : "Levy name"}</Label>
        <Input id="name" name="name" required placeholder={isAr ? "رسوم صيانة الربع الأول 2026" : "Q1 2026 service charge"} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="propertyId">{isAr ? "العقار" : "Property"}</Label>
        <select id="propertyId" name="propertyId" required className={select}>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="periodStart">{isAr ? "بداية الفترة" : "Period start"}</Label>
        <Input id="periodStart" name="periodStart" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="periodEnd">{isAr ? "نهاية الفترة" : "Period end"}</Label>
        <Input id="periodEnd" name="periodEnd" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="totalAmount">{isAr ? "إجمالي المبلغ المطلوب تحصيله" : "Total amount to recover"}</Label>
        <Input id="totalAmount" name="totalAmount" type="number" step="0.01" min="0.01" required className="tabular-nums" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="allocationBasis">{isAr ? "أساس التوزيع" : "Allocation basis"}</Label>
        <select id="allocationBasis" name="allocationBasis" required defaultValue="AREA" className={select}>
          <option value="AREA">{isAr ? "بالمساحة" : "By area"}</option>
          <option value="EQUAL">{isAr ? "بالتساوي" : "Equal shares"}</option>
          <option value="CUSTOM">{isAr ? "أوزان مخصصة" : "Custom weights"}</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueTypeId">{isAr ? "نوع المستحق" : "Due type"}</Label>
        <select id="dueTypeId" name="dueTypeId" required className={select}>
          {dueTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="receivableAccountId">{isAr ? "حساب الذمم المدينة" : "Receivable account"}</Label>
        <select id="receivableAccountId" name="receivableAccountId" required className={select}>
          {receivableAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="issueDate">{isAr ? "تاريخ الإصدار" : "Issue date"}</Label>
        <Input id="issueDate" name="issueDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dueDate">{isAr ? "تاريخ الاستحقاق" : "Due date"}</Label>
        <Input id="dueDate" name="dueDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="note">{isAr ? "ملاحظة" : "Note"}</Label>
        <Input id="note" name="note" />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {pending ? (isAr ? "جارٍ الإنشاء…" : "Creating…") : isAr ? "إنشاء كمسودة" : "Create as draft"}
        </Button>
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function ComputeForm({ levyId, locale }: { levyId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(computeAllocations, {
    ok: true,
  });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="levyId" value={levyId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? (isAr ? "جارٍ الحساب…" : "Computing…") : isAr ? "حساب التوزيع" : "Compute allocation"}
      </Button>
      <Err state={state} isAr={isAr} />
    </form>
  );
}

export function IssueForm({
  levyId,
  balanced,
  locale,
}: {
  levyId: string;
  balanced: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(issueLevy, {
    ok: true,
  });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="levyId" value={levyId} />
      <Button type="submit" disabled={pending || !balanced}>
        {pending
          ? isAr
            ? "جارٍ الإصدار…"
            : "Issuing…"
          : isAr
            ? "إصدار على الوحدات"
            : "Issue to units"}
      </Button>
      {!balanced && (
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "الإصدار متاح بعد أن يتطابق مجموع الأنصبة مع إجمالي التحصيلة."
            : "Issuing unlocks once the shares sum to the levy total."}
        </p>
      )}
      <Err state={state} isAr={isAr} />
    </form>
  );
}

export function WeightForm({
  allocationId,
  value,
  locale,
}: {
  allocationId: string;
  value: number;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(setAllocationWeight, {
    ok: true,
  });

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="allocationId" value={allocationId} />
      <Input
        name="basisValue"
        type="number"
        step="0.0001"
        min="0"
        defaultValue={value}
        className="h-8 w-24 tabular-nums"
      />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {isAr ? "حفظ" : "Save"}
      </Button>
      <Err state={state} isAr={isAr} />
    </form>
  );
}
