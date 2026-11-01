// Pure helper for the e-invoice issue form. It never picks an account on the caller's behalf:
// an empty or unknown selection is rejected, and there is no fallback to the first listed account.

export type ReceivableAccountResolution =
  | { ok: true; id: string }
  | { ok: false; reason: "required" | "invalid" };

export function resolveReceivableAccountForSubmit(
  selectedId: string,
  accountIds: string[],
): ReceivableAccountResolution {
  if (!selectedId) return { ok: false, reason: "required" };
  if (!accountIds.includes(selectedId)) return { ok: false, reason: "invalid" };
  return { ok: true, id: selectedId };
}
