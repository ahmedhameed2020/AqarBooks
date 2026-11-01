// Bilingual messages for organization-deletion refusals raised by the database.
// The guards live in SQL (COA_USED_DELETE_FORBIDDEN in the baseline, and
// FISCAL_CLOSED_RECORD_DELETE_BLOCKED in 20261019100100_fiscal_year_close_guards.sql).
// Only the known codes below get a specific message. Anything else, including raw
// Postgres text, SQL, or schema names, falls back to a generic message so internal
// detail never reaches the user.

export type OrganizationDeleteRefusalCode =
  | "COA_USED_DELETE_FORBIDDEN"
  | "FISCAL_CLOSED_RECORD_DELETE_BLOCKED";

export const ORGANIZATION_DELETE_MESSAGES: Record<
  OrganizationDeleteRefusalCode,
  { ar: string; en: string }
> = {
  COA_USED_DELETE_FORBIDDEN: {
    ar: "لا يمكن حذف هذه المنظمة لأنها تحتوي على قيود محاسبية مرحّلة. أغلقها أو أرشفها بدلًا من حذفها.",
    en: "This organization has posted accounting records and cannot be deleted. Close or archive it instead.",
  },
  FISCAL_CLOSED_RECORD_DELETE_BLOCKED: {
    ar: "لا يمكن حذف هذه المنظمة لأنها تحتوي على تقويم مالي مغلق. أغلقها أو أرشفها بدلًا من حذفها.",
    en: "This organization has a closed fiscal calendar and cannot be deleted. Close or archive it instead.",
  },
};

export const ORGANIZATION_DELETE_GENERIC_MESSAGE = {
  ar: "تعذر حذف المنظمة. حاول مرة أخرى، أو تواصل مع الدعم إذا تكرر الخطأ.",
  en: "The organization could not be deleted. Try again, or contact support if it keeps happening.",
};

export function organizationDeleteMessage(
  code: string | null | undefined,
  isAr: boolean,
): string {
  const entry =
    code && Object.prototype.hasOwnProperty.call(ORGANIZATION_DELETE_MESSAGES, code)
      ? ORGANIZATION_DELETE_MESSAGES[code as OrganizationDeleteRefusalCode]
      : ORGANIZATION_DELETE_GENERIC_MESSAGE;
  return isAr ? entry.ar : entry.en;
}
