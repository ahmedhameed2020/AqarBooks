export const CURRENCY_CODES = [
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "USD",
  "EUR",
  "GBP",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export function getCurrencyLabel(currencyCode: string | undefined | null, isAr: boolean): string {
  const map: Record<string, { ar: string; en: string }> = {
    EGP: { ar: "ج.م", en: "EGP" },
    SAR: { ar: "ر.س", en: "SAR" },
    AED: { ar: "د.إ", en: "AED" },
    KWD: { ar: "د.ك", en: "KWD" },
    QAR: { ar: "ر.ق", en: "QAR" },
    BHD: { ar: "د.ب", en: "BHD" },
    OMR: { ar: "ر.ع", en: "OMR" },
    USD: { ar: "$", en: "USD" },
    EUR: { ar: "€", en: "EUR" },
    GBP: { ar: "£", en: "GBP" },
  };

  const code = (currencyCode || "EGP").toUpperCase().trim();
  const entry = map[code];
  if (entry) {
    return isAr ? entry.ar : entry.en;
  }
  return code;
}
