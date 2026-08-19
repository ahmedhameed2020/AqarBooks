"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

/**
 * One form for a gain/loss pair. The two selects deliberately draw from the
 * SAME lists for both features, and choosing one account in both is allowed:
 * an organisation that reports a single net "differences" line sets them equal.
 */
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
  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="organizationId" value={organizationId} />

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-gain`} className="text-xs">
          {isAr ? "حساب الربح (إيراد)" : "Gain account (revenue)"}
        </Label>
        <select
          id={`${idPrefix}-gain`}
          name="gainAccountId"
          defaultValue={currentGainId ?? ""}
          className={select}
        >
          <option value="">{isAr ? "— غير معيَّن —" : "— not set —"}</option>
          {gainAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-loss`} className="text-xs">
          {isAr ? "حساب الخسارة (مصروف)" : "Loss account (expense)"}
        </Label>
        <select
          id={`${idPrefix}-loss`}
          name="lossAccountId"
          defaultValue={currentLossId ?? ""}
          className={select}
        >
          <option value="">{isAr ? "— غير معيَّن —" : "— not set —"}</option>
          {lossAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </div>

      <div className="flex items-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (isAr ? "جارٍ الحفظ…" : "Saving…") : isAr ? "حفظ" : "Save"}
        </Button>
      </div>

      {state.ok === false && (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {message(state.error, isAr)}
        </p>
      )}
    </form>
  );
}
