import type { MaintenanceStatus } from "../portal-maintenance-client";

export const STATUS_LABELS_FOR_DETAIL: Record<MaintenanceStatus, { ar: string; en: string; tone: string }> = {
  SUBMITTED: { ar: "مُرسل", en: "Submitted", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  TRIAGED: { ar: "تمت المراجعة", en: "Triaged", tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  WAITING: { ar: "بانتظار متابعة", en: "Waiting", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  COMPLETED: { ar: "مكتمل", en: "Completed", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CLOSED: { ar: "مغلق", en: "Closed", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  CANCELLED: { ar: "ملغي", en: "Cancelled", tone: "bg-rose-50 text-rose-700 border-rose-200" },
};
