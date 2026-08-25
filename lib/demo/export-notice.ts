/**
 * The label that marks anything exported out of the public demo.
 *
 * WHY THIS IS NEEDED EVEN THOUGH THE DATA IS FICTIONAL
 * A spreadsheet outlives the tab it came from. Once a units export is on
 * someone's desktop, nothing about the file says where it came from except its
 * contents -- and its contents are deliberately built to look like a real
 * portfolio. Spec §28 asks for visible labelling for exactly that reason: the
 * risk is not that the demo leaks customer data (it holds none), it is that a
 * fictional figure gets forwarded, quoted, or filed as if it were real.
 *
 * WHY THIS MODULE HAS NO `server-only`
 * Exports are generated in the browser -- ExcelJS runs client-side and the PDF
 * is a printed document window. The notice therefore has to be importable from
 * a client component, so this stays a pure string function with no imports.
 */

export const DEMO_EXPORT_NOTICE_AR =
  "بيانات توضيحية افتراضية — صادرة من بيئة AqarBooks التجريبية. ليست بيانات حقيقية.";

export const DEMO_EXPORT_NOTICE_EN =
  "Fictional sample data — generated from the AqarBooks demo environment. Not real records.";

/**
 * Returns the notice, or null when this is not a demo session.
 *
 * Returning null rather than an empty string is deliberate: a caller has to
 * decide what to do with "no notice", and an empty string would silently
 * render as a blank leading row in every real customer's export.
 */
export function demoExportNotice(isDemo: boolean, isAr: boolean): string | null {
  if (!isDemo) return null;
  return isAr ? DEMO_EXPORT_NOTICE_AR : DEMO_EXPORT_NOTICE_EN;
}
