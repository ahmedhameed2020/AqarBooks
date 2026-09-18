export type LeaseRenewalStatus = "REQUESTED" | "APPROVED" | "REJECTED";

export const LEASE_RENEWAL_STATUS_COPY: Record<
  LeaseRenewalStatus,
  { ar: string; en: string; tone: "warning" | "success" | "destructive" }
> = {
  REQUESTED: { ar: "قيد المراجعة", en: "Under review", tone: "warning" },
  APPROVED: { ar: "تمت الموافقة", en: "Approved", tone: "success" },
  REJECTED: { ar: "مرفوض", en: "Rejected", tone: "destructive" },
};

export function leaseRenewalErrorMessage(error: string, locale: "ar" | "en") {
  const isAr = locale === "ar";
  if (/LEASE_RENEWAL_NOT_FOUND/i.test(error)) {
    return isAr ? "تعذر العثور على طلب تجديد متاح لك." : "The renewal request is not available.";
  }
  if (/LEASE_RENEWAL_INVALID_TERMS/i.test(error)) {
    return isAr ? "تواريخ أو شروط التجديد غير صالحة." : "The proposed renewal terms are invalid.";
  }
  if (/LEASE_RENEWAL_INVALID_STATE/i.test(error)) {
    return isAr ? "تغيّرت حالة الطلب. حدّث الصفحة للمراجعة." : "The request changed. Refresh the page to review it.";
  }
  if (/LEASE_RENEWAL_DECISION_REASON_REQUIRED/i.test(error)) {
    return isAr ? "سبب الرفض مطلوب." : "A rejection reason is required.";
  }
  return isAr ? "تعذر إكمال العملية. حاول مجددًا." : "The action could not be completed. Please try again.";
}

export function formatLeaseDate(value: string | null, locale: "ar" | "en") {
  if (!value) return locale === "ar" ? "غير محدد" : "Open-ended";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
