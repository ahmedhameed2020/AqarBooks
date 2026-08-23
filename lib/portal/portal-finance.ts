// Shared financial vocabulary for the owner portal.
//
// Two things live here because getting them wrong on any one page would make
// that page disagree with the others about what the owner owes:
//
//  1. OUTSTANDING vs GROSS. `dues.amount` is the amount originally charged; it
//     is never reduced when a payment lands. What a due still costs is
//     `amount - (sum of its non-reversed payment_allocations)`. A page that
//     shows `amount` for a PARTIALLY_PAID due overstates the debt.
//  2. AGING. Buckets are measured from `due_date` against today, and a due
//     that is not yet due belongs in CURRENT -- not in the 1-30 bucket just
//     because it was issued a fortnight ago.

export const AGING_BUCKETS = ["CURRENT", "D1_30", "D31_60", "D61_90", "D90_PLUS"] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_BUCKET_LABELS: Record<AgingBucket, { ar: string; en: string }> = {
  CURRENT: { ar: "غير مستحق بعد", en: "Not yet due" },
  D1_30: { ar: "متأخر ١–٣٠ يوم", en: "1–30 days" },
  D31_60: { ar: "متأخر ٣١–٦٠ يوم", en: "31–60 days" },
  D61_90: { ar: "متأخر ٦١–٩٠ يوم", en: "61–90 days" },
  D90_PLUS: { ar: "متأخر أكثر من ٩٠ يوم", en: "Over 90 days" },
};

/** Tailwind accent per bucket, so aging reads the same on every portal page. */
export const AGING_BUCKET_TONE: Record<AgingBucket, string> = {
  CURRENT: "bg-slate-400",
  D1_30: "bg-amber-400",
  D31_60: "bg-orange-500",
  D61_90: "bg-rose-500",
  D90_PLUS: "bg-rose-700",
};

/** Whole days elapsed since `dueDate`; negative while the due is still future. */
export function daysOverdue(dueDate: string, today: Date = new Date()): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(due)) return 0;
  const ref = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((ref - due) / 86_400_000);
}

export function agingBucketOf(dueDate: string, today: Date = new Date()): AgingBucket {
  const days = daysOverdue(dueDate, today);
  if (days <= 0) return "CURRENT";
  if (days <= 30) return "D1_30";
  if (days <= 60) return "D31_60";
  if (days <= 90) return "D61_90";
  return "D90_PLUS";
}

/**
 * A due enriched with what has actually been settled against it. `paid` is
 * summed from the member's own visible, non-reversed allocations; the portal's
 * payment_allocations RLS policy already restricts those to POSTED payments
 * belonging to this member, so no extra status filtering is needed here.
 */
export interface OutstandingDue {
  id: string;
  amount: number;
  paid: number;
  outstanding: number;
  issue_date: string;
  due_date: string;
  description: string | null;
  status: string;
  unitCode: string | null;
  bucket: AgingBucket;
  daysOverdue: number;
  /** True once any part of it has been settled -- drives the checkout guard. */
  isPartiallySettled: boolean;
}

/** Money formatted for PDF/Excel strings, where no React component is available. */
export function formatAmount(amount: number, locale: string): string {
  return amount.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** ISO date `months` before today -- the backing value for the range presets. */
export function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Localized "from → to" descriptor for report headers. */
export function periodLabel(from: string | null, to: string | null, isAr: boolean): string {
  if (from && to) return `${from} → ${to}`;
  if (from) return isAr ? `من ${from}` : `From ${from}`;
  if (to) return isAr ? `حتى ${to}` : `Up to ${to}`;
  return isAr ? "كل الحركات" : "All activity";
}
