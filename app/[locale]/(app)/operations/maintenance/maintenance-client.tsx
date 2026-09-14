"use client";

import { useMemo, useState } from "react";
import { Search, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MaintenancePriority, MaintenanceStatus } from "@/app/[locale]/portal/(member)/maintenance/portal-maintenance-client";

export interface StaffMaintenanceItem {
  id: string;
  requestNo: string;
  title: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  submittedAt: string;
  unitCode: string;
  propertyName: string;
  memberName: string;
  categoryName: string;
}

const STATUS_LABELS: Record<MaintenanceStatus, { ar: string; en: string; tone: string }> = {
  SUBMITTED: { ar: "مُرسل", en: "Submitted", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  TRIAGED: { ar: "تمت المراجعة", en: "Triaged", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  WAITING: { ar: "بانتظار متابعة", en: "Waiting", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  COMPLETED: { ar: "مكتمل", en: "Completed", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CLOSED: { ar: "مغلق", en: "Closed", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  CANCELLED: { ar: "ملغي", en: "Cancelled", tone: "bg-rose-50 text-rose-700 border-rose-200" },
};

export function StaffMaintenanceClient({
  requests,
  locale,
}: {
  requests: StaffMaintenanceItem[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | MaintenanceStatus>("ALL");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!q) return true;
      return [r.requestNo, r.title, r.unitCode, r.propertyName, r.memberName, r.categoryName]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [requests, query, status]);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "عمليات الصيانة" : "Maintenance Operations"}
          </h1>
          <p className="text-xs font-medium text-slate-500">
            {isAr ? "طلبات الصيانة الواردة من بوابة الملاك بدون أوامر عمل أو محاسبة." : "Owner portal maintenance requests without work orders or accounting impact."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "بحث بالطلب أو الوحدة أو العضو" : "Search request, unit, or member"}
            className="h-10 rounded-xl ps-9 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "ALL" | MaintenanceStatus)}
          className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
        >
          <option value="ALL">{isAr ? "كل الحالات" : "All statuses"}</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{isAr ? label.ar : label.en}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xs">
        <div className="hidden grid-cols-[1.1fr_1fr_.8fr_.8fr_.8fr_auto] gap-3 border-b border-border/70 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase text-slate-500 lg:grid">
          <span>{isAr ? "الطلب" : "Request"}</span>
          <span>{isAr ? "الموقع" : "Location"}</span>
          <span>{isAr ? "العضو" : "Member"}</span>
          <span>{isAr ? "الحالة" : "Status"}</span>
          <span>{isAr ? "الأولوية" : "Priority"}</span>
          <span />
        </div>
        {visible.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-slate-50 text-slate-400">
              <Wrench className="size-5" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "لا توجد طلبات مطابقة" : "No matching requests"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/70">
            {visible.map((r) => {
              const label = STATUS_LABELS[r.status];
              return (
                <div key={r.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_1fr_.8fr_.8fr_.8fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-400">{r.requestNo}</p>
                    <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{r.title}</p>
                    <p className="text-[11px] text-slate-500">{r.categoryName}</p>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{r.propertyName} · {r.unitCode}</p>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{r.memberName}</p>
                  <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
                  <p className="text-xs font-semibold text-slate-500">{r.priority}</p>
                  <Link href={`/operations/maintenance/${r.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
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
