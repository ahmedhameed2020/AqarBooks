"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFiscalYearAction } from "@/lib/actions/accounting";
import type { ActionResult } from "@/lib/actions/platform";

export function CreateFiscalYearForm({
  organizationId,
  locale,
}: {
  organizationId: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createFiscalYearAction,
    { ok: true },
  );

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="space-y-2">
        <Label htmlFor="name">{isAr ? "اسم السنة المالية" : "Fiscal year name"}</Label>
        <Input id="name" name="name" placeholder="2026" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="startDate">{isAr ? "تاريخ البداية" : "Start date"}</Label>
        <Input id="startDate" name="startDate" type="date" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="endDate">{isAr ? "تاريخ النهاية" : "End date"}</Label>
        <Input id="endDate" name="endDate" type="date" required />
      </div>
      {!state.ok && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {state.error}
        </p>
      )}
      <div className="sm:col-span-4">
        <Button type="submit" disabled={pending}>
          {isAr ? "إنشاء سنة مالية (بفترات شهرية تلقائية)" : "Create fiscal year (auto monthly periods)"}
        </Button>
      </div>
    </form>
  );
}
