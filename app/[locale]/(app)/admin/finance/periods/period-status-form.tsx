"use client";

import { useActionState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { setFiscalPeriodStatusAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

const STATUSES = ["PLANNED", "OPEN", "CLOSED", "LOCKED"] as const;

export function PeriodStatusForm({ periodId }: { periodId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setFiscalPeriodStatusAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="fiscalPeriodId" value={periodId} />
      <Select name="status" defaultValue="OPEN">
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {state.ok ? "Set" : "Retry"}
      </Button>
    </form>
  );
}
