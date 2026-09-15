export type VisitorUsagePolicy = "SINGLE_USE" | "MULTI_USE";
export type VisitorInvitationStatus = "ACTIVE" | "REVOKED";
export type VisitorEffectiveStatus = VisitorInvitationStatus | "UPCOMING" | "EXPIRED";

export function getVisitorEffectiveStatus(row: {
  status: VisitorInvitationStatus;
  valid_from: string;
  valid_until: string;
}): VisitorEffectiveStatus {
  if (row.status === "REVOKED") return "REVOKED";
  const now = Date.now();
  if (new Date(row.valid_from).getTime() > now) return "UPCOMING";
  if (new Date(row.valid_until).getTime() <= now) return "EXPIRED";
  return "ACTIVE";
}

export const VISITOR_STATUS_LABELS: Record<VisitorEffectiveStatus, { ar: string; en: string; tone: string }> = {
  UPCOMING: { ar: "قادمة", en: "Upcoming", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  ACTIVE: { ar: "نشطة", en: "Active", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  EXPIRED: { ar: "منتهية", en: "Expired", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  REVOKED: { ar: "ملغاة", en: "Revoked", tone: "bg-rose-50 text-rose-700 border-rose-200" },
};

export const VISITOR_USAGE_LABELS: Record<VisitorUsagePolicy, { ar: string; en: string }> = {
  SINGLE_USE: { ar: "دخول واحد", en: "Single use" },
  MULTI_USE: { ar: "متعدد الاستخدام", en: "Multi-use" },
};
