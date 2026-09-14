"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateMaintenanceRequestStaffAction } from "@/lib/actions/maintenance";
import type { MaintenancePriority, MaintenanceStatus } from "@/app/[locale]/portal/(member)/maintenance/portal-maintenance-client";

const STATUSES: MaintenanceStatus[] = ["SUBMITTED", "TRIAGED", "IN_PROGRESS", "WAITING", "COMPLETED", "CLOSED", "CANCELLED"];
const PRIORITIES: MaintenancePriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function StaffMaintenanceUpdateForm({
  requestId,
  status,
  priority,
  categoryId,
  categories,
  locale,
}: {
  requestId: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  categoryId: string;
  categories: { id: string; label: string }[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [nextStatus, setNextStatus] = useState<MaintenanceStatus>(status);
  const [nextPriority, setNextPriority] = useState<MaintenancePriority>(priority);
  const [nextCategory, setNextCategory] = useState(categoryId);
  const [visibility, setVisibility] = useState<"STAFF_ONLY" | "MEMBER_VISIBLE">("STAFF_ONLY");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateMaintenanceRequestStaffAction({
        requestId,
        nextStatus,
        priority: nextPriority,
        categoryId: nextCategory,
        note,
        visibility,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("ok");
      setNote("");
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
      <div>
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "تحديث الطلب" : "Update Request"}</h2>
        <p className="text-xs text-slate-500">
          {isAr ? "كل انتقال حالة يتم التحقق منه في قاعدة البيانات." : "Every status transition is validated in the database."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-semibold text-slate-600">
          <span>{isAr ? "الحالة" : "Status"}</span>
          <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as MaintenanceStatus)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-600">
          <span>{isAr ? "التصنيف" : "Category"}</span>
          <select value={nextCategory} onChange={(e) => setNextCategory(e.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold text-slate-600">
          <span>{isAr ? "الأولوية" : "Priority"}</span>
          <select value={nextPriority} onChange={(e) => setNextPriority(e.target.value as MaintenancePriority)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <label className="space-y-1 text-xs font-semibold text-slate-600">
        <span>{isAr ? "ملاحظة" : "Note"}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          placeholder={isAr ? "اكتب تحديثًا داخليًا أو ظاهرًا للعضو." : "Add an internal or member-visible update."}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as "STAFF_ONLY" | "MEMBER_VISIBLE")} className="h-9 rounded-xl border border-input bg-background px-3 text-xs font-semibold">
          <option value="STAFF_ONLY">{isAr ? "داخلي فقط" : "Staff only"}</option>
          <option value="MEMBER_VISIBLE">{isAr ? "ظاهر للعضو" : "Member visible"}</option>
        </select>
        <Button type="button" disabled={isPending} onClick={submit} className="h-9 gap-2 rounded-xl text-xs font-semibold">
          <Save className="size-4" />
          {isAr ? "حفظ التحديث" : "Save Update"}
        </Button>
      </div>
      {message ? (
        <p className={`text-xs font-semibold ${message === "ok" ? "text-emerald-600" : "text-rose-600"}`}>
          {message === "ok"
            ? isAr ? "تم حفظ التحديث." : "Update saved."
            : isAr ? "تعذر حفظ التحديث." : `Update failed: ${message}`}
        </p>
      ) : null}
    </section>
  );
}
