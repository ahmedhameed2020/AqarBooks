// Pure helpers for the customer-advances server actions: input schemas, error-code extraction and localized messages.
// Kept out of the "use server" module on purpose (a server-actions file may only export async functions).
import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  }, "not a calendar date");
/** a positive amount with at most 4 decimals (numeric(19,4)) */
const amount = z.coerce
  .number()
  .positive()
  .max(9_999_999_999_999)
  .refine((n) => Math.abs(Math.round(n * 10_000) / 10_000 - n) < 1e-9, "at most 4 decimals");

export const allocationInput = z.object({ dueId: uuid, amount });
const allocationList = (min: number) =>
  z
    .array(allocationInput)
    .min(min)
    .max(200)
    .refine((list) => new Set(list.map((a) => a.dueId)).size === list.length, "duplicate due");

export const recordAdvanceInput = z.object({
  organizationId: uuid,
  resortId: uuid,
  memberId: uuid,
  unitId: uuid,
  amount,
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]),
  paymentDate: isoDate,
  depositAccountId: uuid,
  fiscalPeriodId: uuid,
  allocations: allocationList(0).default([]),
  cashierSessionId: uuid.optional(),
  operationKey: uuid,
});
export const applyCreditInput = z.object({
  organizationId: uuid,
  paymentId: uuid,
  allocations: allocationList(1),
  applicationDate: isoDate,
  fiscalPeriodId: uuid,
  operationKey: uuid,
});
export const reverseApplicationInput = z.object({
  organizationId: uuid,
  allocationId: uuid,
  reason: z.string().trim().min(1).max(1000),
  reversalDate: isoDate,
  fiscalPeriodId: uuid,
  operationKey: uuid,
});
export const advanceAccountInput = z.object({ organizationId: uuid, resortId: uuid, accountId: uuid });

/** Every code the customer-advance functions can raise (migrations 20261017100000 / 20261017100100). */
export const ADVANCE_ERROR_CODES = [
  "ADVANCE_ACCOUNT_INACTIVE", "ADVANCE_ACCOUNT_NOT_CONFIGURED", "ALLOCATION_AMOUNT_INVALID", "ALLOCATION_EXCEEDS_REMAINING",
  "ALLOCATION_EXCEEDS_REMAINING_ON_DATE", "ALLOCATION_NOT_FOUND", "ALLOCATIONS_INVALID", "ALLOCATIONS_REQUIRED", "ALREADY_REVERSED", "AMOUNT_INVALID",
  "APPLICATION_BEFORE_DUE", "APPLICATION_BEFORE_RECEIPT", "APPLICATION_JOURNAL_ENTRY_MISSING", "CASHIER_SESSION_NOT_FOUND", "CASHIER_SESSION_NOT_OPEN",
  "CREDIT_APPLICATIONS_ACTIVE", "CREDIT_BALANCE_INCONSISTENT", "CREDIT_EXCEEDED", "CREDIT_EXCEEDED_ON_DATE", "CUSTOMER_ADVANCE_ACCOUNT_INVALID",
  "DEPOSIT_ACCOUNT_INVALID", "DEPOSIT_ACCOUNT_MISMATCH", "DUE_NOT_FOUND", "DUE_NOT_POSTED", "DUE_RESORT_MISMATCH", "DUE_UNIT_MISMATCH", "DUE_VOID",
  "DUPLICATE_DUE_IN_REQUEST", "FISCAL_PERIOD_MISMATCH", "FISCAL_PERIOD_MISSING", "FISCAL_PERIOD_NOT_OPEN",
  "FORBIDDEN_FINANCE_PERMISSION", "FUTURE_DATE_NOT_ALLOWED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_REUSED",
  "MEMBER_AND_UNIT_REQUIRED", "MEMBER_NOT_LINKED_TO_UNIT", "MEMBER_OR_UNIT_NOT_FOUND", "METHOD_INVALID",
  "NOT_A_CREDIT_APPLICATION", "NOT_AN_ADVANCE", "NOT_AN_ADVANCE_RECEIPT", "ORGANIZATION_INACTIVE", "PAYMENT_BEFORE_DUE",
  "PAYMENT_JOURNAL_ENTRY_MISSING", "PAYMENT_NOT_FOUND", "PAYMENT_NOT_POSTED", "PROPERTY_NOT_FOUND", "REASON_REQUIRED",
  "REASON_TOO_LONG", "RESORT_NOT_IN_ORGANIZATION", "REVERSAL_BEFORE_APPLICATION",
] as const;
export type AdvanceErrorCode = (typeof ADVANCE_ERROR_CODES)[number];
const KNOWN = new Set<string>(ADVANCE_ERROR_CODES);

/**
 * The stable code of a database error: the leading `CODE:` of the message, or the whole message when it is a bare code, or
 * FORBIDDEN_FINANCE_PERMISSION for SQLSTATE 42501. Anything unknown becomes "unexpected" — raw database text is never shown.
 */
export function advanceErrorCode(error: { message?: string | null; code?: string | null } | null | undefined): AdvanceErrorCode | "unexpected" {
  if (!error) return "unexpected";
  const message = String(error.message ?? "").trim();
  const lead = /^([A-Z][A-Z0-9_]{2,})(?::|\s|$)/.exec(message)?.[1];
  if (lead && KNOWN.has(lead)) return lead as AdvanceErrorCode;
  if (error.code === "42501") return "FORBIDDEN_FINANCE_PERMISSION";
  return "unexpected";
}

type Msg = { ar: string; en: string };
const M: Record<AdvanceErrorCode | "invalid_input" | "unexpected", Msg> = {
  invalid_input: { ar: "بيانات غير صالحة، راجع الحقول.", en: "Invalid input. Check the fields." },
  unexpected: { ar: "حدث خطأ غير متوقع. أعد المحاولة؛ لن تتكرر العملية.", en: "Something went wrong. Retry; the operation will not be duplicated." },
  ADVANCE_ACCOUNT_INACTIVE: { ar: "حساب سلف العملاء المستخدم غير فعّال. أعد تفعيله أولًا.", en: "The customer-advance account in use is inactive. Reactivate it first." },
  ADVANCE_ACCOUNT_NOT_CONFIGURED: { ar: "لم يُعتمد حساب سلف العملاء لهذا الموقع.", en: "No customer-advance account is approved for this site." },
  ALLOCATION_AMOUNT_INVALID: { ar: "كل مبلغ يجب أن يكون أكبر من صفر.", en: "Every amount must be greater than zero." },
  ALLOCATION_EXCEEDS_REMAINING: { ar: "المبلغ أكبر من المتبقي على الاستحقاق.", en: "The amount is more than the due still owes." },
  ALLOCATION_EXCEEDS_REMAINING_ON_DATE: { ar: "المبلغ يتجاوز المتبقي على الاستحقاق في تاريخ لاحق لتاريخ التطبيق (إيصال أُلغي لاحقًا كان يغطيه).", en: "The amount exceeds what the due still owed on a later date (a receipt voided afterwards covered it then)." },
  ALLOCATION_NOT_FOUND: { ar: "التطبيق غير موجود.", en: "Application not found." },
  ALLOCATIONS_INVALID: { ar: "توزيع غير صالح.", en: "Invalid allocation list." },
  ALLOCATIONS_REQUIRED: { ar: "اختر استحقاقًا واحدًا على الأقل.", en: "Select at least one due." },
  ALREADY_REVERSED: { ar: "هذا التطبيق معكوس مسبقًا.", en: "This application was already reversed." },
  AMOUNT_INVALID: { ar: "المبلغ يجب أن يكون أكبر من صفر.", en: "The amount must be greater than zero." },
  APPLICATION_BEFORE_DUE: { ar: "تاريخ التطبيق يسبق تاريخ إصدار الاستحقاق.", en: "The application date is before the due was issued." },
  APPLICATION_BEFORE_RECEIPT: { ar: "تاريخ التطبيق يسبق تاريخ الإيصال.", en: "The application date is before the receipt date." },
  APPLICATION_JOURNAL_ENTRY_MISSING: { ar: "قيد التطبيق غير موجود أو غير مرحَّل.", en: "The application's journal entry is missing or not posted." },
  CASHIER_SESSION_NOT_FOUND: { ar: "جلسة الكاشير غير موجودة.", en: "Cashier session not found." },
  CASHIER_SESSION_NOT_OPEN: { ar: "جلسة الكاشير غير مفتوحة.", en: "The cashier session is not open." },
  CREDIT_APPLICATIONS_ACTIVE: { ar: "لا يمكن إلغاء الإيصال وله تطبيقات رصيد فعّالة. اعكسها أولًا.", en: "The receipt has credit applications in force. Reverse them first." },
  CREDIT_BALANCE_INCONSISTENT: { ar: "رصيد الإيصال غير متسق مع تطبيقاته. تواصل مع الدعم.", en: "The receipt balance does not match its applications. Contact support." },
  CREDIT_EXCEEDED: { ar: "المبلغ أكبر من الرصيد المتاح.", en: "The amount is more than the available credit." },
  CREDIT_EXCEEDED_ON_DATE: { ar: "المبلغ يتجاوز الرصيد المتاح في تاريخ لاحق لتاريخ التطبيق (تطبيق آخر كان قائمًا حينها). استخدم تاريخًا لاحقًا أو مبلغًا أقل.", en: "The amount exceeds the credit available on a later date (another application was in force then). Use a later date or a smaller amount." },
  CUSTOMER_ADVANCE_ACCOUNT_INVALID: { ar: "يجب أن يكون الحساب حساب التزامات فرعيًا نشطًا في هذه المؤسسة.", en: "The account must be an active leaf liability account of this organization." },
  DEPOSIT_ACCOUNT_INVALID: { ar: "حساب الإيداع يجب أن يكون مرتبطًا بخزينة أو بحساب بنكي فعّال في هذا الكيان. اربط الحساب أولًا أو اختر حسابًا آخر.", en: "The deposit account must be linked to an active cash box or bank account of this organization. Link it first or choose another account." },
  DEPOSIT_ACCOUNT_MISMATCH: { ar: "حساب الإيداع لا يطابق صندوق جلسة الكاشير.", en: "The deposit account does not match the cashier session cash box." },
  DUE_NOT_FOUND: { ar: "الاستحقاق غير موجود.", en: "Due not found." },
  DUE_NOT_POSTED: { ar: "الاستحقاق ليس له قيد مرحَّل.", en: "The due has no posted journal entry." },
  DUE_RESORT_MISMATCH: { ar: "الاستحقاق يتبع موقعًا مختلفًا.", en: "The due belongs to a different site." },
  DUE_UNIT_MISMATCH: { ar: "الاستحقاق يتبع وحدة غير وحدة الإيصال.", en: "The due belongs to a different unit than the receipt." },
  DUE_VOID: { ar: "الاستحقاق ملغى.", en: "The due is void." },
  DUPLICATE_DUE_IN_REQUEST: { ar: "الاستحقاق نفسه مكرر في الطلب.", en: "The same due appears twice in the request." },
  FISCAL_PERIOD_MISMATCH: { ar: "الفترة المالية المحددة لا تطابق التاريخ أو ليست مفتوحة.", en: "The selected fiscal period does not match the date or is not open." },
  FISCAL_PERIOD_MISSING: { ar: "لا توجد فترة مالية تغطي هذا التاريخ.", en: "No fiscal period covers this date." },
  FISCAL_PERIOD_NOT_OPEN: { ar: "الفترة المالية لهذا التاريخ غير مفتوحة.", en: "The fiscal period for this date is not open." },
  FORBIDDEN_FINANCE_PERMISSION: { ar: "لا تملك صلاحية هذا الإجراء.", en: "You do not have permission for this action." },
  FUTURE_DATE_NOT_ALLOWED: { ar: "لا يمكن استخدام تاريخ مستقبلي.", en: "A future date is not allowed." },
  IDEMPOTENCY_KEY_REQUIRED: { ar: "مفتاح منع التكرار مفقود.", en: "The duplicate-protection key is missing." },
  IDEMPOTENCY_KEY_REUSED: { ar: "استُخدم هذا المفتاح لطلب مختلف. ابدأ العملية من جديد.", en: "This key was used for a different request. Start the operation again." },
  MEMBER_AND_UNIT_REQUIRED: { ar: "اختر العضو والوحدة.", en: "Select the member and the unit." },
  MEMBER_NOT_LINKED_TO_UNIT: { ar: "العضو لم يعد مالكًا فعّالًا للوحدة بهذا التاريخ.", en: "The member is not an active owner of the unit on this date." },
  MEMBER_OR_UNIT_NOT_FOUND: { ar: "العضو أو الوحدة غير موجودة.", en: "Member or unit not found." },
  METHOD_INVALID: { ar: "طريقة الدفع غير مسموحة للدفعة المقدمة.", en: "This payment method is not allowed for an advance." },
  NOT_A_CREDIT_APPLICATION: { ar: "تخصيصات الاستلام تُلغى بإلغاء الإيصال.", en: "Receipt allocations are reversed by voiding the receipt." },
  NOT_AN_ADVANCE: { ar: "لا يوجد باقٍ بعد التوزيع؛ سجّلها كدفعة عادية.", en: "Nothing is left after allocation; record it as a normal payment." },
  NOT_AN_ADVANCE_RECEIPT: { ar: "هذا الإيصال ليس دفعة مقدمة.", en: "This receipt is not an advance." },
  ORGANIZATION_INACTIVE: { ar: "المؤسسة غير نشطة.", en: "The organization is not active." },
  PAYMENT_BEFORE_DUE: { ar: "تاريخ الدفعة يسبق تاريخ إصدار الاستحقاق.", en: "The payment date is before the due was issued." },
  PAYMENT_JOURNAL_ENTRY_MISSING: { ar: "قيد الإيصال غير موجود أو غير مرحَّل.", en: "The receipt's journal entry is missing or not posted." },
  PAYMENT_NOT_FOUND: { ar: "الإيصال غير موجود.", en: "Receipt not found." },
  PAYMENT_NOT_POSTED: { ar: "الإيصال غير مرحَّل (ربما أُلغي).", en: "The receipt is not posted (it may have been voided)." },
  PROPERTY_NOT_FOUND: { ar: "الموقع غير موجود.", en: "Site not found." },
  REASON_REQUIRED: { ar: "السبب إلزامي.", en: "A reason is required." },
  REASON_TOO_LONG: { ar: "السبب طويل جدًا.", en: "The reason is too long." },
  RESORT_NOT_IN_ORGANIZATION: { ar: "الموقع لا يتبع هذه المؤسسة.", en: "The site does not belong to this organization." },
  REVERSAL_BEFORE_APPLICATION: { ar: "تاريخ العكس يسبق تاريخ التطبيق.", en: "The reversal date is before the application date." },
};

export function advanceErrorMessage(code: string, locale: "ar" | "en"): string {
  const entry = (M as Record<string, Msg>)[code] ?? M.unexpected;
  return entry[locale];
}
export const ADVANCE_MESSAGE_KEYS: string[] = Object.keys(M);

/** The OPEN fiscal period that contains `date` (YYYY-MM-DD), if the list has one. Periods are monthly, so a date decides the period. */
export function periodForDate<T extends { start: string; end: string }>(periods: readonly T[], date: string): T | undefined {
  return periods.find((p) => p.start <= date && date <= p.end);
}

/** amount to 4 decimals, the precision of the ledger */
export const money4 = (n: number) => Math.round(n * 10_000) / 10_000;
