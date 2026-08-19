"use client";

import { useActionState, useTransition } from "react";
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
import { RefreshCw, Check } from "lucide-react";

const STATUSES = [
  { value: "PLANNED", labelAr: "مخططة (PLANNED)", labelEn: "Planned" },
  { value: "OPEN", labelAr: "مفتوحة (OPEN)", labelEn: "Open" },
  { value: "CLOSED", labelAr: "مغلقة (CLOSED)", labelEn: "Closed" },
  { value: "LOCKED", labelAr: "مقفلة نهائياً (LOCKED)", labelEn: "Locked" },
] as const;

export function PeriodStatusForm({
  periodId,
  currentStatus,
  locale,
}: {
  periodId: string;
  currentStatus: string;
  locale?: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    setFiscalPeriodStatusAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="fiscalPeriodId" value={periodId} />
      <Select
        name="status"
        defaultValue={currentStatus}
        items={STATUSES.map((s) => ({ value: s.value, label: isAr ? s.labelAr : s.labelEn }))}
      >
        <SelectTrigger size="sm" className="w-32 h-8 text-[11px] font-bold">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {isAr ? s.labelAr : s.labelEn}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={pending}
        className="h-8 px-2.5 text-xs font-bold"
      >
        {pending ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
        <span>{isAr ? "تطبيق" : "Apply"}</span>
      </Button>
    </form>
  );
}
