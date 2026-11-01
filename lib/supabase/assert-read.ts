/**
 * A failed read must not become an empty page.
 *
 * Supabase/PostgREST reports a failure (statement timeout 57014, permission, network) as `{ data: null, error }`. Pages that only destructure
 * `data` and default it to `[]` turn that into "no rows": a member who owns a unit shows "Units owned 0", a form is replaced by a
 * "link the client to a unit first" notice, a list is blank -- a coherent but WRONG screen (measured 2026-10-12: 12 of 38 runs of one test,
 * statement timeouts on units_with_financials / members_with_financials). `assertRead` throws instead, so the route's error boundary
 * (`error.tsx`: "could not load", with Retry) is shown and nothing partial is rendered.
 */
export class DataLoadError extends Error {
  readonly source: string;
  readonly code: string | null;
  constructor(source: string, code: string | null) {
    // no database text: it can carry identifiers; the stable code and the call site are enough to find the cause in the server log
    super(`data load failed: ${source}${code ? ` (${code})` : ""}`);
    this.name = "DataLoadError";
    this.source = source;
    this.code = code;
  }
}

/** Throws a DataLoadError when the read failed. Call right after the query: `assertRead(error, "members/[id]: units")`. */
export function assertRead(error: { code?: string | null; message?: string } | null | undefined, source: string): void {
  if (!error) return;
  console.error(`[data-load] ${source} failed: ${error.code ?? "no code"}`);
  throw new DataLoadError(source, error.code ?? null);
}
