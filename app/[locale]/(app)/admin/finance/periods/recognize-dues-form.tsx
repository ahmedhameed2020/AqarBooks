"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { recognizePendingDuesAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

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
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="fiscalPeriodId" value={periodId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending
          ? isAr
            ? "جارٍ الاعتراف…"
            : "Recognising…"
          : isAr
            ? "اعتراف بالمستحقات"
            : "Recognise dues"}
      </Button>
      {state.ok === false && (
        <span className="text-xs text-destructive">
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
