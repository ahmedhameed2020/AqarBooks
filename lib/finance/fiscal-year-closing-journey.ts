export const CLOSING_CONFIRMATION = {
  ar: "إقفال السنة",
  en: "CLOSE YEAR",
} as const;

export type ClosingLocale = keyof typeof CLOSING_CONFIRMATION;

export function closingConfirmationMatches(confirmation: string, locale: string): boolean {
  const expected = CLOSING_CONFIRMATION[locale === "ar" ? "ar" : "en"];
  return confirmation === expected;
}

export type ClosingPreviewLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  reason: "CLOSE_TEMPORARY" | "RETAINED_EARNINGS";
  costCentreId?: string;
};

export type FiscalYearClosingPreview = {
  fiscalYearId: string;
  fiscalYearName: string;
  retainedEarningsAccountId: string;
  retainedEarningsAccountLabel: string;
  periodCount: number;
  postedLineCount: number;
  lines: ClosingPreviewLine[];
  netIncome: string;
  totalDebit: string;
  totalCredit: string;
};

export type FiscalYearClosingResult = {
  alreadyClosed: boolean;
  closingEntryId: string;
  lineCount: number;
  netIncome: string;
};

export type ClosingActionFailure = { ok: false; error: string };
export type ClosingPreviewActionResult =
  | { ok: true; preview: FiscalYearClosingPreview }
  | ClosingActionFailure;
export type CloseFiscalYearActionResult =
  | { ok: true; result: FiscalYearClosingResult }
  | ClosingActionFailure;
