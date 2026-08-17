// Monthly dues-issued vs payments-received series for one unit's financials
// tab. Payments link to a unit only through payment_allocations -> dues.unit_id
// (payments.unit_id is null in production), so the caller passes the allocation
// amounts already resolved per payment.

export type MonthlyFinancialPoint = { month: string; dued: number; paid: number };

type DueRow = { issue_date: string | null; due_date: string; amount: number; status: string };
type PaidRow = { payment_date: string; amount: number };

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7); // YYYY-MM
}

// Build a continuous month axis between the earliest and latest event so the
// chart never shows gaps. Returns [] when there are no events at all.
export function buildMonthlyFinancials(dues: DueRow[], paid: PaidRow[]): MonthlyFinancialPoint[] {
  const duedByMonth = new Map<string, number>();
  const paidByMonth = new Map<string, number>();

  for (const d of dues) {
    if (d.status === "VOID") continue;
    const key = monthKey(d.issue_date ?? d.due_date);
    duedByMonth.set(key, (duedByMonth.get(key) ?? 0) + d.amount);
  }
  for (const p of paid) {
    const key = monthKey(p.payment_date);
    paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + p.amount);
  }

  const keys = [...new Set([...duedByMonth.keys(), ...paidByMonth.keys()])].sort();
  if (keys.length === 0) return [];

  const out: MonthlyFinancialPoint[] = [];
  let cursor = keys[0];
  const last = keys[keys.length - 1];
  // walk month-by-month from first to last inclusive
  while (cursor <= last) {
    out.push({ month: cursor, dued: duedByMonth.get(cursor) ?? 0, paid: paidByMonth.get(cursor) ?? 0 });
    cursor = nextMonth(cursor);
  }
  return out;
}

function nextMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
