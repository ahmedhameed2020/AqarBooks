// The ONE way application code reads what has been settled against dues.
//
//   * effective now  -> `effective_payment_allocations` (a security-invoker view): allocations that are not reversed and whose
//     receipt is POSTED. A reversed credit application, a voided receipt's allocations and an unposted receipt never appear.
//   * effective at a past date D -> `payment_allocations_as_of(org, D)`: applied_on <= D and not reversed on or before D, only
//     for receipts with a posted (or since reversed) receipt entry. A statement for a closed month therefore never changes
//     because something was applied or reversed later.
//
// Reading `payment_allocations` directly is reserved for history listings and the per-receipt lookup (see the whitelist in
// tests/payment-allocation-readers-guard.test.ts); a new balance-bearing reader must use one of the two above.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export const EFFECTIVE_ALLOCATIONS_VIEW = "effective_payment_allocations" as const;

export type AllocationAsOfRow = Database["public"]["Functions"]["payment_allocations_as_of"]["Returns"][number];

/** Effective allocations for the given dues, as of now. */
export async function fetchEffectiveAllocations(supabase: Client, dueIds: string[]) {
  if (dueIds.length === 0) return { data: [] as { due_id: string; payment_id: string; amount: number }[], error: null };
  const { data, error } = await supabase.from(EFFECTIVE_ALLOCATIONS_VIEW).select("due_id, payment_id, amount").in("due_id", dueIds);
  return { data: data ?? [], error };
}

/** Effective allocations of an organization at `asOf` (YYYY-MM-DD). Future dates are allowed to be read; V1 forbids writing them. */
export async function fetchAllocationsAsOf(supabase: Client, organizationId: string, asOf: string) {
  const { data, error } = await supabase.rpc("payment_allocations_as_of", { p_org: organizationId, p_as_of: asOf });
  return { data: (data ?? []) as AllocationAsOfRow[], error };
}

/** Σ amount per due from allocation rows (the figure every page subtracts from `dues.amount`). */
export function paidByDue(rows: ReadonlyArray<{ due_id: string; amount: number | string }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.due_id, (out.get(r.due_id) ?? 0) + Number(r.amount));
  return out;
}
