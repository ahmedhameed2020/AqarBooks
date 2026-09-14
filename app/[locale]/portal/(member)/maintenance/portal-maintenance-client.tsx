"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Clock3, Plus, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cancelOwnMaintenanceRequestAction } from "@/lib/actions/maintenance";
import { EmptyState, PortalPageHeader, SearchBox, Segmented, StatCard } from "../portal-ui";

export type MaintenanceStatus =
  | "SUBMITTED"
  | "TRIAGED"
  | "IN_PROGRESS"
  | "WAITING"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export type MaintenancePriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface PortalMaintenanceRequestItem {
  id: string;
  requestNo: string;
  title: string;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  submittedAt: string;
  unitCode: string;
  categoryName: string;
  latestUpdate: string | null;
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

const PRIORITY_LABELS: Record<MaintenancePriority, { ar: string; en: string }> = {
  LOW: { ar: "منخفضة", en: "Low" },
  NORMAL: { ar: "عادية", en: "Normal" },
  HIGH: { ar: "عالية", en: "High" },
  URGENT: { ar: "عاجلة", en: "Urgent" },
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function PortalMaintenanceClient({
  requests,
  locale,
}: {
  requests: PortalMaintenanceRequestItem[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [status, setStatus] = useState<"ALL" | MaintenanceStatus>("ALL");
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (status !== "ALL" && r.status !== status) return false;
      if (!q) return true;
      return (
        r.requestNo.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.unitCode.toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q)
      );
    });
  }, [requests, query, status]);

  const openCount = requests.filter((r) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(r.status)).length;
  const completedCount = requests.filter((r) => ["COMPLETED", "CLOSED"].includes(r.status)).length;

  function cancelRequest(requestId: string) {
    setPendingId(requestId);
    startTransition(async () => {
      await cancelOwnMaintenanceRequestAction({ requestId });
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "طلبات الصيانة" : "Maintenance Requests"}
        description={
          isAr
            ? "تابع طلبات الصيانة للوحدات التي تملكها وأرسل طلبًا جديدًا من نفس البوابة."
            : "Track maintenance requests for your authorized units and submit a new one from the portal."
        }
      >
        <Link href="/portal/maintenance/new" locale={locale} className={buttonVariants({ size: "sm", className: "h-9 gap-2 rounded-xl text-xs font-semibold" })}>
          <Plus className="size-4" />
          {isAr ? "طلب جديد" : "New Request"}
        </Link>
      </PortalPageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={isAr ? "كل الطلبات" : "All requests"} value={requests.length} icon={<Wrench className="size-4" />} />
        <StatCard label={isAr ? "قيد المتابعة" : "Open"} value={openCount} tone="accent" icon={<Clock3 className="size-4" />} />
        <StatCard label={isAr ? "مكتملة" : "Completed"} value={completedCount} tone="positive" icon={<AlertCircle className="size-4" />} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          value={status}
          onChange={setStatus}
          ariaLabel={isAr ? "حالة الطلب" : "Request status"}
          options={[
            { value: "ALL", label: isAr ? "الكل" : "All", count: requests.length },
            { value: "SUBMITTED", label: STATUS_LABELS.SUBMITTED[isAr ? "ar" : "en"] },
            { value: "TRIAGED", label: STATUS_LABELS.TRIAGED[isAr ? "ar" : "en"] },
            { value: "IN_PROGRESS", label: STATUS_LABELS.IN_PROGRESS[isAr ? "ar" : "en"] },
            { value: "COMPLETED", label: STATUS_LABELS.COMPLETED[isAr ? "ar" : "en"] },
          ]}
        />
        <SearchBox
          value={query}
          onChange={setQuery}
          locale={locale}
          placeholder={isAr ? "ابحث برقم الطلب أو الوحدة" : "Search request no. or unit"}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Wrench className="size-5" />}
          title={isAr ? "لا توجد طلبات صيانة مطابقة" : "No matching maintenance requests"}
          description={
            isAr
              ? "ابدأ بطلب جديد للوحدة المناسبة، وسيظهر هنا مع حالة المتابعة."
              : "Create a request for the relevant unit, then track its status here."
          }
          action={
            <Link href="/portal/maintenance/new" locale={locale} className={buttonVariants({ size: "sm", className: "rounded-xl text-xs font-semibold" })}>
              {isAr ? "إنشاء طلب" : "Create Request"}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {visible.map((r) => {
            const canCancel = r.status === "SUBMITTED" || r.status === "TRIAGED";
            const labels = STATUS_LABELS[r.status];
            return (
              <article key={r.id} className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={labels.tone}>{isAr ? labels.ar : labels.en}</Badge>
                      <span className="text-[11px] font-semibold text-slate-400">{r.requestNo}</span>
                    </div>
                    <Link
                      href={`/portal/maintenance/${r.id}`}
                      locale={locale}
                      className="block text-sm font-bold text-slate-950 hover:text-indigo-700 dark:text-white"
                    >
                      {r.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {r.unitCode} · {r.categoryName} · {isAr ? PRIORITY_LABELS[r.priority].ar : PRIORITY_LABELS[r.priority].en}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {isAr ? "أُرسل في" : "Submitted"} {formatDate(r.submittedAt, locale)}
                    </p>
                    {r.latestUpdate ? <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{r.latestUpdate}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/portal/maintenance/${r.id}`} locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 rounded-xl text-xs" })}>
                      {isAr ? "التفاصيل" : "Details"}
                    </Link>
                    {canCancel ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending && pendingId === r.id}
                        onClick={() => cancelRequest(r.id)}
                        className="h-8 rounded-xl border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        {isAr ? "إلغاء" : "Cancel"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
