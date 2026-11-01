"use client";

import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmation step for reconciliation actions that change accounting links.
 * The confirm button submits the existing form identified by `formId`, so the
 * server action and its arguments stay exactly as they were. The dialog closes
 * itself once the pending submission finishes.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  formId,
  pending,
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  pending: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
}) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onOpenChange(false);
    wasPending.current = pending;
  }, [pending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
