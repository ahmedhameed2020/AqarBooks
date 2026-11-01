// Idempotency keys for customer-advance operations (record an advance, apply credit, reverse an application).
//
// The server stores `key + fingerprint of the request` and answers a repeated request with the original result, but refuses the
// same key with different content (IDEMPOTENCY_KEY_REUSED). So the client must:
//   * keep the SAME key while it retries the SAME operation (timeout, network error, double click, a re-submission of an
//     unresolved attempt): that is what makes a retry safe;
//   * use a NEW key for a NEW operation: after a success, when the user abandons the form, and when the content changes.
// Server actions never invent a key: they require the caller's key (see lib/actions/customer-advances.ts).
export type KeyFactory = () => string;

/** Stable text for a request's content: object keys sorted, so equal content gives an equal fingerprint. */
export function fingerprintOf(content: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, norm(x)]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(content));
}

const defaultFactory: KeyFactory = () => globalThis.crypto.randomUUID();

export function createOperationKeys(make: KeyFactory = defaultFactory) {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    /** The key for this exact content: unchanged on a retry, new when the content differs from the last attempt or after complete()/reset(). */
    keyFor(content: unknown): string {
      const fingerprint = fingerprintOf(content);
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: make() };
      return current.key;
    },
    /** Call once the operation succeeded (or was confirmed as a replay): the next submission is a new operation. */
    complete(): void {
      current = null;
    },
    /** Call when the user abandons the form/dialog without finishing. */
    reset(): void {
      current = null;
    },
  };
}
