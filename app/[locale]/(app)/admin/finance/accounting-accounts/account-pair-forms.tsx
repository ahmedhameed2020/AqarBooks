"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, TrendingUp, TrendingDown, Save } from "lucide-react";
import type { ActionResult } from "@/lib/actions/platform";

export type Option = { id: string; label: string };

function message(error: string, isAr: boolean) {
  if (error.includes("FX_GAIN_ACCOUNT_INVALID") || error.includes("DISPOSAL_GAIN_ACCOUNT_INVALID")) {
    return isAr
      ? "حساب الربح يجب أن يكون إيرادًا نشطًا غير تجميعي — الفرق الموجب يزيد حقوق الملكية."
      : "The gain account must be an active, non-group REVENUE account: a positive result increases equity.";
  }
  if (error.includes("FX_LOSS_ACCOUNT_INVALID") || error.includes("DISPOSAL_LOSS_ACCOUNT_INVALID")) {
    return isAr
      ? "حساب الخسارة يجب أن يكون مصروفًا نشطًا غير تجميعي — الفرق السالب ينقص حقوق الملكية."
      : "The loss account must be an active, non-group EXPENSE account: a negative result reduces equity.";
  }
  if (error.includes("FORBIDDEN")) {
    return isAr
      ? "لا تملك صلاحية تعيين الحسابات المحاسبية."
      : "You don't have permission to designate accounting accounts.";
  }
  if (error === "invalid_input") return isAr ? "تحقق من الاختيار." : "Check the selection.";
  return error;
}

export function AccountPairForm({
  action,
  organizationId,
  idPrefix,
  gainAccounts,
  lossAccounts,
  currentGainId,
  currentLossId,
  locale,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  organizationId: string;
  idPrefix: string;
  gainAccounts: Option[];
  lossAccounts: Option[];
  currentGainId: string | null;
  currentLossId: string | null;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gain Account */}
        <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
            <TrendingUp className="size-4 text-emerald-600" />
            <Label htmlFor={`${idPrefix}-gain`} className="text-xs font-bold text-emerald-950">
              {isAr ? "حساب الأرباح (إيرادات)" : "Gain Account (Revenue)"}
            </Label>
          </div>
          <select
            id={`${idPrefix}-gain`}
            name="gainAccountId"
            defaultValue={currentGainId ?? ""}
            className="h-10 w-full rounded-xl border border-emerald-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
          >
            <option value="">{isAr ? "— غير معيَّن —" : "— Not Assigned —"}</option>
            {gainAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-emerald-700 block">
            {isAr ? "يُقيد عليه الفروق الموجبة كأرباح" : "Credited with positive variances"}
          </span>
        </div>

        {/* Loss Account */}
        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
            <TrendingDown className="size-4 text-rose-600" />
            <Label htmlFor={`${idPrefix}-loss`} className="text-xs font-bold text-rose-950">
              {isAr ? "حساب الخسائر (مصروفات)" : "Loss Account (Expense)"}
            </Label>
          </div>
          <select
            id={`${idPrefix}-loss`}
            name="lossAccountId"
            defaultValue={currentLossId ?? ""}
            className="h-10 w-full rounded-xl border border-rose-300 bg-white px-3 text-xs font-medium text-slate-900 focus:border-rose-600 focus:outline-none"
          >
            <option value="">{isAr ? "— غير معيَّن —" : "— Not Assigned —"}</option>
            {lossAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-rose-700 block">
            {isAr ? "يُقيد عليه الفروق السالبة كمصروف" : "Debited with negative variances"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button
          type="submit"
          disabled={pending}
          className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 gap-2 cursor-pointer"
        >
          <Save className="size-4" />
          <span>{pending ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isAr ? "حفظ التعيين" : "Save Designation"}</span>
        </Button>

        {state.ok && (
          <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 className="size-4" />
            {isAr ? "تم حفظ الحسابات بنجاح" : "Saved successfully"}
          </span>
        )}
      </div>

      {state.ok === false && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800"
        >
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span>{message(state.error, isAr)}</span>
        </div>
      )}
    </form>
  );
}
