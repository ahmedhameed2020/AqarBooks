"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, XCircle, LogOut, Loader2 } from "lucide-react";
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
import { activateUnitLeaseAction, cancelUnitLeaseAction, endUnitLeaseAction } from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

export function ActivateLeaseButton({ leaseId, locale }: { leaseId: string; locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(activateUnitLeaseAction, { ok: true });
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state.ok) {
        toast.add({ title: isAr ? "تم تفعيل عقد الإيجار" : "Lease activated", type: "success" });
        router.refresh();
      } else {
        toast.add({ title: state.error, type: "error" });
      }
    }
    wasPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="leaseId" value={leaseId} />
      <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
        {isAr ? "تفعيل" : "Activate"}
      </Button>
    </form>
  );
}

export function CancelLeaseButton({ leaseId, locale }: { leaseId: string; locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(cancelUnitLeaseAction, { ok: true });
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تم إلغاء عقد الإيجار" : "Lease cancelled", type: "success" });
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
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAr ? "إلغاء عقد الإيجار" : "Cancel lease"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="cancel-lease-form" action={formAction} className="space-y-3">
            <input type="hidden" name="leaseId" value={leaseId} />
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason">{isAr ? "السبب (اختياري)" : "Reason (optional)"}</Label>
              <Input id="cancelReason" name="cancelReason" />
            </div>
            {!state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="cancel-lease-form" variant="destructive" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {isAr ? "تأكيد الإلغاء" : "Confirm cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EndLeaseButton({ leaseId, locale }: { leaseId: string; locale: string }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(endUnitLeaseAction, { ok: true });
  const wasPending = useRef(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (wasPending.current && !pending && state.ok) {
      toast.add({ title: isAr ? "تم إنهاء عقد الإيجار" : "Lease ended", type: "success" });
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
            <LogOut className="size-3.5" />
            {isAr ? "إنهاء العقد" : "End lease"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAr ? "إنهاء عقد الإيجار" : "End lease"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="end-lease-form" action={formAction} className="space-y-3">
            <input type="hidden" name="leaseId" value={leaseId} />
            <div className="space-y-1.5">
              <Label htmlFor="endsOn">{isAr ? "تاريخ الإنهاء" : "End date"}</Label>
              <Input id="endsOn" name="endsOn" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endReason">{isAr ? "سبب الإنهاء" : "Reason"}</Label>
              <Input id="endReason" name="endReason" required />
            </div>
            {!state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="end-lease-form" variant="destructive" disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {isAr ? "تأكيد الإنهاء" : "Confirm end"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
