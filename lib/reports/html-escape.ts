// Shared by every client-side "build an HTML string, open it in a print
// window" report generator (lib/reports/payment-receipt-pdf.ts,
// app/[locale]/(app)/property/unit-pdf-report.ts). Any user-supplied string
// interpolated into those templates (names, memos, codes, descriptions...)
// must be escaped before landing in the HTML string -- otherwise a stray
// `<`/`&` in free-text input (a memo, an owner name) breaks the rendered
// layout, and a value containing `<script>`/`<img onerror=...>` would
// execute in the print window's origin (same-origin blob: URL) if it ever
// reached this template unescaped.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
