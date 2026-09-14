"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, PauseCircle, Play, RotateCcw, UserRound, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addWorkOrderUpdateAction,
  assignWorkOrderAction,
  cancelWorkOrderAction,
  completeWorkOrderAction,
  resumeWorkOrderAction,
  scheduleWorkOrderAction,
  startWorkOrderAction,
  waitWorkOrderAction,
} from "@/lib/actions/maintenance";
import type { WorkOrderStatus } from "../work-orders-client";

export type Option = { id: string; label: string };

export function WorkOrderControls({
  workOrderId,
  status,
  staffOptions,
  supplierOptions,
  canManage,
  canAssign,
  canComplete,
  locale,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  staffOptions: Option[];
  supplierOptions: Option[];
  canManage: boolean;
  canAssign: boolean;
  canComplete: boolean;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? (isAr ? "تم الحفظ." : "Saved.") : `${isAr ? "فشل الإجراء" : "Action failed"}: ${result.error ?? "failed"}`);
    });
  };

  const terminal = status === "COMPLETED" || status === "CANCELLED";

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-xl border border-border/70 bg-muted px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{message}</p> : null}

      {canAssign && !terminal ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
            <UserRound className="size-4" />
            {isAr ? "الإسناد" : "Assignment"}
          </h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(() => assignWorkOrderAction({
                workOrderId,
                assignedUserId: String(form.get("assignedUserId") || "") || null,
                supplierId: String(form.get("supplierId") || "") || null,
                note: String(form.get("note") || ""),
                visibility: "STAFF_ONLY",
              }));
            }}
          >
            <select name="assignedUserId" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">{isAr ? "مسؤول داخلي" : "Internal staff"}</option>
              {staffOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <select name="supplierId" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="">{isAr ? "مورد خارجي" : "External supplier"}</option>
              {supplierOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <Input name="note" placeholder={isAr ? "ملاحظة داخلية اختيارية" : "Optional internal note"} className="sm:col-span-2" />
            <Button type="submit" disabled={pending} size="sm" className="w-fit rounded-xl">
              {isAr ? "حفظ الإسناد" : "Save Assignment"}
            </Button>
          </form>
        </section>
      ) : null}

      {canAssign && !terminal ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
            <CalendarClock className="size-4" />
            {isAr ? "الجدولة و SLA" : "Schedule and SLA"}
          </h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(() => scheduleWorkOrderAction({
                workOrderId,
                scheduledStartAt: new Date(String(form.get("scheduledStartAt"))).toISOString(),
                scheduledEndAt: new Date(String(form.get("scheduledEndAt"))).toISOString(),
                slaDueAt: form.get("slaDueAt") ? new Date(String(form.get("slaDueAt"))).toISOString() : null,
                note: String(form.get("note") || ""),
                visibility: "STAFF_ONLY",
              }));
            }}
          >
            <Input name="scheduledStartAt" type="datetime-local" required />
            <Input name="scheduledEndAt" type="datetime-local" required />
            <Input name="slaDueAt" type="datetime-local" />
            <Input name="note" placeholder={isAr ? "ملاحظة جدولة اختيارية" : "Optional scheduling note"} />
            <Button type="submit" disabled={pending} size="sm" className="w-fit rounded-xl">
              {isAr ? "حفظ الجدولة" : "Save Schedule"}
            </Button>
          </form>
        </section>
      ) : null}

      {canManage && !terminal ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "تحديث التنفيذ" : "Progress Updates"}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["ASSIGNED", "SCHEDULED"].includes(status) ? (
              <Button type="button" disabled={pending} size="sm" className="rounded-xl" onClick={() => run(() => startWorkOrderAction({ workOrderId, note: "", visibility: "MEMBER_VISIBLE" }))}>
                <Play className="size-3.5" /> {isAr ? "بدء العمل" : "Start"}
              </Button>
            ) : null}
            {status === "IN_PROGRESS" ? (
              <Button type="button" disabled={pending} size="sm" variant="outline" className="rounded-xl" onClick={() => run(() => waitWorkOrderAction({ workOrderId, note: "", visibility: "MEMBER_VISIBLE" }))}>
                <PauseCircle className="size-3.5" /> {isAr ? "انتظار" : "Wait"}
              </Button>
            ) : null}
            {status === "WAITING" ? (
              <Button type="button" disabled={pending} size="sm" className="rounded-xl" onClick={() => run(() => resumeWorkOrderAction({ workOrderId, note: "", visibility: "MEMBER_VISIBLE" }))}>
                <RotateCcw className="size-3.5" /> {isAr ? "استئناف" : "Resume"}
              </Button>
            ) : null}
            {["DRAFT", "ASSIGNED", "SCHEDULED"].includes(status) ? (
              <Button type="button" disabled={pending} size="sm" variant="destructive" className="rounded-xl" onClick={() => run(() => cancelWorkOrderAction({ workOrderId, note: "", visibility: "MEMBER_VISIBLE" }))}>
                <XCircle className="size-3.5" /> {isAr ? "إلغاء" : "Cancel"}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {canComplete && status === "IN_PROGRESS" ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
            <CheckCircle2 className="size-4" />
            {isAr ? "إكمال أمر العمل" : "Complete Work Order"}
          </h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(() => completeWorkOrderAction({
                workOrderId,
                completionSummary: String(form.get("completionSummary") || ""),
                memberVisibleSummary: String(form.get("memberVisibleSummary") || ""),
                note: String(form.get("note") || ""),
                visibility: "MEMBER_VISIBLE",
              }));
            }}
          >
            <Textarea name="completionSummary" required placeholder={isAr ? "ملخص الإكمال الداخلي" : "Internal completion summary"} />
            <Textarea name="memberVisibleSummary" placeholder={isAr ? "ملخص يظهر للمالك" : "Member-visible summary"} />
            <Input name="note" placeholder={isAr ? "ملاحظة اختيارية" : "Optional note"} />
            <Button type="submit" disabled={pending} size="sm" className="rounded-xl">
              {isAr ? "إكمال" : "Complete"}
            </Button>
          </form>
        </section>
      ) : null}

      {canManage && !terminal ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "إضافة تحديث" : "Add Update"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              run(() => addWorkOrderUpdateAction({
                workOrderId,
                note: String(form.get("note") || ""),
                visibility: String(form.get("visibility") || "STAFF_ONLY") as "STAFF_ONLY" | "MEMBER_VISIBLE",
              }));
            }}
          >
            <Textarea name="note" required placeholder={isAr ? "اكتب تحديثًا..." : "Write an update..."} />
            <select name="visibility" defaultValue="STAFF_ONLY" className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
              <option value="STAFF_ONLY">{isAr ? "داخلي فقط" : "Staff only"}</option>
              <option value="MEMBER_VISIBLE">{isAr ? "ظاهر للمالك" : "Member visible"}</option>
            </select>
            <Button type="submit" disabled={pending} size="sm" className="rounded-xl">
              {isAr ? "إضافة تحديث" : "Add Update"}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
