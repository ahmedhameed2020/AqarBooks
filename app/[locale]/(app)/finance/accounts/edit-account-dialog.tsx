"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
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
import { updateAccount } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import { CASH_FLOW_SECTIONS, cashFlowSectionLabel } from "@/lib/accounting/account-labels";
import type { AccountRow } from "./accounts-client";

function errorMessage(code: string | undefined, isAr: boolean): string {
  switch (code) {
    case "parent_cycle":
      return isAr
        ? "لا يمكن جعل الحساب تابعًا لأحد فروعه."
        : "An account cannot be moved under one of its own descendants.";
    case "forbidden":
      return isAr
        ? "لا تملك صلاحية تعديل دليل الحسابات."
        : "You do not have permission to edit the chart of accounts.";
    case "invalid_parent":
      return isAr ? "الحساب الأب غير صالح." : "The selected parent account is not valid.";
    case "invalid_input":
      return isAr ? "تحقّق من الحقول المدخلة." : "Please check the fields and try again.";
    default:
      return isAr ? "تعذّر حفظ التعديل. حاول مرة أخرى." : "Could not save the change. Please try again.";
  }
}

export function EditAccountDialog({
  account,
  allAccounts,
  locale,
  onClose,
}: {
  account: AccountRow;
  allAccounts: AccountRow[];
  locale: string;
  onClose: () => void;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(updateAccount, {
    ok: true,
  });

  // Initial state is `{ ok: true }`, so success cannot be detected from state
  // alone. Track that a submit actually ran, then close once it settles clean.
  const submitted = useRef(false);
  if (pending) submitted.current = true;

  useEffect(() => {
    if (submitted.current && !pending && state.ok) onClose();
  }, [state, pending, onClose]);

  // Offering a descendant as the new parent would only produce a cycle the
  // server then rejects, so those options are removed up front.
  const parentOptions = useMemo(() => {
    const childrenOf = new Map<string | null, AccountRow[]>();
    for (const a of allAccounts) {
      const list = childrenOf.get(a.parent_id) ?? [];
      list.push(a);
      childrenOf.set(a.parent_id, list);
    }
    const banned = new Set<string>([account.id]);
    const stack = [account.id];
    while (stack.length) {
      const current = stack.pop()!;
      for (const child of childrenOf.get(current) ?? []) {
        if (!banned.has(child.id)) {
          banned.add(child.id);
          stack.push(child.id);
        }
      }
    }
    return allAccounts
      .filter((a) => a.is_group && !banned.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [allAccounts, account.id]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="border-b p-5 pb-3">
          <DialogTitle>{isAr ? "تعديل الحساب" : "Edit account"}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{account.code}</span>
            {account.is_used && (
              <span className="ms-2 text-xs text-amber-600">
                {isAr
                  ? "· هذا الحساب عليه قيود مرحّلة"
                  : "· this account has posted entries"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex min-h-0 flex-col">
          <input type="hidden" name="accountId" value={account.id} />

          <DialogBody className="space-y-4 overflow-y-auto p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-nameAr">{isAr ? "الاسم بالعربية" : "Arabic name"}</Label>
                <Input id="edit-nameAr" name="nameAr" defaultValue={account.name_ar} required maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nameEn">{isAr ? "الاسم بالإنجليزية" : "English name"}</Label>
                <Input id="edit-nameEn" name="nameEn" defaultValue={account.name_en} required maxLength={200} dir="ltr" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-parentId">{isAr ? "الحساب الأب" : "Parent account"}</Label>
              <select
                id="edit-parentId"
                name="parentId"
                defaultValue={account.parent_id ?? ""}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">{isAr ? "بدون (حساب رئيسي)" : "None (top level)"}</option>
                {parentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {isAr ? a.name_ar : a.name_en}
                  </option>
                ))}
              </select>
            </div>

            {/* Cash flow classification: the only place in the product where
                these two columns can be set, and the statement depends on them. */}
            <fieldset className="space-y-3 rounded-lg border p-3.5">
              <legend className="px-1 text-xs font-semibold text-muted-foreground">
                {isAr ? "تصنيف قائمة التدفقات النقدية" : "Cash flow statement classification"}
              </legend>

              <div className="space-y-2">
                <Label htmlFor="edit-cashFlowSection">{isAr ? "القسم" : "Section"}</Label>
                <select
                  id="edit-cashFlowSection"
                  name="cashFlowSection"
                  defaultValue={account.cash_flow_section ?? ""}
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

              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="isCashEquivalent"
                  defaultChecked={account.is_cash_equivalent}
                  className="mt-0.5 size-4"
                />
                <span>
                  {isAr ? "نقدية أو ما في حكمها" : "Cash or cash equivalent"}
                  <span className="block text-[11px] text-muted-foreground">
                    {isAr
                      ? "يُحتسب ضمن رصيد النقدية في أول المدة وآخرها."
                      : "Counted in the opening and closing cash balance."}
                  </span>
                </span>
              </label>
            </fieldset>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="requiresCostCenter"
                defaultChecked={account.requires_cost_center}
                className="mt-0.5 size-4"
              />
              <span>
                {isAr ? "يتطلب مركز تكلفة" : "Requires a cost centre"}
                <span className="block text-[11px] text-muted-foreground">
                  {isAr
                    ? "لن يُقبل القيد على هذا الحساب دون تحديد مركز التكلفة."
                    : "Entries on this account must specify a cost centre."}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={account.is_active}
                className="mt-0.5 size-4"
              />
              <span>
                {isAr ? "حساب نشط" : "Active account"}
                <span className="block text-[11px] text-muted-foreground">
                  {isAr
                    ? "إيقاف الحساب يمنع القيود الجديدة عليه ولا يمس القيود السابقة."
                    : "Deactivating blocks new entries and leaves existing ones untouched."}
                </span>
              </span>
            </label>

            {!state.ok && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
                {errorMessage(state.error, isAr)}
              </p>
            )}
          </DialogBody>

          <DialogFooter className="gap-2 border-t p-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="me-1.5 size-4 animate-spin" />}
              {isAr ? "حفظ التعديل" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
