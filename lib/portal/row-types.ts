// Row shape for the embedded units(code) join used across the owner portal,
// plus the shared payment-method label map. lib/supabase/types.ts is
// hand-maintained with empty Relationships arrays, so the typed client can't
// express this embed cleanly. Mirrors the DueDbRow pattern used on
// /finance/dues (app/[locale]/(app)/finance/dues/page.tsx).
export type DueDbRow = {
  id: string;
  amount: number;
  issue_date: string;
  due_date: string;
  description: string | null;
  status: string;
  units: { code: string } | null;
};

export const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
  ONLINE: { ar: "دفع إلكتروني", en: "Online payment" },
};
