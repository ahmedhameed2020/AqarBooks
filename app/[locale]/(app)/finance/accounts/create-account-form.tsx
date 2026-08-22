"use client";

import { useActionState, useState, useEffect } from "react";
import { Plus, X, FolderPlus, Sparkles, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { createAccount } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import {
  ACCOUNT_CATEGORIES,
  CASH_FLOW_SECTIONS,
  categoryLabel,
  cashFlowSectionLabel,
} from "@/lib/accounting/account-labels";

function errorMessage(code: string | undefined, isAr: boolean): string {
  switch (code) {
    case "duplicate_code":
      return isAr ? "رمز الحساب مستخدم بالفعل." : "That account code is already in use.";
    case "invalid_parent":
      return isAr ? "الحساب الأب غير صالح." : "The selected parent account is not valid.";
    case "forbidden":
      return isAr
        ? "لا تملك صلاحية إضافة حسابات."
        : "You do not have permission to add accounts.";
    case "invalid_input":
      return isAr ? "تحقّق من الحقول المدخلة." : "Please check the fields and try again.";
    default:
      return isAr ? "تعذّر إضافة الحساب. حاول مرة أخرى." : "Could not add the account. Please try again.";
  }
}

export function CreateAccountForm({
  organizationId,
  accounts,
  locale,
}: {
  organizationId: string;
  accounts: { id: string; code: string; name_ar: string; name_en: string; is_group: boolean }[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const groupAccounts = accounts
    .filter((a) => a.is_group)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(createAccount, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && open) {
      setOpen(false);
    }
  }, [state, open]);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
      >
        <Plus className="size-4" />
        <span>{isAr ? "إضافة حساب جديد" : "Add New Account"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl rounded-3xl p-6 text-start">
          <DialogHeader className="space-y-1 border-b border-slate-100 pb-4 text-start">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <FolderPlus className="size-4.5" />
              </div>
              <DialogTitle className="text-lg font-black text-slate-900">
                {isAr ? "إضافة حساب في شجرة الحسابات" : "Add Chart of Accounts Node"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500">
              {isAr
                ? "أدخل بيانات الحساب وتصنيفه المحاسبي وقسم التدفقات النقدية التابع له."
                : "Configure account codes, name translations, and cash flow classifications."}
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-5 pt-2">
            <input type="hidden" name="organizationId" value={organizationId} />

            {/* Account Code & Names Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-code" className="text-xs font-bold text-slate-700">
                  {isAr ? "رمز الحساب (الكود)" : "Account Code"}
                </Label>
                <Input
                  id="create-code"
                  name="code"
                  required
                  maxLength={20}
                  placeholder="110101"
                  dir="ltr"
                  className="font-mono text-sm rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-nameAr" className="text-xs font-bold text-slate-700">
                  {isAr ? "الاسم بالعربية" : "Arabic Name"}
                </Label>
                <Input
                  id="create-nameAr"
                  name="nameAr"
                  required
                  maxLength={200}
                  placeholder={isAr ? "نقدية بالصندوق الرئيسي" : "Cash on Hand"}
                  className="text-sm rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-nameEn" className="text-xs font-bold text-slate-700">
                  {isAr ? "الاسم بالإنجليزية" : "English Name"}
                </Label>
                <Input
                  id="create-nameEn"
                  name="nameEn"
                  required
                  maxLength={200}
                  placeholder="Main Petty Cash"
                  dir="ltr"
                  className="text-sm rounded-xl"
                />
              </div>
            </div>

            {/* Parent Account & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-parentId" className="text-xs font-bold text-slate-700">
                  {isAr ? "الحساب الأب (المجموعة)" : "Parent Group"}
                </Label>
                <select
                  id="create-parentId"
                  name="parentId"
                  defaultValue=""
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
                >
                  <option value="">{isAr ? "بدون (حساب رئيسي أول)" : "None (Top Level)"}</option>
                  {groupAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {isAr ? a.name_ar : a.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-category" className="text-xs font-bold text-slate-700">
                  {isAr ? "التصنيف الرئيسي" : "Category"}
                </Label>
                <select
                  id="create-category"
                  name="category"
                  defaultValue="ASSET"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
                >
                  {ACCOUNT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c, isAr)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-normalBalance" className="text-xs font-bold text-slate-700">
                  {isAr ? "الرصيد الطبيعي" : "Normal Balance"}
                </Label>
                <select
                  id="create-normalBalance"
                  name="normalBalance"
                  defaultValue="DEBIT"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium focus:border-blue-600 focus:outline-none"
                >
                  <option value="DEBIT">{isAr ? "مدين (Debit)" : "Debit"}</option>
                  <option value="CREDIT">{isAr ? "دائن (Credit)" : "Credit"}</option>
                </select>
              </div>
            </div>

            {/* Cash Flow Section */}
            <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="create-cashFlowSection" className="text-xs font-bold text-slate-800">
                  {isAr ? "قسم قائمة التدفقات النقدية" : "Cash Flow Section"}
                </Label>
                <span className="text-[10px] text-slate-400">
                  {isAr ? "موصى به للحسابات التشغيلية والتمويلية" : "Recommended"}
                </span>
              </div>
              <select
                id="create-cashFlowSection"
                name="cashFlowSection"
                defaultValue=""
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
                  name="isCashEquivalent"
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">
                    {isAr ? "نقدية أو ما في حكمها" : "Cash Equivalent"}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {isAr ? "حساب خزانة أو بنك" : "Treasury / Bank"}
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  name="isGroup"
                  className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600/20"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">
                    {isAr ? "حساب تجميعي (رئيسي)" : "Group Account"}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {isAr ? "لا يُرحل عليه قيود مباشرة" : "Header only, not postable"}
                  </span>
                </div>
              </label>
            </div>

            {/* Error Message */}
            {!state.ok && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
              >
                <AlertCircle className="size-4 shrink-0 text-red-600" />
                <span>{errorMessage(state.error, isAr)}</span>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-xl text-xs font-bold"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
              >
                {pending
                  ? isAr
                    ? "جاري الحفظ..."
                    : "Saving..."
                  : isAr
                  ? "حفظ الحساب"
                  : "Save Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
