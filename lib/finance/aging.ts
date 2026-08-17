// Single source of truth for receivables aging. Consumed by the aging report
// and the unit detail financials tab so a due can never fall in different
// buckets on two screens. Logic lifted verbatim from the original
// finance/reports/aging/page.tsx.

export const AGING_BUCKETS = [
  { key: "current", labelAr: "غير مستحقة", labelEn: "Current" },
  { key: "d1_30", labelAr: "1-30 يوم", labelEn: "1-30 days" },
  { key: "d31_60", labelAr: "31-60 يوم", labelEn: "31-60 days" },
  { key: "d61_90", labelAr: "61-90 يوم", labelEn: "61-90 days" },
  { key: "d90plus", labelAr: "أكثر من 90 يوم", labelEn: "90+ days" },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export const AGING_ELIGIBLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export type DueLike = { id: string; amount: number; due_date: string; status: string };
export type AllocationLike = { due_id: string; amount: number; payment_id: string };

export function daysOverdue(dueDate: string, today: Date = new Date()): number {
  return Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000);
}

export function bucketFor(days: number): AgingBucketKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

// remaining = amount − Σ(allocations from POSTED payments only). A partially
// paid due contributes only its remaining, never its full amount.
export function remainingByDue(
  dues: DueLike[],
  allocations: AllocationLike[],
  postedPaymentIds: Set<string>,
): Map<string, number> {
  const paidByDue = new Map<string, number>();
  for (const a of allocations) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }
  const remaining = new Map<string, number>();
  for (const d of dues) remaining.set(d.id, d.amount - (paidByDue.get(d.id) ?? 0));
  return remaining;
}

export type AgingRow<D extends DueLike> = D & { remaining: number; bucket: AgingBucketKey };

export function computeAgingRows<D extends DueLike>(
  dues: D[],
  allocations: AllocationLike[],
  postedPaymentIds: Set<string>,
  today: Date = new Date(),
): AgingRow<D>[] {
  const remaining = remainingByDue(dues, allocations, postedPaymentIds);
  return dues
    .map((d) => ({ ...d, remaining: remaining.get(d.id) ?? 0, bucket: bucketFor(daysOverdue(d.due_date, today)) }))
    .filter((r) => r.remaining > 0);
}

export function totalsByBucket<D extends DueLike>(rows: AgingRow<D>[]): Map<AgingBucketKey, number> {
  const totals = new Map<AgingBucketKey, number>();
  for (const r of rows) totals.set(r.bucket, (totals.get(r.bucket) ?? 0) + r.remaining);
  return totals;
}
