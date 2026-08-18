"use client";

import { useActionState } from "react";
import { KeyRound, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addHandoverSnagAction,
  completeHandoverAction,
  resolveHandoverSnagAction,
  scheduleHandoverAction,
} from "@/lib/actions/property";
import type { ActionResult } from "@/lib/actions/platform";

export type Handover = {
  id: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  scheduled_date: string | null;
  completed_date: string | null;
  electricity_reading: number | null;
  water_reading: number | null;
  gas_reading: number | null;
  note: string | null;
};

export type Snag = {
  id: string;
  description: string;
  severity: "BLOCKING" | "MINOR";
  status: "OPEN" | "RESOLVED";
};

function message(error: string, isAr: boolean) {
  if (error.includes("HANDOVER_BLOCKED_BY_SNAGS")) {
    const n = error.match(/ولديك\s+(\d+)/)?.[1] ?? error.match(/(\d+)/)?.[1] ?? "";
    return isAr
      ? `لا يمكن اعتماد التسليم و${n} ملاحظة حاسمة ما زالت مفتوحة. أغلقها أولًا، أو خفّض تصنيفها إن لم تكن مانعة للاستلام.`
      : `Cannot complete while ${n} blocking defect(s) remain open. Resolve them, or downgrade them if they don't actually prevent occupancy.`;
  }
  if (error.includes("HANDOVER_ALREADY_COMPLETED"))
    return isAr ? "تم تسليم هذه الوحدة بالفعل." : "This unit has already been handed over.";
  if (error.includes("FORBIDDEN"))
    return isAr ? "لا تملك صلاحية إدارة التسليم." : "You don't have permission to manage handovers.";
  if (error === "invalid_input") return isAr ? "تحقق من البيانات." : "Check the values entered.";
  return error;
}

function Err({ state, isAr }: { state: ActionResult; isAr: boolean }) {
  if (state.ok !== false) return null;
  return <p className="text-sm text-destructive">{message(state.error, isAr)}</p>;
}

export function HandoverPanel({
  organizationId,
  unitId,
  handover,
  snags,
  locale,
  canManage,
}: {
  organizationId: string;
  unitId: string;
  handover: Handover | null;
  snags: Snag[];
  locale: string;
  canManage: boolean;
}) {
  const isAr = locale === "ar";
  const today = new Date().toISOString().slice(0, 10);

  const [scheduleState, scheduleAction, schedulePending] = useActionState<ActionResult, FormData>(
    scheduleHandoverAction,
    { ok: true },
  );
  const [snagState, snagAction, snagPending] = useActionState<ActionResult, FormData>(
    addHandoverSnagAction,
    { ok: true },
  );
  const [resolveState, resolveAction] = useActionState<ActionResult, FormData>(
    resolveHandoverSnagAction,
    { ok: true },
  );
  const [completeState, completeAction, completePending] = useActionState<ActionResult, FormData>(
    completeHandoverAction,
    { ok: true },
  );

  const openBlocking = snags.filter((s) => s.severity === "BLOCKING" && s.status === "OPEN").length;
  const isCompleted = handover?.status === "COMPLETED";

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{isAr ? "تسليم الوحدة" : "Unit handover"}</h3>
        {handover && (
          <Badge variant={isCompleted ? "default" : "secondary"}>
            {isCompleted
              ? isAr
                ? `سُلِّمت ${handover.completed_date}`
                : `Handed over ${handover.completed_date}`
              : isAr
                ? `مجدولة ${handover.scheduled_date ?? ""}`
                : `Scheduled ${handover.scheduled_date ?? ""}`}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {isAr
            ? "التسليم لا يُنشئ قيدًا محاسبيًا، لكنه يفتح فوترة رسوم الخدمة"
            : "creates no ledger entry, but opens service-charge billing"}
        </span>
      </div>

      {!handover && canManage && (
        <form action={scheduleAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="unitId" value={unitId} />
          <div className="space-y-1.5">
            <Label htmlFor="scheduledDate">{isAr ? "تاريخ التسليم المقرر" : "Scheduled date"}</Label>
            <Input id="scheduledDate" name="scheduledDate" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="note">{isAr ? "ملاحظة" : "Note"}</Label>
            <Input id="note" name="note" />
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" size="sm" disabled={schedulePending}>
              {isAr ? "جدولة التسليم" : "Schedule handover"}
            </Button>
            <Err state={scheduleState} isAr={isAr} />
          </div>
        </form>
      )}

      {!handover && !canManage && (
        <p className="text-sm text-muted-foreground">
          {isAr ? "لم تُجدول عملية تسليم لهذه الوحدة." : "No handover has been scheduled for this unit."}
        </p>
      )}

      {handover && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              {isAr ? "قائمة الملاحظات" : "Snag list"}
              {openBlocking > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" />
                  {isAr ? `${openBlocking} حاسمة مفتوحة` : `${openBlocking} blocking open`}
                </span>
              )}
            </div>
            {snags.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isAr ? "لا توجد ملاحظات مسجّلة." : "No defects recorded."}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {snags.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 border-t pt-1">
                    <Badge variant={s.severity === "BLOCKING" ? "destructive" : "outline"}>
                      {s.severity === "BLOCKING"
                        ? isAr ? "حاسمة" : "Blocking"
                        : isAr ? "ثانوية" : "Minor"}
                    </Badge>
                    <span className={s.status === "RESOLVED" ? "text-muted-foreground line-through" : ""}>
                      {s.description}
                    </span>
                    {s.status === "OPEN" && canManage && !isCompleted && (
                      <form action={resolveAction}>
                        <input type="hidden" name="snagId" value={s.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          {isAr ? "إغلاق" : "Resolve"}
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Err state={resolveState} isAr={isAr} />
          </div>

          {canManage && !isCompleted && (
            <form action={snagAction} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="handoverId" value={handover.id} />
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="description">{isAr ? "ملاحظة جديدة" : "New defect"}</Label>
                <Input id="description" name="description" required />
              </div>
              <select
                name="severity"
                defaultValue="MINOR"
                className="rounded-md border border-input bg-transparent p-2 text-sm"
              >
                <option value="MINOR">{isAr ? "ثانوية" : "Minor"}</option>
                <option value="BLOCKING">{isAr ? "حاسمة" : "Blocking"}</option>
              </select>
              <Button type="submit" size="sm" variant="outline" disabled={snagPending}>
                {isAr ? "إضافة" : "Add"}
              </Button>
              <Err state={snagState} isAr={isAr} />
            </form>
          )}

          {canManage && !isCompleted && (
            <form action={completeAction} className="grid gap-3 border-t pt-3 sm:grid-cols-4">
              <input type="hidden" name="handoverId" value={handover.id} />
              <div className="space-y-1.5">
                <Label htmlFor="completedDate">{isAr ? "تاريخ الاستلام" : "Completion date"}</Label>
                <Input id="completedDate" name="completedDate" type="date" required defaultValue={today} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="electricityReading">{isAr ? "عداد الكهرباء" : "Electricity"}</Label>
                <Input id="electricityReading" name="electricityReading" type="number" step="0.001" className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="waterReading">{isAr ? "عداد المياه" : "Water"}</Label>
                <Input id="waterReading" name="waterReading" type="number" step="0.001" className="tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gasReading">{isAr ? "عداد الغاز" : "Gas"}</Label>
                <Input id="gasReading" name="gasReading" type="number" step="0.001" className="tabular-nums" />
              </div>
              <div className="flex items-center gap-3 sm:col-span-4">
                <Button type="submit" disabled={completePending || openBlocking > 0}>
                  {isAr ? "اعتماد التسليم" : "Complete handover"}
                </Button>
                {openBlocking > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {isAr
                      ? "الاعتماد متاح بعد إغلاق كل الملاحظات الحاسمة."
                      : "Completion unlocks once every blocking defect is resolved."}
                  </span>
                )}
                <Err state={completeState} isAr={isAr} />
              </div>
            </form>
          )}

          {isCompleted && (
            <p className="border-t pt-3 text-sm text-muted-foreground">
              {isAr ? "قراءات العدادات عند التسليم" : "Meter readings at handover"}:{" "}
              {isAr ? "كهرباء" : "electricity"} {handover.electricity_reading ?? "—"} ·{" "}
              {isAr ? "مياه" : "water"} {handover.water_reading ?? "—"} ·{" "}
              {isAr ? "غاز" : "gas"} {handover.gas_reading ?? "—"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
