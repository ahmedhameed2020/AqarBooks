"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setOrganizationStatus,
  type ActionResult,
} from "@/lib/actions/platform";

const STATUSES = ["TRIAL", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;

export function StatusForm({
  organizationId,
  currentStatus,
  locale,
}: {
  organizationId: string;
  currentStatus: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setOrganizationStatus,
    { ok: true },
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex flex-wrap gap-2">
        {STATUSES.filter((s) => s !== currentStatus).map((status) => (
          <Button
            key={status}
            type="submit"
            name="status"
            value={status}
            variant="outline"
            size="sm"
            disabled={pending}
          >
            {isAr ? `تحويل إلى ${status}` : `Set ${status}`}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="reason">{isAr ? "السبب (اختياري)" : "Reason (optional)"}</Label>
        <Input id="reason" name="reason" />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
