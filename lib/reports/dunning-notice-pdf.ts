import { escapeHtml } from "@/lib/reports/html-escape";

export interface DunningNoticeData {
  organizationName: string;
  organizationAddress?: string | null;
  organizationPhone?: string | null;
  taxNumber?: string | null;
  stageName: string;
  stageNumber: number;
  raisedOn: string;
  memberName: string | null;
  unitCode?: string | null;
  dueDescription: string;
  dueDate: string;
  daysOverdue: number;
  outstandingAmount: number;
  currencyLabel: string;
}

/**
 * A printed dunning notice, following the same pattern as every other document
 * in `lib/reports`: build HTML, open a same-origin window, print. Every user
 * string goes through escapeHtml.
 *
 * The wording is deliberately factual rather than threatening. A notice that
 * overstates what will happen next is a promise the organisation may not keep,
 * and an operator cannot tell from the screen which stage carries real legal
 * weight in their jurisdiction -- so the document states the debt, its age and
 * what is owed, and leaves consequences to be written by whoever knows them.
 */
export function generateDunningNoticePdf(
  data: DunningNoticeData,
  locale: string,
): Window | null {
  const isAr = locale === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const money = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const t = (ar: string, en: string) => (isAr ? ar : en);
  const recipient =
    data.memberName ??
    t("(لا يوجد مالك مسجَّل لهذه الوحدة)", "(no owner is recorded for this unit)");

  const html = `<!doctype html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(t("إشعار تحصيل", "Collection notice"))} — ${escapeHtml(data.dueDescription)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; color: #111; line-height: 1.7; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; }
  .org { font-size: 18px; font-weight: 800; }
  .meta { font-size: 11px; color:#555; }
  h1 { font-size: 16px; margin: 18px 0 4px; }
  .stage { font-size: 12px; color:#b91c1c; font-weight: 700; }
  table { width:100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
  th, td { border:1px solid #ddd; padding:8px; text-align:${isAr ? "right" : "left"}; }
  th { background:#f4f4f5; }
  .total { font-size: 18px; font-weight: 800; }
  .foot { margin-top: 26px; font-size: 11px; color:#555; border-top:1px solid #ddd; padding-top:10px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="org">${escapeHtml(data.organizationName)}</div>
      <div class="meta">
        ${data.organizationAddress ? escapeHtml(data.organizationAddress) + "<br/>" : ""}
        ${data.organizationPhone ? escapeHtml(data.organizationPhone) + "<br/>" : ""}
        ${data.taxNumber ? escapeHtml(t("الرقم الضريبي: ", "Tax ID: ") + data.taxNumber) : ""}
      </div>
    </div>
    <div class="meta">${escapeHtml(t("تاريخ الإشعار: ", "Notice date: ") + data.raisedOn)}</div>
  </div>

  <h1>${escapeHtml(t("إشعار تحصيل", "Collection notice"))}</h1>
  <div class="stage">${escapeHtml(`${t("المستوى", "Stage")} ${data.stageNumber} — ${data.stageName}`)}</div>

  <p>${escapeHtml(t("إلى: ", "To: ") + recipient)}</p>

  <table>
    <tr>
      <th>${escapeHtml(t("البيان", "Item"))}</th>
      <td>${escapeHtml(data.dueDescription)}</td>
    </tr>
    ${data.unitCode ? `<tr><th>${escapeHtml(t("الوحدة", "Unit"))}</th><td>${escapeHtml(data.unitCode)}</td></tr>` : ""}
    <tr>
      <th>${escapeHtml(t("تاريخ الاستحقاق", "Due date"))}</th>
      <td>${escapeHtml(data.dueDate)}</td>
    </tr>
    <tr>
      <th>${escapeHtml(t("عدد أيام التأخير", "Days overdue"))}</th>
      <td>${escapeHtml(String(data.daysOverdue))}</td>
    </tr>
    <tr>
      <th>${escapeHtml(t("المبلغ المستحق", "Amount outstanding"))}</th>
      <td class="total">${escapeHtml(money(data.outstandingAmount))} ${escapeHtml(data.currencyLabel)}</td>
    </tr>
  </table>

  <div class="foot">
    ${escapeHtml(
      t(
        "المبلغ أعلاه هو الرصيد غير المسدَّد وقت إصدار هذا الإشعار. إن كان السداد قد تم بعد هذا التاريخ فيُرجى تجاهل الإشعار.",
        "The amount above is the balance unpaid at the time this notice was issued. If payment has since been made, please disregard it.",
      ),
    )}
  </div>

  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const objectUrl = URL.createObjectURL(blob);
  const w = window.open(objectUrl, "_blank");
  // Same-origin blob URL, matching every other report in this folder.
  if (w) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return w;
}
