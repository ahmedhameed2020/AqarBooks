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

// Finance dialogs and banking screens. Server actions return short codes
// (lowercase or uppercase, depending on the action). Codes are mapped to
// actionable messages; anything else -- including raw database text -- becomes
// the generic message, so SQL, schema names, and internal codes never reach
// the accountant. Callers must still show a failure as a failure: never map a
// failed read to empty data.
const FINANCE_ERROR_MESSAGES: Record<string, { ar: string; en: string }> = {
  invalid_input: {
    ar: "تحقق من البيانات المدخلة وحاول مرة أخرى.",
    en: "Check the values you entered and try again.",
  },
  INVALID_INPUT: {
    ar: "تحقق من البيانات المدخلة وحاول مرة أخرى.",
    en: "Check the values you entered and try again.",
  },
  RECEIVABLE_ACCOUNT_REQUIRED: {
    ar: "اختر حساب الذمم المدينة أولًا.",
    en: "Choose a receivable account first.",
  },
  DEPOSIT_ACCOUNT_INVALID: {
    ar: "حساب الإيداع المختار غير صالح أو غير مفعّل. اختر حسابًا آخر.",
    en: "The selected deposit account is invalid or inactive. Choose another account.",
  },
  FISCAL_PERIOD_MISSING: {
    ar: "لا توجد فترة مالية تغطي تاريخ الإصدار. عرّف السنة المالية وافتح فترتها من شاشة الفترات المالية، ثم أعد المحاولة.",
    en: "No fiscal period covers the issue date. Define the fiscal year and open its period from Fiscal Periods, then try again.",
  },
  FISCAL_PERIOD_NOT_OPEN: {
    ar: "الفترة المالية التي تغطي هذا التاريخ ليست مفتوحة. افتحها من شاشة الفترات المالية ثم أعد المحاولة.",
    en: "The fiscal period covering this date is not open. Open it from Fiscal Periods, then try again.",
  },
  reason_required: {
    ar: "اكتب سببًا للإلغاء قبل المتابعة.",
    en: "Enter a reason before continuing.",
  },
  ALREADY_REVERSED: {
    ar: "تم إلغاء هذا السند مسبقًا.",
    en: "This receipt has already been voided.",
  },
  state_unchanged: {
    ar: "لم تتغير حالة العنصر. حدّث الصفحة وحاول مرة أخرى.",
    en: "The item's status did not change. Refresh the page and try again.",
  },
  STALE_VERIFICATION: {
    ar: "تغيّرت البيانات منذ آخر تحميل. حدّث الصفحة وحاول مرة أخرى.",
    en: "The data changed since it was loaded. Refresh the page and try again.",
  },
  rate_limited: {
    ar: "محاولات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.",
    en: "Too many attempts in a short time. Wait a moment and try again.",
  },
  self_approval: {
    ar: "لا يمكنك اعتماد عملية قمت بإعدادها بنفسك.",
    en: "You cannot approve an action you prepared yourself.",
  },
  ORGANIZATION_INACTIVE: {
    ar: "المنظمة غير مفعّلة حاليًا.",
    en: "This organization is currently inactive.",
  },
  unauthenticated: {
    ar: "يجب تسجيل الدخول لإتمام هذا الإجراء.",
    en: "You need to sign in to do this.",
  },
  not_authenticated: {
    ar: "يجب تسجيل الدخول لإتمام هذا الإجراء.",
    en: "You need to sign in to do this.",
  },
  NOT_AUTHENTICATED: {
    ar: "يجب تسجيل الدخول لإتمام هذا الإجراء.",
    en: "You need to sign in to do this.",
  },
  forbidden: {
    ar: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
    en: "You do not have permission to do this.",
  },
  unauthorized: {
    ar: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
    en: "You do not have permission to do this.",
  },
  NOT_AUTHORIZED: {
    ar: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
    en: "You do not have permission to do this.",
  },
  not_found: {
    ar: "تعذر العثور على العنصر المطلوب.",
    en: "The requested item could not be found.",
  },
  NOT_FOUND: {
    ar: "تعذر العثور على العنصر المطلوب.",
    en: "The requested item could not be found.",
  },
  query_failed: {
    ar: "تعذر تحميل البيانات، يرجى المحاولة مرة أخرى.",
    en: "The data could not be loaded. Please try again.",
  },
  PERIOD_NOT_CLOSED: {
    ar: "أغلق أو اقفل جميع فترات السنة أولًا، ثم أعد الفحص.",
    en: "Close or lock every period in the year first, then run the checks again.",
  },
  UNREVIEWED_ENTRIES_EXIST: {
    ar: "توجد قيود مسودة أو قيد المراجعة داخل السنة. راجعها قبل الإقفال.",
    en: "Draft or under-review entries exist in the year. Review them before closing.",
  },
  RE_ACCOUNT_REQUIRED: {
    ar: "حدّد حساب الأرباح المبقاة قبل إقفال السنة.",
    en: "Designate a retained-earnings account before closing the year.",
  },
  RE_ACCOUNT_INVALID: {
    ar: "حساب الأرباح المبقاة غير صالح. اختر حساب حقوق ملكية نشطًا وغير تجميعي.",
    en: "The retained-earnings account is invalid. Choose an active, non-group equity account.",
  },
  ENTRIES_UNBALANCED: {
    ar: "قيود السنة غير متوازنة. راجع ميزان المراجعة قبل الإقفال.",
    en: "The year's entries are unbalanced. Review the trial balance before closing.",
  },
  NOTHING_TO_CLOSE: {
    ar: "لا توجد أرصدة إيرادات أو مصروفات تحتاج إلى إقفال.",
    en: "There are no revenue or expense balances to close.",
  },
  ALREADY_CLOSED: {
    ar: "هذه السنة مقفلة بالفعل. حدّث الصفحة لعرض حالتها الحالية.",
    en: "This fiscal year is already closed. Refresh the page to see its current state.",
  },
  FORBIDDEN_CLOSE_PERMISSION: {
    ar: "ليست لديك صلاحية إقفال السنة المالية.",
    en: "You do not have permission to close the fiscal year.",
  },
  FISCAL_YEAR_NOT_FOUND: {
    ar: "تعذر العثور على السنة المالية المطلوبة.",
    en: "The requested fiscal year could not be found.",
  },
  OPERATION_KEY_REUSED: {
    ar: "تعذر تأكيد العملية. أعد فتح المعالج وأنشئ محاولة إقفال جديدة.",
    en: "The operation could not be confirmed. Reopen the wizard and start a new closing attempt.",
  },
  COST_CENTER_REQUIRED: {
    ar: "توجد حسابات تتطلب مركز تكلفة. راجع أسطر القيود قبل الإقفال.",
    en: "Some accounts require a cost centre. Review the entry lines before closing.",
  },
  COST_CENTRE_INVALID: {
    ar: "مركز تكلفة في القيود غير موجود أو غير نشط. صححه قبل الإقفال.",
    en: "A cost centre in the entries is missing or inactive. Correct it before closing.",
  },
  INCOMPLETE_BALANCE_DATA: {
    ar: "تعذر قراءة جميع أرصدة السنة. أعد الفحص قبل المتابعة.",
    en: "Not all year balances could be read. Run the checks again before continuing.",
  },
  CONFIRMATION_MISMATCH: {
    ar: "اكتب عبارة تأكيد الإقفال كما هي تمامًا.",
    en: "Type the closing confirmation phrase exactly as shown.",
  },
  ORG_NOT_ACTIVE: {
    ar: "المؤسسة غير نشطة، لذلك لا يمكن إقفال السنة.",
    en: "The organization is inactive, so the year cannot be closed.",
  },
  AUTHENTICATION_REQUIRED: {
    ar: "يجب تسجيل الدخول لإتمام هذا الإجراء.",
    en: "You need to sign in to do this.",
  },
  INVALID_CLOSE_RESULT: {
    ar: "لم تُرجع قاعدة البيانات نتيجة إقفال صالحة. تحقق من حالة السنة قبل إعادة المحاولة.",
    en: "The database did not return a valid closing result. Check the year's state before retrying.",
  },
};

export function financeErrorMessage(code: string | null | undefined, isAr: boolean): string {
  const entry = code && Object.prototype.hasOwnProperty.call(FINANCE_ERROR_MESSAGES, code)
    ? FINANCE_ERROR_MESSAGES[code]
    : GENERIC_FALLBACK;
  return isAr ? entry.ar : entry.en;
}
