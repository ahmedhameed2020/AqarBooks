import { escapeHtml } from "@/lib/reports/html-escape";

export interface ReportPdfColumn {
  header: string;
  key: string;
  align?: "start" | "center" | "end";
  isNumber?: boolean;
  width?: string;
}

export interface ReportPdfSummaryItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface FinancialStatementPdfData {
  title: string;
  subtitle?: string;
  organizationName: string;
  taxNumber?: string | null;
  resortName?: string | null;
  currencyLabel: string;
  dateRangeLabel: string;
  columns: ReportPdfColumn[];
  rows: Record<string, any>[];
  totalRow?: Record<string, any>;
  summaries?: ReportPdfSummaryItem[];
  notes?: string[];
}

export function generateFinancialStatementPdf(
  data: FinancialStatementPdfData,
  locale: string = "ar"
): Window | null {
  const isAr = locale === "ar";
  const {
    title,
    subtitle,
    organizationName,
    taxNumber,
    resortName,
    currencyLabel,
    dateRangeLabel,
    columns,
    rows,
    totalRow,
    summaries = [],
    notes = [],
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeTitle = escapeHtml(title);
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : "";
  const safeDateRange = escapeHtml(dateRangeLabel);
  const safeCurrency = escapeHtml(currencyLabel);

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const summaryCardsHtml =
    summaries.length > 0
      ? `<div class="summary-grid">
        ${summaries
          .map(
            (s) => `
          <div class="summary-card ${s.highlight ? "highlight" : ""}">
            <div class="summary-label">${escapeHtml(s.label)}</div>
            <div class="summary-value">${typeof s.value === "number" ? s.value.toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : escapeHtml(String(s.value))} ${s.highlight ? `<span class="currency">${safeCurrency}</span>` : ""}</div>
          </div>
        `
          )
          .join("")}
      </div>`
      : "";

  const theadHtml = `
    <thead>
      <tr>
        ${columns
          .map(
            (c) => `
          <th style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; ${c.width ? `width: ${c.width};` : ""}">
            ${escapeHtml(c.header)}
          </th>
        `
          )
          .join("")}
      </tr>
    </thead>
  `;

  const tbodyHtml = `
    <tbody>
      ${
        rows.length > 0
          ? rows
              .map(
                (r, idx) => `
            <tr class="${idx % 2 === 1 ? "alt-row" : ""} ${r.__isGroup ? "group-row" : ""}">
              ${columns
                .map((c) => {
                  const val = r[c.key];
                  const formatted =
                    c.isNumber && typeof val === "number"
                      ? val.toLocaleString(isAr ? "ar-EG" : "en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : escapeHtml(String(val ?? "—"));

                  return `
                  <td style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; ${c.isNumber ? "font-family: 'Courier New', monospace; font-weight: 600;" : ""}">
                    ${formatted}
                  </td>
                `;
                })
                .join("")}
            </tr>
          `
              )
              .join("")
          : `<tr><td colspan="${columns.length}" style="text-align: center; padding: 20px; color: #64748b;">${isAr ? "لا توجد بيانات مسجلة لهذه الفترة" : "No records found for this period"}</td></tr>`
      }
    </tbody>
  `;

  const tfootHtml = totalRow
    ? `
    <tfoot>
      <tr class="total-row">
        ${columns
          .map((c, idx) => {
            const val = totalRow[c.key];
            const formatted =
              c.isNumber && typeof val === "number"
                ? val.toLocaleString(isAr ? "ar-EG" : "en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : val !== undefined
                ? escapeHtml(String(val))
                : idx === 0
                ? isAr
                  ? "الإجمالي العام"
                  : "Total"
                : "";

            return `
            <td style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; font-weight: 900; ${c.isNumber ? "font-family: 'Courier New', monospace;" : ""}">
              ${formatted}
            </td>
          `;
          })
          .join("")}
      </tr>
    </tfoot>
  `
    : "";

  const notesHtml =
    notes.length > 0
      ? `
    <div class="notes-section">
      <div class="notes-title">${isAr ? "ملاحظات وإيضاحات محاسبية:" : "Accounting Notes:"}</div>
      <ul>
        ${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
      </ul>
    </div>
  `
      : "";

  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle} — ${safeOrgName}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 15mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #0f172a;
      background: #ffffff;
      padding: 10px;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .header-table td {
      vertical-align: top;
    }
    .org-title {
      font-size: 16px;
      font-weight: 900;
      color: #0f172a;
    }
    .report-main-title {
      font-size: 18px;
      font-weight: 900;
      color: #1e1b4b;
      margin-top: 2px;
    }
    .report-subtitle {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
    }
    .meta-tag {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }
    .meta-tag strong {
      color: #0f172a;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .summary-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      background: #f8fafc;
    }
    .summary-card.highlight {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .summary-label {
      font-size: 9.5px;
      color: #64748b;
      font-weight: bold;
    }
    .summary-value {
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      font-family: 'Courier New', monospace;
      margin-top: 2px;
    }
    .summary-value .currency {
      font-size: 9px;
      font-weight: normal;
      color: #64748b;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .data-table th {
      background: #0f172a;
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      padding: 6px 8px;
      border: 1px solid #0f172a;
    }
    .data-table td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      font-size: 10px;
    }
    .data-table tr.alt-row td {
      background: #f8fafc;
    }
    .data-table tr.group-row td {
      background: #f1f5f9;
      font-weight: 800;
      color: #0f172a;
    }
    .data-table tr.total-row td {
      background: #f1f5f9;
      border-top: 2px solid #0f172a;
      border-bottom: 3px double #0f172a;
      font-size: 11px;
      padding: 6px 8px;
    }

    .notes-section {
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      background: #fafafa;
      margin-bottom: 16px;
      font-size: 9.5px;
      color: #475569;
    }
    .notes-title {
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .notes-section ul {
      padding-inline-start: 16px;
    }

    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 33.33%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
      background: #ffffff;
    }
    .sig-title {
      font-size: 10px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 30px;
    }
    .sig-line {
      border-top: 1px dotted #94a3b8;
      padding-top: 4px;
      font-size: 9px;
      color: #64748b;
    }

    .footer-bar {
      margin-top: 15px;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      font-size: 8.5px;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <!-- HEADER -->
  <table class="header-table">
    <tr>
      <td style="width: 55%;">
        <div class="org-title">${safeOrgName}</div>
        ${taxNumber ? `<div class="meta-tag">${isAr ? "الرقم الضريبي:" : "Tax ID:"} <strong>${escapeHtml(taxNumber)}</strong></div>` : ""}
        ${resortName ? `<div class="meta-tag">${isAr ? "الكيان العقاري:" : "Property:"} <strong>${escapeHtml(resortName)}</strong></div>` : ""}
      </td>
      <td style="width: 45%; text-align: ${isAr ? "left" : "right"};">
        <div class="report-main-title">${safeTitle}</div>
        ${safeSubtitle ? `<div class="report-subtitle">${safeSubtitle}</div>` : ""}
        <div class="meta-tag">${isAr ? "الفترة المالية:" : "Period:"} <strong>${safeDateRange}</strong></div>
        <div class="meta-tag">${isAr ? "العملة:" : "Currency:"} <strong>${safeCurrency}</strong></div>
      </td>
    </tr>
  </table>

  <!-- SUMMARIES -->
  ${summaryCardsHtml}

  <!-- MAIN TABLE -->
  <table class="data-table">
    ${theadHtml}
    ${tbodyHtml}
    ${tfootHtml}
  </table>

  <!-- NOTES -->
  ${notesHtml}

  <!-- SIGNATURES -->
  <table class="signatures-table">
    <tr>
      <td class="sig-box" style="padding-inline-end: 6px;">
        <div class="sig-title">${isAr ? "المحاسب المسؤول" : "Prepared By"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع" : "Signature"}</div>
      </td>
      <td style="width: 10px;"></td>
      <td class="sig-box">
        <div class="sig-title">${isAr ? "المراجع الداخلي" : "Reviewed By"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع" : "Signature"}</div>
      </td>
      <td style="width: 10px;"></td>
      <td class="sig-box" style="padding-inline-start: 6px;">
        <div class="sig-title">${isAr ? "المدير المالي / الاعتماد" : "Financial Director / Approval"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع والختم" : "Signature & Stamp"}</div>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <div class="footer-bar">
    <div>${isAr ? "تم استخراج هذا التقرير آلياً من منظومة عقار بوكس المحاسبية" : "Generated automatically via AqarBooks Financial Engine"}</div>
    <div>${isAr ? "تاريخ ووقت الطباعة:" : "Printed at:"} ${printTime}</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
  return printWindow;
}
