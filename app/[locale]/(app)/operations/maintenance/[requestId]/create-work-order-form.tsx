"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkOrderAction } from "@/lib/actions/maintenance";
import type { Option } from "../work-orders/[workOrderId]/work-order-controls";

export function CreateWorkOrderForm({
  requestId,
  staffOptions,
  supplierOptions,
  canCreate,
  locale,
}: {
  requestId: string;
  staffOptions: Option[];
  supplierOptions: Option[];
  canCreate: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canCreate) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
      <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "إنشاء أمر عمل" : "Create Work Order"}</h2>
      {error ? <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
      <form
        className="mt-3 grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await createWorkOrderAction({
              requestId,
              assignedUserId: String(form.get("assignedUserId") || "") || null,
              supplierId: String(form.get("supplierId") || "") || null,
              scheduledStartAt: form.get("scheduledStartAt") ? new Date(String(form.get("scheduledStartAt"))).toISOString() : null,
              scheduledEndAt: form.get("scheduledEndAt") ? new Date(String(form.get("scheduledEndAt"))).toISOString() : null,
              slaDueAt: form.get("slaDueAt") ? new Date(String(form.get("slaDueAt"))).toISOString() : null,
              note: String(form.get("note") || ""),
              visibility: "STAFF_ONLY",
            });

            if (result.ok && result.workOrderId) {
              router.push(`/operations/maintenance/work-orders/${result.workOrderId}`);
            } else {
              setError(result.ok ? "failed" : result.error);
            }
          });
        }}
      >
        <select name="assignedUserId" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">{isAr ? "مسؤول داخلي اختياري" : "Optional internal staff"}</option>
          {staffOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <select name="supplierId" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">{isAr ? "مورد خارجي اختياري" : "Optional external supplier"}</option>
          {supplierOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <Input name="scheduledStartAt" type="datetime-local" />
        <Input name="scheduledEndAt" type="datetime-local" />
        <Input name="slaDueAt" type="datetime-local" />
        <Input name="note" placeholder={isAr ? "ملاحظة داخلية اختيارية" : "Optional internal note"} />
        <Button type="submit" disabled={pending} size="sm" className="w-fit rounded-xl">
          {isAr ? "إنشاء أمر العمل" : "Create Work Order"}
        </Button>
      </form>
    </section>
  );
}
