"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cloneCoaTemplateAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

export function CloneTemplateForm({
  organizationId,
  templateKey,
  templateName,
  locale,
}: {
  organizationId: string;
  templateKey: string;
  templateName: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    cloneCoaTemplateAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-center gap-3 rounded-lg border border-dashed p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="templateKey" value={templateKey} />
      <p className="flex-1 text-sm text-muted-foreground">
        {isAr
          ? `لا يوجد دليل حسابات بعد. تقدر تبدأ من قالب "${templateName}" وتعدّل عليه بعدين.`
          : `No chart of accounts yet. Start from the "${templateName}" template and customize it later.`}
      </p>
      {!state.ok && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {isAr ? "استخدام القالب" : "Use template"}
      </Button>
    </form>
  );
}
