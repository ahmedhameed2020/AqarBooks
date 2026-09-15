"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Search, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type WorkOrderStatus = "DRAFT" | "ASSIGNED" | "SCHEDULED" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";

export interface WorkOrderListItem {
  id: string;
  workOrderNo: string;
  requestNo: string;
  requestTitle: string;
  status: WorkOrderStatus;
  unitCode: string;
  propertyName: string;
  assigneeName: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  slaDueAt: string | null;
  createdAt: string;
}

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, { ar: string; en: string; tone: string }> = {
  DRAFT: { ar: "مسودة", en: "Draft", tone: "bg-slate-50 text-slate-700 border-slate-200" },
  ASSIGNED: { ar: "مُسند", en: "Assigned", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  SCHEDULED: { ar: "مجدول", en: "Scheduled", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  WAITING: { ar: "بانتظار متابعة", en: "Waiting", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  COMPLETED: { ar: "مكتمل", en: "Completed", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED: { ar: "ملغي", en: "Cancelled", tone: "bg-rose-50 text-rose-700 border-rose-200" },
};

export function WorkOrdersClient({ workOrders, locale }: { workOrders: WorkOrderListItem[]; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | WorkOrderStatus>("ALL");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (status !== "ALL" && wo.status !== status) return false;
      if (!q) return true;
      return [wo.workOrderNo, wo.requestNo, wo.requestTitle, wo.unitCode, wo.propertyName, wo.assigneeName]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [workOrders, query, status]);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "أوامر عمل الصيانة" : "Maintenance Work Orders"}
          </h1>
          <p className="text-xs font-medium text-slate-500">
            {isAr ? "إسناد وجدولة وتنفيذ أوامر العمل بدون أي أثر محاسبي." : "Assignment, scheduling, and SLA tracking with no accounting posting."}
          </p>
        </div>
        <Link href="/operations/maintenance" locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "طلبات الصيانة" : "Maintenance Requests"}
        </Link>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isAr ? "بحث بأمر العمل أو الطلب أو الوحدة" : "Search work order, request, or unit"} className="h-10 rounded-xl ps-9 text-sm" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as "ALL" | WorkOrderStatus)} className="h-10 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="ALL">{isAr ? "كل الحالات" : "All statuses"}</option>
          {Object.entries(WORK_ORDER_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{isAr ? label.ar : label.en}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs">
        <div className="hidden grid-cols-[1fr_1fr_.8fr_.8fr_.8fr_auto] gap-3 border-b border-border/70 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500 lg:grid">
          <span>{isAr ? "أمر العمل" : "Work order"}</span>
          <span>{isAr ? "طلب الصيانة" : "Request"}</span>
          <span>{isAr ? "الموقع" : "Location"}</span>
          <span>{isAr ? "المسؤول" : "Assignee"}</span>
          <span>{isAr ? "الحالة" : "Status"}</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-slate-50 text-slate-400">
              <Wrench className="size-5" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد أوامر عمل مطابقة" : "No matching work orders"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {visible.map((wo) => {
              const label = WORK_ORDER_STATUS_LABELS[wo.status];
              return (
                <div key={wo.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_1fr_.8fr_.8fr_.8fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-400">{wo.workOrderNo}</p>
                    <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{wo.assigneeName}</p>
                    {wo.slaDueAt ? (
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <CalendarClock className="size-3" />
                        {new Date(wo.slaDueAt).toLocaleString(isAr ? "ar-EG" : "en-US")}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-400">{wo.requestNo}</p>
                    <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{wo.requestTitle}</p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{wo.propertyName} · {wo.unitCode}</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{wo.assigneeName}</p>
                  <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
                  <Link href={`/operations/maintenance/work-orders/${wo.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
                    {isAr ? "فتح" : "Open"}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
