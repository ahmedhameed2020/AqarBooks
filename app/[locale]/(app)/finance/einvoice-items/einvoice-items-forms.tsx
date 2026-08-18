"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCatalogueItem, linkDueTypeToItem } from "@/lib/actions/einvoice-items";
import type { ActionResult } from "@/lib/actions/platform";

export type ItemOption = {
  id: string;
  label: string;
  /** An item with no authority code cannot carry a document line. */
  hasCode: boolean;
};

function message(error: string, isAr: boolean) {
  if (error.includes("ITEM_CODE_TYPE_MISMATCH")) {
    return isAr
      ? "كود السلطة ونوعه يأتيان معًا: اختر النوع مع الكود أو اتركهما فارغين."
      : "An authority code and its type travel together: give both, or neither.";
  }
  if (error.includes("catalogue_items_gs1_shape")) {
    return isAr
      ? "كود GS1 أرقام فقط بطول 8 أو 12 أو 13 أو 14."
      : "A GS1 code is digits only, of length 8, 12, 13 or 14.";
  }
  if (error.includes("CATALOGUE_ITEM_NOT_IN_ORGANIZATION")) {
    return isAr ? "الصنف لا يتبع هذه المؤسسة." : "That item belongs to another organization.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr
      ? "لا تملك صلاحية إدارة كتالوج الأصناف."
      : "You don't have permission to manage the item catalogue.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function ItemForm({
  organizationId,
  item,
  locale,
}: {
  organizationId: string;
  item?: {
    code: string;
    nameAr: string;
    nameEn: string;
    unitCode: string;
    itemCodeType: string | null;
    itemCode: string | null;
  };
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    saveCatalogueItem,
    { ok: true },
  );
  const id = item?.code ?? "new";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5">
        <Label htmlFor={`code-${id}`} className="text-xs">
          {isAr ? "الكود الداخلي" : "Internal code"}
        </Label>
        <Input id={`code-${id}`} name="code" defaultValue={item?.code ?? ""} required dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`ar-${id}`} className="text-xs">{isAr ? "الاسم" : "Name (AR)"}</Label>
        <Input id={`ar-${id}`} name="nameAr" defaultValue={item?.nameAr ?? ""} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`en-${id}`} className="text-xs">{isAr ? "الاسم بالإنجليزية" : "Name (EN)"}</Label>
        <Input id={`en-${id}`} name="nameEn" defaultValue={item?.nameEn ?? ""} required dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`unit-${id}`} className="text-xs">{isAr ? "وحدة القياس" : "Unit"}</Label>
        <Input id={`unit-${id}`} name="unitCode" defaultValue={item?.unitCode ?? "EA"} dir="ltr" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`type-${id}`} className="text-xs">{isAr ? "نوع الكود" : "Code type"}</Label>
        <select
          id={`type-${id}`}
          name="itemCodeType"
          defaultValue={item?.itemCodeType ?? ""}
          className="w-full rounded-md border border-input bg-transparent p-2 text-sm"
        >
          <option value="">{isAr ? "— بلا كود —" : "— none —"}</option>
          <option value="EGS">EGS</option>
          <option value="GS1">GS1</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`itemcode-${id}`} className="text-xs">
          {isAr ? "كود السلطة" : "Authority code"}
        </Label>
        <Input
          id={`itemcode-${id}`}
          name="itemCode"
          defaultValue={item?.itemCode ?? ""}
          dir="ltr"
          placeholder={isAr ? "GS1 أرقام فقط" : "GS1 is digits only"}
        />
      </div>

      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ…" : "Saving…") : isAr ? "حفظ الصنف" : "Save item"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? "ETA لا تقبل وصفًا نصيًا حرًا: الصنف بلا كود لا يُرسَل مستنده."
            : "Egypt accepts no free-text line: an item with no code cannot be filed."}
        </p>
        <Err state={state} isAr={isAr} />
      </div>
    </form>
  );
}

export function LinkForm({
  dueTypeId,
  currentItemId,
  items,
  locale,
}: {
  dueTypeId: string;
  currentItemId: string | null;
  items: ItemOption[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    linkDueTypeToItem,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="dueTypeId" value={dueTypeId} />
      <div className="space-y-1.5">
        <Label htmlFor={`item-${dueTypeId}`} className="text-xs">
          {isAr ? "الصنف" : "Item"}
        </Label>
        <select
          id={`item-${dueTypeId}`}
          name="catalogueItemId"
          defaultValue={currentItemId ?? ""}
          className="w-full min-w-56 rounded-md border border-input bg-transparent p-2 text-sm"
        >
          <option value="">{isAr ? "— بلا ربط —" : "— unlinked —"}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
              {i.hasCode ? "" : isAr ? " (بلا كود)" : " (no code)"}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? (isAr ? "جارٍ…" : "Linking…") : isAr ? "ربط" : "Link"}
      </Button>
      <Err state={state} isAr={isAr} />
    </form>
  );
}
