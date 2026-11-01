/**
 * The owner's position AS OF a date, from dues, effective allocations and customer-advance receipts.
 *
 *   outstanding = what the issued dues still owe on that date (receipt allocations AND credit applications both reduce it)
 *   credit      = advances received up to that date, minus the applications in force on it
 *   legacy      = what the owner paid on account that no due absorbs and that is NOT customer-advance credit: receipts with an
 *                 unallocated remainder from before customer advances (Accsys imports...). They keep their old meaning -- cash received
 *                 against the account, reducing what the owner owes on the statement -- and get no new capability (they cannot be applied).
 *   net         = outstanding - credit.remaining - legacy
 *
 * Applying credit lowers `outstanding` and `credit.remaining` by the same amount, and reversing it raises both: the net never moves.
 * A receipt is counted once, either as an allocation to a due or as credit, so nothing is deducted twice.
 */
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** `settled`, when given, is the amount settled on the due as of the date by ANY receipt in force (own_statement_dues); otherwise it is summed from `allocations`. */
export type PositionDue = { id: string; amount: number; issueDate: string; dueDate: string; settled?: number };
export type PositionAllocation = { dueId: string; amount: number; appliedOn: string; reversedOn?: string | null };
export type PositionAdvance = { amount: number; remaining: number };
/** an own receipt as own_statement_receipts reports it */
export type PositionReceipt = { id: string; amount: number; advance: number; paymentDate: string; reversedOn?: string | null };
/** a receipt allocation row as payment_allocations_as_of reports it (kind RECEIPT = the receipt's own allocation, not a credit application) */
export type PositionReceiptAllocation = { paymentId: string; amount: number; appliedOn: string; kind: string };
export type OwnPosition = {
  asOf: string;
  outstanding: number;
  arrears: number;
  credit: { received: number; applied: number; remaining: number };
  /** unallocated remainder of legacy receipts in force on the date (not credit, not applicable) */
  legacyUnallocated: number;
  net: number;
};

/** `allocations` must already be limited to the receipts in force on `asOf`; reversal/application dates are re-checked here. */
export function computePosition(input: {
  asOf: string;
  dues: PositionDue[];
  allocations: PositionAllocation[];
  advances: PositionAdvance[];
  receipts?: PositionReceipt[];
  receiptAllocations?: PositionReceiptAllocation[];
}): OwnPosition {
  const { asOf } = input;
  const inForce = input.allocations.filter((a) => a.appliedOn <= asOf && (!a.reversedOn || a.reversedOn > asOf));
  const allocated = new Map<string, number>();
  for (const a of inForce) allocated.set(a.dueId, (allocated.get(a.dueId) ?? 0) + a.amount);

  let outstanding = 0;
  let arrears = 0;
  for (const d of input.dues) {
    if (d.issueDate > asOf) continue;
    const left = Math.max(0, r4(d.amount - (d.settled ?? allocated.get(d.id) ?? 0)));
    outstanding += left;
    if (d.dueDate < asOf) arrears += left;
  }
  // legacy remainder: for each receipt in force on the date, amount - advance part - its own allocations in force. New-style receipts
  // (record_payment, record_advance_payment) leave exactly 0 here; only an old receipt with an unallocated remainder leaves something.
  let legacy = 0;
  for (const r of input.receipts ?? []) {
    if (r.paymentDate > asOf || (r.reversedOn && r.reversedOn <= asOf)) continue;
    const own = (input.receiptAllocations ?? [])
      .filter((a) => a.paymentId === r.id && a.kind === "RECEIPT" && a.appliedOn <= asOf)
      .reduce((s, a) => s + a.amount, 0);
    legacy += Math.max(0, r4(r.amount - r.advance - own));
  }
  const received = input.advances.reduce((s, a) => s + a.amount, 0);
  const remaining = input.advances.reduce((s, a) => s + a.remaining, 0);
  return {
    asOf,
    outstanding: r4(outstanding),
    arrears: r4(arrears),
    credit: { received: r4(received), applied: r4(received - remaining), remaining: r4(remaining) },
    legacyUnallocated: r4(legacy),
    net: r4(outstanding - remaining - legacy),
  };
}
