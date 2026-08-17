// Derived "unit history" — there is no audit table, so the activity feed is
// synthesized from real timestamped events. Presented as history, not audit.

export type ActivityKind = "due_issued" | "payment_received" | "ownership_start" | "ownership_end" | "unit_created";

export type ActivityEvent = {
  kind: ActivityKind;
  date: string; // ISO date (YYYY-MM-DD)
  amount?: number;
  label: string; // pre-resolved for the active locale
};

type DueEvt = { issue_date: string | null; due_date: string; amount: number; type: string; status: string };
type PayEvt = { payment_date: string; amount: number; method: string };
type OwnEvt = { start_date: string; end_date: string | null; member_name: string };

export function buildActivity(
  createdAt: string,
  dues: DueEvt[],
  payments: PayEvt[],
  ownerships: OwnEvt[],
  isAr: boolean,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  events.push({
    kind: "unit_created",
    date: createdAt.slice(0, 10),
    label: isAr ? "تم تسجيل الوحدة" : "Unit registered",
  });

  for (const d of dues) {
    if (d.status === "VOID") continue;
    events.push({
      kind: "due_issued",
      date: (d.issue_date ?? d.due_date).slice(0, 10),
      amount: d.amount,
      label: isAr ? `إصدار استحقاق: ${d.type}` : `Due issued: ${d.type}`,
    });
  }
  for (const p of payments) {
    events.push({
      kind: "payment_received",
      date: p.payment_date.slice(0, 10),
      amount: p.amount,
      label: isAr ? "استلام دفعة" : "Payment received",
    });
  }
  for (const o of ownerships) {
    events.push({
      kind: "ownership_start",
      date: o.start_date.slice(0, 10),
      label: isAr ? `بدء ملكية: ${o.member_name}` : `Ownership started: ${o.member_name}`,
    });
    if (o.end_date) {
      events.push({
        kind: "ownership_end",
        date: o.end_date.slice(0, 10),
        label: isAr ? `انتهاء ملكية: ${o.member_name}` : `Ownership ended: ${o.member_name}`,
      });
    }
  }

  // newest first; stable across equal dates
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export type OwnershipHistoryRow = {
  member_id: string;
  member_name: string;
  share_percentage: number;
  is_primary_contact: boolean;
  start_date: string;
  end_date: string | null;
  active: boolean;
};

export function shapeOwnershipHistory(
  rows: { member_id: string; share_percentage: number; is_primary_contact: boolean; start_date: string; end_date: string | null }[],
  memberNameById: Map<string, string>,
  today: string,
): OwnershipHistoryRow[] {
  return rows
    .map((r) => ({
      member_id: r.member_id,
      member_name: memberNameById.get(r.member_id) ?? "—",
      share_percentage: r.share_percentage,
      is_primary_contact: r.is_primary_contact,
      start_date: r.start_date,
      end_date: r.end_date,
      active: !r.end_date || r.end_date >= today,
    }))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
}
