// Generic, reusable error-code -> bilingual message mapper for portal server
// actions. Intentionally small: only codes with real callers today are
// mapped. Any code that isn't recognized here (including a raw Postgres
// error message string -- see getOwnPaymentReceiptAction's paymentErr.message
// fallback in lib/actions/member-portal-receipts.ts) MUST fall through to a
// generic message rather than being echoed to the client -- surfacing a raw
// DB error string to an end user risks leaking internal schema/error detail.
const ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  unauthenticated: {
    ar: "يجب تسجيل الدخول لإتمام هذا الإجراء.",
    en: "You need to sign in to do this.",
  },
  not_found: {
    ar: "تعذر العثور على العنصر المطلوب.",
    en: "The requested item could not be found.",
  },
  query_failed: {
    ar: "حدث خطأ أثناء تحميل البيانات، يرجى المحاولة مرة أخرى.",
    en: "Something went wrong loading this data. Please try again.",
  },
};

const GENERIC_FALLBACK = {
  ar: "حدث خطأ ما، يرجى المحاولة مرة أخرى.",
  en: "Something went wrong. Please try again.",
};

export function formErrorMessage(code: string, isAr: boolean): string {
  const entry = ERROR_MESSAGES[code] ?? GENERIC_FALLBACK;
  return isAr ? entry.ar : entry.en;
}
