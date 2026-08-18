import { escapeHtml } from "@/lib/reports/html-escape";

// Branded account statement, following the same pattern as
// lib/reports/payment-receipt-pdf.ts: build an HTML string, wrap it in a
// same-origin Blob URL (never a cross-origin frame/src), open it in a new
// window and trigger print.
//
// A statement differs from a receipt in one way that drives its whole shape:
// a receipt documents a single moment, while a statement has to prove a
// BALANCE. That means every line carries a running balance, and the closing
// figure has to be the arithmetic consequence of the opening figure plus every
// line between -- otherwise the reader has no reason to believe the number
// they are being asked to pay.
//
// Security: renders only the fields explicitly passed in `data`. Every
// user-supplied string (owner name, unit code, description) is escaped.

export interface StatementLine {
  /** ISO date the movement is dated. */
  date: string;
  /** CHARGE increases what the account owes; PAYMENT reduces it. */
  kind: "CHARGE" | "PAYMENT";
  description: string;
  unitCode: string | null;
  reference: string | null;
  amount: number;
}

interface StatementData {
  organizationName: string;
  propertyName: string;
  currency: string;
  accountName: string;
  periodStart: string | null;
  periodEnd: string | null;
  openingBalance: number;
  lines: StatementLine[];
}

export function generateAccountStatementPdf(data: StatementData, locale: string): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    propertyName,
    currency,
    accountName,
    periodStart,
    periodEnd,
    openingBalance,
    lines,
  } = data;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printedOn = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  // Oldest first: a running balance only reads as a proof if it accumulates
  // in the direction time actually moves.
  const ordered = [...lines].sort((a, b) => a.date.localeCompare(b.date));

  let running = openingBalance;
  const rows = ordered.map((line) => {
    const signed = line.kind === "CHARGE" ? line.amount : -line.amount;
    running += signed;
    return { ...line, balanceAfter: running };
  });

  const totalCharges = ordered
    .filter((l) => l.kind === "CHARGE")
    .reduce((s, l) => s + l.amount, 0);
  const totalPayments = ordered
    .filter((l) => l.kind === "PAYMENT")
    .reduce((s, l) => s + l.amount, 0);
  const closingBalance = openingBalance + totalCharges - totalPayments;

  const safeOrg = escapeHtml(organizationName);
  const safeProperty = escapeHtml(propertyName);
  const safeAccount = escapeHtml(accountName);
  const safeCurrency = escapeHtml(currency);
  const initial = escapeHtml((organizationName.trim()[0] ?? "A").toUpperCase());

  const periodLabel =
    periodStart && periodEnd
      ? `${escapeHtml(periodStart)} → ${escapeHtml(periodEnd)}`
      : isAr
        ? "كل الحركات"
        : "All activity";

  const rowsHtml = rows
    .map(
      (r) => `      <tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.description)}${r.unitCode ? ` <span class="muted">· ${escapeHtml(r.unitCode)}</span>` : ""}${r.reference ? ` <span class="muted">· ${escapeHtml(r.reference)}</span>` : ""}</td>
        <td class="num">${r.kind === "CHARGE" ? fmt(r.amount) : ""}</td>
        <td class="num">${r.kind === "PAYMENT" ? fmt(r.amount) : ""}</td>
        <td class="num strong">${fmt(r.balanceAfter)}</td>
      </tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `كشف حساب — ${safeAccount}` : `Account Statement — ${safeAccount}`}</title>
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

    .doc-title { font-size: 15px; font-weight: 700; margin-bottom: 12px; }

    .info-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px; margin-bottom: 20px; font-size: 12px;
    }
    .info-row {
      display: flex; justify-content: space-between;
      border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;
    }
    .info-row .label { color: #64748b; }
    .info-row .value { color: #0f172a; font-weight: 600; }

    .kpi-grid {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 12px; margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 10px 14px; background: #f8fafc;
    }
    .kpi-label { font-size: 10px; color: #64748b; font-weight: 500; }
    .kpi-value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .kpi-box.closing { background: #eff6ff; border-color: #bfdbfe; }
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
    .opening-row td { background: #f8fafc; font-weight: 600; }
    .muted { color: #94a3b8; }

    .empty-note {
      padding: 14px; font-size: 11px; color: #64748b; text-align: center;
      border: 1px dashed #e2e8f0; border-radius: 8px;
    }

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
        <div class="resort-title">${safeProperty}</div>
      </div>
    </div>
    <div class="meta-info">
      <div><strong>${isAr ? "كشف حساب" : "Account Statement"}</strong></div>
      <div>${isAr ? "تاريخ الطباعة" : "Printed"}: ${escapeHtml(printedOn)}</div>
      <div>${isAr ? "العملة" : "Currency"}: ${safeCurrency}</div>
    </div>
  </div>

  <div class="doc-title">${isAr ? "كشف حساب" : "Account Statement"}</div>

  <div class="info-grid">
    <div class="info-row">
      <span class="label">${isAr ? "الحساب" : "Account"}</span>
      <span class="value">${safeAccount}</span>
    </div>
    <div class="info-row">
      <span class="label">${isAr ? "الفترة" : "Period"}</span>
      <span class="value">${periodLabel}</span>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "رصيد أول المدة" : "Opening balance"}</div>
      <div class="kpi-value">${fmt(openingBalance)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "إجمالي المستحق" : "Total charges"}</div>
      <div class="kpi-value">${fmt(totalCharges)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "إجمالي المدفوع" : "Total paid"}</div>
      <div class="kpi-value">${fmt(totalPayments)}</div>
    </div>
    <div class="kpi-box closing">
      <div class="kpi-label">${isAr ? "الرصيد المستحق" : "Balance due"}</div>
      <div class="kpi-value ${closingBalance <= 0.005 ? "settled" : "owing"}">${fmt(closingBalance)}</div>
    </div>
  </div>

  ${
    rows.length === 0
      ? `<div class="empty-note">${isAr ? "لا توجد حركات في هذه الفترة." : "No activity in this period."}</div>`
      : `<table class="report-table">
    <thead>
      <tr>
        <th>${isAr ? "التاريخ" : "Date"}</th>
        <th>${isAr ? "البيان" : "Description"}</th>
        <th class="num">${isAr ? "مستحق" : "Charges"}</th>
        <th class="num">${isAr ? "مدفوع" : "Payments"}</th>
        <th class="num">${isAr ? "الرصيد" : "Balance"}</th>
      </tr>
    </thead>
    <tbody>
      <tr class="opening-row">
        <td>${periodStart ? escapeHtml(periodStart) : ""}</td>
        <td>${isAr ? "رصيد أول المدة" : "Opening balance"}</td>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num strong">${fmt(openingBalance)}</td>
      </tr>
${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">${isAr ? "الرصيد المستحق في نهاية المدة" : "Balance due at period end"}</td>
        <td class="num">${fmt(totalCharges)}</td>
        <td class="num">${fmt(totalPayments)}</td>
        <td class="num">${fmt(closingBalance)}</td>
      </tr>
    </tfoot>
  </table>`
  }

  <div class="report-footer">
    <div>${isAr ? `عقار بوكس لإدارة الكيانات والأصول العقارية &copy; ${new Date().getFullYear()} AqarBooks` : `AqarBooks &copy; ${new Date().getFullYear()} Real Estate & Asset Management`}</div>
    <div>${isAr ? "كشف حساب رسمي · صادر آليًا من النظام" : "Official Account Statement · Generated Systematically"}</div>
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
