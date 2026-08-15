// Row shapes for the embedded units(code) join, plus shared status/method
// label maps used across the owner portal -- lib/supabase/types.ts is
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

export type PaymentDbRow = {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  receipt_no: string | null;
  receipt_number: number | null;
};

export const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
};

export const STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  ISSUED: { ar: "مستحق", en: "Issued" },
  PARTIALLY_PAID: { ar: "مدفوع جزئيًا", en: "Partially paid" },
  OVERDUE: { ar: "متأخر", en: "Overdue" },
};
