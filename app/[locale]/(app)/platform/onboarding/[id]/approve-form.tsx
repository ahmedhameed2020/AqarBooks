"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveOnboardingRequest, type ActionResult } from "@/lib/actions/platform";

export function ApproveForm({ requestId, locale }: { requestId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(approveOnboardingRequest, {
    ok: true,
  });

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-emerald-200 p-3 dark:border-emerald-900">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-1.5">
        <Label htmlFor="approveNotes">{isAr ? "ملاحظات الاعتماد (اختياري)" : "Approval notes (optional)"}</Label>
        <Textarea id="approveNotes" name="reviewNotes" rows={2} />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (isAr ? "جارٍ التأسيس..." : "Provisioning...") : isAr ? "اعتماد وتأسيس المنظمة" : "Approve & provision workspace"}
      </Button>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
