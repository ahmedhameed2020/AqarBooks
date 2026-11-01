import { createClient } from "@/lib/supabase/server";
import { computePosition, type OwnPosition } from "@/lib/portal/statement-position";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in owner's position as of a date.
 *  - dues and the amount SETTLED on each (by any receipt in force, an amount only) come from own_statement_dues, so a due that a
 *    previous owner's receipt paid is not counted as a new debt, and the dues of a member whose ownership ended stay on their statement;
 *  - the owner's own advance credit comes from payment_credit_balances_as_of (member-scoped);
 *  - the unallocated remainder of the owner's LEGACY receipts (not credit, not applicable) comes from their own receipts and the
 *    allocations in force, so the net agrees with a statement that counts every receipt in full.
 */
export async function loadOwnPosition(supabase: Client, organizationId: string, memberId: string, asOf: string): Promise<OwnPosition | null> {
  const [{ data: dues, error: duesError }, { data: credit, error: creditError }, { data: receipts, error: receiptsError }, { data: allocations, error: allocError }] = await Promise.all([
    supabase.rpc("own_statement_dues", { p_org: organizationId, p_as_of: asOf }),
    supabase.rpc("payment_credit_balances_as_of", { p_org: organizationId, p_as_of: asOf }),
    supabase.rpc("own_statement_receipts", { p_org: organizationId }),
    supabase.rpc("payment_allocations_as_of", { p_org: organizationId, p_as_of: asOf }),
  ]);
  if (duesError || creditError || receiptsError || allocError) return null;
  const myCredit = (credit ?? []).filter((c) => c.member_id === memberId);
  const myReceipts = receipts ?? [];
  const myIds = new Set(myReceipts.map((r) => r.payment_id));
  return computePosition({
    asOf,
    dues: (dues ?? []).map((d) => ({ id: d.due_id, amount: Number(d.amount), issueDate: d.issue_date, dueDate: d.due_date, settled: Number(d.settled_amount) })),
    allocations: [],
    advances: myCredit.map((c) => ({ amount: Number(c.advance_amount), remaining: Number(c.remaining_amount) })),
    receipts: myReceipts.map((r) => ({ id: r.payment_id, amount: Number(r.amount), advance: Number(r.advance_amount), paymentDate: r.payment_date, reversedOn: r.reversed_on })),
    receiptAllocations: (allocations ?? []).filter((a) => myIds.has(a.payment_id)).map((a) => ({ paymentId: a.payment_id, amount: Number(a.amount), appliedOn: a.applied_on, kind: a.kind })),
  });
}
