/**
 * Order of the deposit accounts offered on the receipts screens, and therefore the default (the dialog preselects the FIRST one).
 *
 * Rule: ascending account code, compared numerically-aware ("1110" < "1120" < "1130" < "11100"), ties broken by id. With the standard chart the
 * cash account (1110) is first, which is what a receipt recorded with the default method (cash) expects. Before this rule the list came from an
 * unordered query: the database returned rows in heap order, so the preselected account differed from one organization to another (the first
 * asset account was not the lowest code in 306 of 679 organizations of the isolated stack).
 *
 * The set of accounts offered is unchanged (non-group asset accounts of the organization); whether receivables (1130) should be offered as a
 * deposit account at all is a separate product decision and is NOT made here.
 */
export function sortDepositAccounts<T extends { code: string; id: string }>(accounts: readonly T[]): T[] {
  return [...accounts].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }) || a.id.localeCompare(b.id));
}
