export const ACCOUNT_CATEGORIES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
] as const;

export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const CASH_FLOW_SECTIONS = ["OPERATING", "INVESTING", "FINANCING"] as const;

export type CashFlowSection = (typeof CASH_FLOW_SECTIONS)[number];

const CATEGORY_LABELS: Record<AccountCategory, { ar: string; en: string }> = {
  ASSET: { ar: "أصول", en: "Assets" },
  LIABILITY: { ar: "التزامات", en: "Liabilities" },
  EQUITY: { ar: "حقوق ملكية", en: "Equity" },
  REVENUE: { ar: "إيرادات", en: "Revenue" },
  EXPENSE: { ar: "مصروفات", en: "Expenses" },
};

/** Each category gets one hue, used for the whole page so a row's colour
 *  always means the same thing. Kept separate from the product accent. */
const CATEGORY_TONES: Record<AccountCategory, string> = {
  ASSET: "bg-sky-50 text-sky-700 border-sky-200",
  LIABILITY: "bg-amber-50 text-amber-700 border-amber-200",
  EQUITY: "bg-violet-50 text-violet-700 border-violet-200",
  REVENUE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EXPENSE: "bg-rose-50 text-rose-700 border-rose-200",
};

const SECTION_LABELS: Record<CashFlowSection, { ar: string; en: string }> = {
  OPERATING: { ar: "تشغيلي", en: "Operating" },
  INVESTING: { ar: "استثماري", en: "Investing" },
  FINANCING: { ar: "تمويلي", en: "Financing" },
};

export function categoryLabel(category: string, isAr: boolean): string {
  const entry = CATEGORY_LABELS[category as AccountCategory];
  return entry ? (isAr ? entry.ar : entry.en) : category;
}

export function categoryTone(category: string): string {
  return CATEGORY_TONES[category as AccountCategory] ?? "bg-muted text-muted-foreground border-border";
}

export function normalBalanceLabel(balance: string, isAr: boolean): string {
  if (balance === "DEBIT") return isAr ? "مدين" : "Debit";
  if (balance === "CREDIT") return isAr ? "دائن" : "Credit";
  return balance;
}

export function cashFlowSectionLabel(section: string | null, isAr: boolean): string {
  if (!section) return isAr ? "غير مصنّف" : "Unclassified";
  const entry = SECTION_LABELS[section as CashFlowSection];
  return entry ? (isAr ? entry.ar : entry.en) : section;
}
