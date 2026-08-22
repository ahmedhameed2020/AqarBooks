"use client";

import { useActionState, useEffect, useMemo, useRef } from "react";
import { Loader2, Pencil, ShieldAlert } from "lucide-react";
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
  accounts,
  open = true,
  onOpenChange,
  locale,
  onClose,
}: {
  account: AccountRow;
  allAccounts?: AccountRow[];
  accounts?: AccountRow[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  locale: string;
  onClose?: () => void;
}) {
  const isAr = locale === "ar";
  const accountList = allAccounts || accounts || [];

  const handleClose = () => {
    if (onOpenChange) onOpenChange(false);
    if (onClose) onClose();
  };

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(updateAccount, {
    ok: true,
  });

  const submitted = useRef(false);
  if (pending) submitted.current = true;

  useEffect(() => {
    if (submitted.current && !pending && state.ok) {
      handleClose();
    }
  }, [state, pending]);

  // Prevent cycle in tree
  const parentOptions = useMemo(() => {
    const childrenOf = new Map<string | null, AccountRow[]>();
    for (const a of accountList) {
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
    return accountList
      .filter((a) => a.is_group && !banned.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [accountList, account.id]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-xl rounded-3xl p-6 text-start">
        <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Pencil className="size-4" />
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {isAr ? "تعديل بيانات الحساب" : "Edit Account Properties"}
              </DialogTitle>
            </div>
            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
              {account.code}
            </span>
          </div>

          <DialogDescription className="text-xs text-slate-500">
            {account.is_used ? (
              <span className="text-amber-600 font-semibold">
                {isAr
                  ? "تنبيه: توجد قيود مرحلة على هذا الحساب. الرمز والتصنيف مقفلان لحماية الدفاتر."
                  : "Note: This account has posted journal entries. Code and category are locked."}
              </span>
            ) : (
              <span>
                {isAr
                  ? "تعديل مسميات الحساب، الحساب الأب، وتصنيف التدفقات النقدية."
                  : "Modify names, parent assignment, and cash flow classifications."}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 pt-2">
          <input type="hidden" name="accountId" value={account.id} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nameAr" className="text-xs font-bold text-slate-700">
                {isAr ? "الاسم بالعربية" : "Arabic Name"}
              </Label>
              <Input
                id="edit-nameAr"
                name="nameAr"
                defaultValue={account.name_ar}
                required
                maxLength={200}
                className="text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-nameEn" className="text-xs font-bold text-slate-700">
                {isAr ? "الاسم بالإنجليزية" : "English Name"}
              </Label>
              <Input
                id="edit-nameEn"
                name="nameEn"
                defaultValue={account.name_en}
                required
                maxLength={200}
                dir="ltr"
                className="text-sm rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-parentId" className="text-xs font-bold text-slate-700">
              {isAr ? "الحساب الأب (المجموعة)" : "Parent Group"}
            </Label>
            <select
              id="edit-parentId"
              name="parentId"
              defaultValue={account.parent_id ?? ""}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
            >
              <option value="">{isAr ? "بدون (حساب رئيسي أول)" : "None (Top Level)"}</option>
              {parentOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {isAr ? a.name_ar : a.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
            <Label htmlFor="edit-cashFlowSection" className="text-xs font-bold text-slate-800">
              {isAr ? "قسم قائمة التدفقات النقدية" : "Cash Flow Section"}
            </Label>
            <select
              id="edit-cashFlowSection"
              name="cashFlowSection"
              defaultValue={account.cash_flow_section ?? ""}
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
            >
              <option value="">{cashFlowSectionLabel(null, isAr)}</option>
              {CASH_FLOW_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {cashFlowSectionLabel(s, isAr)}
                </option>
              ))}
            </select>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={account.is_active}
                className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
              />
              <span className="text-xs font-bold text-slate-900">
                {isAr ? "حساب نشط (متاح للقيود)" : "Active Account"}
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                name="isCashEquivalent"
                defaultChecked={account.is_cash_equivalent}
                className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
              />
              <span className="text-xs font-bold text-slate-900">
                {isAr ? "نقدية وما في حكمها" : "Cash Equivalent"}
              </span>
            </label>
          </div>

          {!state.ok && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
            >
              <ShieldAlert className="size-4 shrink-0 text-red-600" />
              <span>{errorMessage(state.error, isAr)}</span>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="rounded-xl text-xs font-bold"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{isAr ? "جاري الحفظ..." : "Saving..."}</span>
                </>
              ) : (
                <span>{isAr ? "حفظ التعديلات" : "Save Changes"}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
