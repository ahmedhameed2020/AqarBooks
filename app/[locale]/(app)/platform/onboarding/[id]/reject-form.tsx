"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { rejectOnboardingRequest, type ActionResult } from "@/lib/actions/platform";

export function RejectForm({ requestId, locale }: { requestId: string; locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(rejectOnboardingRequest, {
    ok: true,
  });

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-destructive/30 p-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-1.5">
        <Label htmlFor="rejectNotes">{isAr ? "سبب الرفض (مطلوب)" : "Rejection reason (required)"}</Label>
        <Textarea id="rejectNotes" name="reviewNotes" rows={2} required />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-full">
        {pending ? (isAr ? "جارٍ الرفض..." : "Rejecting...") : isAr ? "رفض الطلب" : "Reject request"}
      </Button>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
