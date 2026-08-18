"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setDueTypeRevenueNature,
  approveDueTypeRevenueNature,
  revokeDueTypeRevenueNatureApproval,
} from "@/lib/actions/tax-mapping";
import type { ActionResult } from "@/lib/actions/platform";

export type NatureOption = {
  code: string;
  label: string;
  /** المشتق يرث التوريد الأصلي، فلا يُختار كطبيعة مباشرة لنوع مستحق. */
  isDerived: boolean;
};

function message(error: string, isAr: boolean) {
  if (error.includes("FORBIDDEN_TAX_MAPPING")) {
    return isAr
      ? "لا تملك صلاحية إدارة ربط أنواع المستحقات."
      : "You don't have permission to manage due type mappings.";
  }
  if (error.includes("TAX_MAPPING_ALREADY_APPROVED")) {
    return isAr ? "الربط معتمد بالفعل." : "This mapping is already approved.";
  }
  if (error.includes("TAX_MAPPING_NOT_APPROVED")) {
    return isAr ? "الربط ليس معتمدًا." : "This mapping is not approved.";
  }
  if (error.includes("REVENUE_NATURE_UNKNOWN")) {
    return isAr ? "طبيعة إيراد غير معروفة." : "Unknown revenue nature.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function MappingForm({
  dueTypeId,
  currentNature,
  currentNotes,
  natures,
  locale,
}: {
  dueTypeId: string;
  currentNature: string | null;
  currentNotes: string | null;
  natures: NatureOption[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setDueTypeRevenueNature,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input type="hidden" name="dueTypeId" value={dueTypeId} />

      <div className="space-y-1.5">
        <Label htmlFor={`nature-${dueTypeId}`} className="text-xs">
          {isAr ? "طبيعة الإيراد" : "Revenue nature"}
        </Label>
        <select
          id={`nature-${dueTypeId}`}
          name="revenueNature"
          defaultValue={currentNature ?? ""}
          required
          className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
        >
          <option value="" disabled>
            {isAr ? "— اختر —" : "— Select —"}
          </option>
          {natures.map((n) => (
            // المشتق معروض ومعطَّل: إخفاؤه يجعل غيابه يبدو سهوًا، وعرضه معطَّلًا
            // يقول إن النوع موجود وإن اختياره هنا ليس هو الطريق.
            <option key={n.code} value={n.code} disabled={n.isDerived}>
              {n.label}
              {n.isDerived ? (isAr ? " (يرث الأصل)" : " (inherits)") : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`notes-${dueTypeId}`} className="text-xs">
          {isAr ? "مستند أو مرجع" : "Reference"}
        </Label>
        <Input
          id={`notes-${dueTypeId}`}
          name="notes"
          defaultValue={currentNotes ?? ""}
          placeholder={isAr ? "العقد أو إفادة المستشار" : "Contract or advisor note"}
        />
      </div>

      <div className="flex items-end">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? (isAr ? "جارٍ…" : "Saving…") : isAr ? "حفظ الربط" : "Save mapping"}
        </Button>
      </div>

      <div className="sm:col-span-3">
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function ApproveButton({
  mappingId,
  locale,
}: {
  mappingId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    approveDueTypeRevenueNature,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="mappingId" value={mappingId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? (isAr ? "جارٍ…" : "Approving…") : isAr ? "اعتماد الربط" : "Approve mapping"}
      </Button>
      <span className="text-xs text-muted-foreground">
        {isAr
          ? "الاعتماد إقرار بأن هذه هي الطبيعة الصحيحة للمعاملة، لا مجرد حفظ."
          : "Approving asserts this is the correct nature for the transaction, not merely saving it."}
      </span>
      <Err state={state} isAr={isAr} />
    </form>
  );
}

export function RevokeButton({
  mappingId,
  locale,
}: {
  mappingId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    revokeDueTypeRevenueNatureApproval,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="mappingId" value={mappingId} />
      <div className="space-y-1.5">
        <Label htmlFor={`reason-${mappingId}`} className="text-xs">
          {isAr ? "سبب السحب" : "Reason"}
        </Label>
        <Input id={`reason-${mappingId}`} name="reason" className="h-8 w-56" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? (isAr ? "جارٍ…" : "Revoking…") : isAr ? "سحب الاعتماد" : "Revoke approval"}
      </Button>
      <Err state={state} isAr={isAr} />
    </form>
  );
}
