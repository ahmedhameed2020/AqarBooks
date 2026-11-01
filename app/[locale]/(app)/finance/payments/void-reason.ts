/** A void/reversal reason is required: it must contain at least one non-whitespace character. */
export function isVoidReasonValid(reason: string): boolean {
  return reason.trim().length > 0;
}

/** The value sent to the server: the trimmed reason. */
export function normalizeVoidReason(reason: string): string {
  return reason.trim();
}
