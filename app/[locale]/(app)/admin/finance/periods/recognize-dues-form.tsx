"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { recognizePendingDuesAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";
import { CheckCircle2, RefreshCw, Layers } from "lucide-react";

export function RecognizeDuesForm({
  organizationId,
  periodId,
  locale,
}: {
  organizationId: string;
  periodId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    recognizePendingDuesAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fiscalPeriodId" value={periodId} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        className="h-8 px-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
      >
        {pending ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : (
          <CheckCircle2 className="size-3" />
        )}
        <span>{isAr ? "اعتراف بالمستحقات" : "Recognise Dues"}</span>
      </Button>

      {state.ok === false && (
        <span className="text-[11px] font-bold text-rose-600 max-w-xs truncate">
          {state.error.includes("FORBIDDEN")
            ? isAr
              ? "لا تملك صلاحية الترحيل."
              : "You don't have permission to post."
            : state.error.includes("NOT_OPEN")
            ? isAr
              ? "الفترة غير مفتوحة."
              : "Period is not open."
            : state.error}
        </span>
      )}
    </form>
  );
}
