// Database errors are never returned as text. A known RAISE code from the database is
// mapped to the stable code that financeErrorMessage understands; anything else becomes
// "query_failed", so SQL text, schema names and internal codes never reach the UI.
const DB_ERROR_CODES = new Map<string, string>([
  ["RECEIVABLE_ACCOUNT_REQUIRED", "RECEIVABLE_ACCOUNT_REQUIRED"],
  ["DEPOSIT_ACCOUNT_INVALID", "DEPOSIT_ACCOUNT_INVALID"],
  ["ALREADY_REVERSED", "ALREADY_REVERSED"],
  ["REASON_REQUIRED", "reason_required"],
  ["FORBIDDEN_FINANCE_PERMISSION", "forbidden"],
  ["FORBIDDEN", "forbidden"],
  ["UNAUTHORIZED", "unauthorized"],
  ["PAYMENT_NOT_FOUND", "not_found"],
  ["ALLOCATION_NOT_FOUND", "not_found"],
  ["PROPERTY_NOT_FOUND", "not_found"],
  ["FISCAL_PERIOD_MISSING", "FISCAL_PERIOD_MISSING"],
  ["FISCAL_PERIOD_NOT_OPEN", "FISCAL_PERIOD_NOT_OPEN"],
]);

export function dbErrorCode(message: string | null | undefined): string {
  const text = message?.trim();
  if (!text) return "query_failed";
  // Exact match first; RPC guards also raise "CODE: human detail" (see the
  // FISCAL_PERIOD_* guards), so the leading code gets one mapped lookup too.
  const code = DB_ERROR_CODES.get(text) ?? DB_ERROR_CODES.get(/^([A-Z][A-Z0-9_]{2,})(?::|\s|$)/.exec(text)?.[1] ?? "");
  return code ?? "query_failed";
}
