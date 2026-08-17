"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cancelInstallmentPlanAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

export function CancelInstallmentPlanButton({ planId, locale }: { planId: string; locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(cancelInstallmentPlanAction, { ok: true });
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تم إلغاء خطة التقسيط" : "Installment plan cancelled", type: "success" });
      setOpen(false);
      router.refresh();
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <XCircle className="size-3.5" />
            {isAr ? "إلغاء الخطة" : "Cancel plan"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAr ? "إلغاء خطة التقسيط" : "Cancel installment plan"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="cancel-plan-form" action={formAction} className="space-y-3">
            <input type="hidden" name="planId" value={planId} />
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "ستُلغى الأقساط غير المدفوعة فقط. الأقساط المدفوعة بالفعل لا تتأثر."
                : "Only unpaid installments will be voided. Already-paid installments are untouched."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason">{isAr ? "سبب الإلغاء" : "Cancel reason"}</Label>
              <Input id="cancelReason" name="cancelReason" required />
            </div>
            {!state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="cancel-plan-form" variant="destructive" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {isAr ? "تأكيد الإلغاء" : "Confirm cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
