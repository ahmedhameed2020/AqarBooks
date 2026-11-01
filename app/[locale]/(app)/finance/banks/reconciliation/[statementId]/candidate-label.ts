const ISO_4217_SHAPE = /^[A-Z]{3}$/;

/** Unicode LEFT-TO-RIGHT ISOLATE (U+2066) and POP DIRECTIONAL ISOLATE (U+2069). */
const LTR_ISOLATE_START = String.fromCharCode(0x2066);
const LTR_ISOLATE_END = String.fromCharCode(0x2069);

/**
 * Keeps LTR content (numbers, dates, codes, amounts) reading left-to-right inside
 * an Arabic sentence. Option labels cannot contain elements, so this is the only way
 * to isolate such runs there. Returns the text unchanged for non-Arabic UI.
 */
export function ltrIsolate(text: string, isAr: boolean): string {
  return isAr ? `${LTR_ISOLATE_START}${text}${LTR_ISOLATE_END}` : text;
}

/**
 * Formats a statement/ledger amount with 2 decimals.
 * Uses the organization's ISO-4217 currency code when it is well-formed; otherwise
 * falls back to plain number formatting with NO currency symbol, so a missing or
 * malformed code never shows a wrong symbol.
 *
 * NOTE: `currency` is the organization's DISPLAY currency (organizations.default_currency).
 * It is NOT evidence of each bank account's currency: the schema has no per-bank-account
 * currency, so every amount on this screen is shown in the organization currency.
 */
export function formatBankAmount(
  value: number,
  locale: string,
  currency: string | null | undefined,
): string {
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (typeof currency === "string" && ISO_4217_SHAPE.test(currency)) {
    try {
      return new Intl.NumberFormat(locale, { ...digits, style: "currency", currency }).format(value);
    } catch {
      // Unknown or unsupported code: fall through to plain formatting.
    }
  }
  return new Intl.NumberFormat(locale, digits).format(value);
}

export type MatchCandidateRow = {
  journal_entry_line_id: string;
  entry_number: number | string | null;
  entry_date: string;
  description: string | null;
  /** debit - credit on the bank GL account: positive = money in, negative = money out */
  signed_amount: number | string;
};

/**
 * Builds the option label for a candidate journal line in the match dropdown.
 * Amount and direction come from the RPC's signed_amount (debit - credit on the bank account).
 * In Arabic UI the entry reference/date and the amount are isolated as LTR runs.
 */
export function formatMatchCandidateLabel(
  c: MatchCandidateRow,
  fmt: (n: number) => string,
  isAr: boolean,
): string {
  const signed = Number(c.signed_amount);
  const direction = signed >= 0 ? (isAr ? "وارد" : "In") : isAr ? "صادر" : "Out";
  const ref = ltrIsolate(`#${c.entry_number ?? "—"} · ${c.entry_date}`, isAr);
  const base = `${ref} · ${c.description ?? ""}`.trim();
  return `${base} · ${direction} ${ltrIsolate(fmt(Math.abs(signed)), isAr)}`;
}
