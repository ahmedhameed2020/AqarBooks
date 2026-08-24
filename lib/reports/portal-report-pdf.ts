import { escapeHtml } from "@/lib/reports/html-escape";

// Generic branded report document for the owner portal, deliberately built on
// the same visual language as lib/reports/account-statement-pdf.ts (same
// header band, same KPI boxes, same table treatment, same footer) so every
// paper an owner receives from AqarBooks reads as one document family.
//
// account-statement-pdf.ts stays separate rather than being folded into this:
// a statement has to prove a BALANCE, so its running-balance column and its
// opening/closing arithmetic are structural, not configuration. Everything
// else the portal prints -- an open-dues notice, a receipts ledger, a
// portfolio schedule, a document register -- is a titled table with summary
// figures, which is exactly what this renders.
//
// Security: renders only what is passed in `data`, and every caller-supplied
// string (owner name, unit code, description, file name) is escaped.

export interface PortalReportColumn {
  header: string;
  key: string;
  /** Right-aligned in LTR / left-aligned in RTL, with tabular figures. */
  numeric?: boolean;
  /** Renders the cell bold -- for the one column that carries the point. */
  strong?: boolean;
}

export interface PortalReportKpi {
  label: string;
  value: string;
  /** `owing` prints red, `settled` prints green, default prints ink-black. */
  tone?: "owing" | "settled" | "neutral";
  /** Tints the box to mark it as the figure the reader is looking for. */
  emphasis?: boolean;
}

export interface PortalReportData {
  organizationName: string;
  /** Appears in the header band, the <title>, and the document heading. */
  documentTitle: string;
  documentSubtitle?: string;
  accountName: string;
  currency: string;
  /** Free-text period descriptor, already localized by the caller. */
  periodLabel?: string | null;
  infoRows?: { label: string; value: string }[];
  kpis?: PortalReportKpi[];
  columns: PortalReportColumn[];
  rows: Record<string, string | number | null | undefined>[];
  /** Rendered in <tfoot>; keys match `columns`. */
  totalRow?: Record<string, string | number | null | undefined>;
  /** Printed under the table -- disclosures, caveats, settlement notes. */
  notes?: string[];
  emptyMessage: string;
}

export function generatePortalReportPdf(data: PortalReportData, locale: string): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    documentTitle,
    documentSubtitle,
    accountName,
    currency,
    periodLabel,
    infoRows = [],
    kpis = [],
    columns,
    rows,
    totalRow,
    notes = [],
    emptyMessage,
  } = data;

  const printedOn = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const safeOrg = escapeHtml(organizationName);
  const safeTitle = escapeHtml(documentTitle);
  const safeAccount = escapeHtml(accountName);
  const safeCurrency = escapeHtml(currency);
  const initial = escapeHtml((organizationName.trim()[0] ?? "A").toUpperCase());

  // A KPI grid of 4 is the account-statement layout; fewer figures should
  // still fill the width rather than leaving a ragged gap.
  const kpiColumns = Math.min(Math.max(kpis.length, 1), 4);

  const cell = (value: string | number | null | undefined) =>
    value === null || value === undefined || value === "" ? "" : escapeHtml(String(value));

  const headHtml = columns
    .map((c) => `<th class="${c.numeric ? "num" : ""}">${escapeHtml(c.header)}</th>`)
    .join("");

  const rowsHtml = rows
    .map(
      (r) =>
        `      <tr>${columns
          .map(
            (c) =>
              `<td class="${c.numeric ? "num" : ""}${c.strong ? " strong" : ""}">${cell(r[c.key])}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("\n");

  const totalHtml = totalRow
    ? `    <tfoot>
      <tr>${columns
        .map((c) => `<td class="${c.numeric ? "num" : ""}">${cell(totalRow[c.key])}</td>`)
        .join("")}</tr>
    </tfoot>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${safeTitle} — ${safeAccount}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 24px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @media print {
      @page { size: A4 portrait; margin: 12mm; }
      body { padding: 0; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .org-brand { display: flex; align-items: center; gap: 12px; }
    .logo-badge {
      width: 44px; height: 44px; border-radius: 12px;
      background: #2563eb; color: #ffffff;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: bold;
    }
    .org-name { font-size: 20px; font-weight: 700; color: #0f172a; }
    .resort-title { font-size: 13px; color: #64748b; }
    .meta-info { text-align: ${isAr ? "left" : "right"}; font-size: 11px; color: #64748b; }
    .meta-info strong { color: #0f172a; }

    .doc-title { font-size: 15px; font-weight: 700; }
    .doc-subtitle { font-size: 11.5px; color: #64748b; margin-bottom: 12px; }

    .info-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px; margin: 12px 0 20px; font-size: 12px;
    }
    .info-row {
      display: flex; justify-content: space-between;
      border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;
    }
    .info-row .label { color: #64748b; }
    .info-row .value { color: #0f172a; font-weight: 600; }

    .kpi-grid {
      display: grid; grid-template-columns: repeat(${kpiColumns}, 1fr);
      gap: 12px; margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 10px 14px; background: #f8fafc;
    }
    .kpi-label { font-size: 10px; color: #64748b; font-weight: 500; }
    .kpi-value {
      font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .kpi-box.emphasis { background: #eff6ff; border-color: #bfdbfe; }
    .kpi-value.settled { color: #10b981; }
    .kpi-value.owing { color: #dc2626; }

    .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .report-table th {
      background: #f1f5f9; color: #334155; font-weight: 600;
      text-align: ${isAr ? "right" : "left"};
      padding: 8px 10px; border-bottom: 1px solid #cbd5e1;
    }
    .report-table td {
      padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b;
    }
    .report-table tr:nth-child(even) td { background: #fafafa; }
    .report-table td.num, .report-table th.num {
      text-align: ${isAr ? "left" : "right"};
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .report-table td.strong { font-weight: 700; }
    .report-table tfoot td {
      font-weight: 700; color: #0f172a;
      border-top: 1px solid #cbd5e1; border-bottom: none; background: #ffffff;
    }

    .empty-note {
      padding: 14px; font-size: 11px; color: #64748b; text-align: center;
      border: 1px dashed #e2e8f0; border-radius: 8px;
    }

    .notes { margin-top: 16px; font-size: 10.5px; color: #64748b; }
    .notes li { margin-inline-start: 16px; padding-block: 2px; }

    .report-footer {
      margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between;
      font-size: 10px; color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="org-brand">
      <div class="logo-badge">${initial}</div>
      <div>
        <div class="org-name">${safeOrg}</div>
        <div class="resort-title">${isAr ? "بوابة الملاك والمستثمرين" : "Owner & Investor Portal"}</div>
      </div>
    </div>
    <div class="meta-info">
      <div><strong>${safeTitle}</strong></div>
      <div>${isAr ? "تاريخ الطباعة" : "Printed"}: ${escapeHtml(printedOn)}</div>
      <div>${isAr ? "العملة" : "Currency"}: ${safeCurrency}</div>
    </div>
  </div>

  <div class="doc-title">${safeTitle}</div>
  ${documentSubtitle ? `<div class="doc-subtitle">${escapeHtml(documentSubtitle)}</div>` : ""}

  <div class="info-grid">
    <div class="info-row">
      <span class="label">${isAr ? "الحساب" : "Account"}</span>
      <span class="value">${safeAccount}</span>
    </div>
    <div class="info-row">
      <span class="label">${isAr ? "الفترة" : "Period"}</span>
      <span class="value">${escapeHtml(periodLabel || (isAr ? "كل الحركات" : "All activity"))}</span>
    </div>
${infoRows
  .map(
    (r) => `    <div class="info-row">
      <span class="label">${escapeHtml(r.label)}</span>
      <span class="value">${escapeHtml(r.value)}</span>
    </div>`,
  )
  .join("\n")}
  </div>

  ${
    kpis.length
      ? `<div class="kpi-grid">
${kpis
  .map(
    (k) => `    <div class="kpi-box${k.emphasis ? " emphasis" : ""}">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value${k.tone && k.tone !== "neutral" ? ` ${k.tone}` : ""}">${escapeHtml(k.value)}</div>
    </div>`,
  )
  .join("\n")}
  </div>`
      : ""
  }

  ${
    rows.length === 0
      ? `<div class="empty-note">${escapeHtml(emptyMessage)}</div>`
      : `<table class="report-table">
    <thead>
      <tr>${headHtml}</tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
${totalHtml}
  </table>`
  }

  ${
    notes.length
      ? `<div class="notes"><ul>
${notes.map((n) => `    <li>${escapeHtml(n)}</li>`).join("\n")}
  </ul></div>`
      : ""
  }

  <div class="report-footer">
    <div>${isAr ? `AqarBooks لإدارة الكيانات والأصول العقارية &copy; ${new Date().getFullYear()} AqarBooks` : `AqarBooks &copy; ${new Date().getFullYear()} Real Estate & Asset Management`}</div>
    <div>${isAr ? "مستند رسمي · صادر آليًا من النظام" : "Official document · Generated systematically"}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    };
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    window.location.href = url;
  }
  return win;
}
