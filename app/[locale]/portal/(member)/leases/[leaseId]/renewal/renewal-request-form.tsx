"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { requestLeaseRenewalAction } from "@/lib/actions/lease-renewals";
import { leaseRenewalErrorMessage } from "@/lib/lease-renewal-ui";
import type { ActionResult } from "@/lib/actions/platform";
import { useRouter } from "@/i18n/navigation";

export function RenewalRequestForm({
  leaseId,
  proposedStartsOn,
  locale,
}: {
  leaseId: string;
  proposedStartsOn: string;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestLeaseRenewalAction, { ok: true });
  const wasPending = useRef(false);

  useEffect(() => {
    if (!wasPending.current || pending) return;
    if (state.ok) {
      toast.add({ title: isAr ? "تم إرسال طلب التجديد" : "Renewal request submitted", type: "success" });
      router.refresh();
    }
    wasPending.current = pending;
  }, [isAr, pending, router, state, toast]);

  useEffect(() => { wasPending.current = pending; }, [pending]);

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="leaseId" value={leaseId} />
      <input type="hidden" name="proposedStartsOn" value={proposedStartsOn} />
      <input type="hidden" name="proposedRentAmount" value="" />
      <input type="hidden" name="proposedRentFrequency" value="" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="renewal-start">{isAr ? "بداية الفترة الجديدة" : "New term starts"}</Label>
          <Input id="renewal-start" value={proposedStartsOn} readOnly aria-readonly="true" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="renewal-end">{isAr ? "نهاية الفترة الجديدة (اختياري)" : "New term ends (optional)"}</Label>
          <Input id="renewal-end" name="proposedEndsOn" type="date" min={proposedStartsOn} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="renewal-note">{isAr ? "ملاحظة للإدارة (اختياري)" : "Note to management (optional)"}</Label>
        <Textarea id="renewal-note" name="note" maxLength={1000} rows={4} placeholder={isAr ? "أي تفاصيل تساعد الإدارة على مراجعة الطلب" : "Any details that help management review the request"} />
      </div>
      {!state.ok ? <p role="alert" aria-live="polite" className="text-sm text-destructive">{leaseRenewalErrorMessage(state.error, locale)}</p> : null}
      <Button type="submit" disabled={pending} className="gap-2">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {pending ? (isAr ? "جارٍ الإرسال" : "Submitting") : (isAr ? "إرسال طلب التجديد" : "Submit renewal request")}
      </Button>
    </form>
  );
}
