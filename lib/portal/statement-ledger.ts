/**
 * The owner statement's arithmetic, in one place so the screen, the PDF and the Excel export cannot disagree.
 *
 *   CHARGE            debit   (+)  a due issued to the owner
 *   PAYMENT           credit  (-)  a receipt, on its own date
 *   PAYMENT_REVERSAL  debit   (+)  the same receipt voided: dated at the ACTUAL reversal entry, never "today"
 *   SETTLEMENT        credit  (-)  a due of the owner settled by ANOTHER payer's receipt (a previous owner, a tenant...): amount and date only
 *   SETTLEMENT_REVERSAL debit (+)  that settlement undone
 *   APPLICATION / REVERSAL         information lines of a customer-advance credit: no amount in either column, no effect (0)
 */
export type LedgerKind = "CHARGE" | "PAYMENT" | "PAYMENT_REVERSAL" | "SETTLEMENT" | "SETTLEMENT_REVERSAL" | "APPLICATION" | "REVERSAL";
export type LedgerMovement = { id: string; date: string; kind: LedgerKind; amount: number };

export const isDebitKind = (kind: LedgerKind) => kind === "CHARGE" || kind === "PAYMENT_REVERSAL" || kind === "SETTLEMENT_REVERSAL";
export const isCreditKind = (kind: LedgerKind) => kind === "PAYMENT" || kind === "SETTLEMENT";
export const effectOf = (m: { kind: LedgerKind; amount: number }) => (isDebitKind(m.kind) ? m.amount : isCreditKind(m.kind) ? -m.amount : 0);
export const isInfoKind = (kind: LedgerKind) => kind === "APPLICATION" || kind === "REVERSAL";

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function buildLedger<T extends LedgerMovement>(movements: T[], from: string, to: string) {
  const openingBalance = from ? r4(movements.filter((m) => m.date < from).reduce((s, m) => s + effectOf(m), 0)) : 0;
  const inPeriod = movements.filter((m) => (!from || m.date >= from) && (!to || m.date <= to));
  let running = openingBalance;
  const rows = inPeriod.map((m) => {
    running = r4(running + effectOf(m));
    return {
      ...m,
      balanceAfter: running,
      debit: isDebitKind(m.kind) ? m.amount : null,
      credit: isCreditKind(m.kind) ? m.amount : null,
    };
  });
  const sum = (kind: LedgerKind) => r4(inPeriod.filter((m) => m.kind === kind).reduce((s, m) => s + m.amount, 0));
  const totalCharges = sum("CHARGE");
  const totalReceipts = r4(sum("PAYMENT") + sum("SETTLEMENT"));
  const totalReversals = r4(sum("PAYMENT_REVERSAL") + sum("SETTLEMENT_REVERSAL"));
  // net paid = receipts minus receipts voided in the period; debit column total = charges + reversals; credit column total = receipts
  const totalPaid = r4(totalReceipts - totalReversals);
  const closingBalance = r4(openingBalance + totalCharges - totalPaid);
  return { openingBalance, inPeriod, rows, totalCharges, totalReceipts, totalReversals, totalPaid, totalDebits: r4(totalCharges + totalReversals), closingBalance };
}
