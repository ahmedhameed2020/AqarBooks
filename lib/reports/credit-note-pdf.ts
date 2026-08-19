import { escapeHtml } from "@/lib/reports/html-escape";
import { tafqeetArabic } from "@/lib/tafqeet";

export interface CreditNoteData {
  organizationName: string;
  resortName?: string;
  documentNumber: string;
  creditDate: string;
  unitCode: string;
  dueTitle: string;
  reason: string;
  grossAmount: number;
  taxableBase: number;
  vatAmount: number;
  vatRatePercent: number;
  currencyCode: string;
  currencyLabel: string;
}

export function generateCreditNotePdf(
  data: CreditNoteData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    documentNumber,
    creditDate,
    unitCode,
    dueTitle,
    reason,
    grossAmount,
    taxableBase,
    vatAmount,
    vatRatePercent,
    currencyCode,
    currencyLabel,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResort = resortName ? escapeHtml(resortName) : "";
  const safeDocNo = escapeHtml(documentNumber);
  const safeUnit = escapeHtml(unitCode);
  const safeTitle = escapeHtml(dueTitle);
  const safeReason = escapeHtml(reason);
  const safeCurrency = escapeHtml(currencyLabel);

  const tafqeetText = tafqeetArabic(grossAmount, currencyCode);

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `إشعار_خصم_${safeDocNo}` : `Credit_Note_${safeDocNo}`}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');

    @page {
      size: A4 portrait;
      margin: 15mm 18mm;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    body {
      font-family: 'IBM Plex Sans Arabic', 'Inter', system-ui, -apple-system, sans-serif;
      background: #ffffff;
      color: #0f172a;
      line-height: 1.5;
    }

    .card {
      max-width: 185mm;
      margin: 0 auto;
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 24px;
    }

    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }

    .org-title {
      font-size: 20px;
      font-weight: 800;
    }

    .badge {
      display: inline-block;
      background: #dc2626;
      color: #ffffff;
      padding: 5px 16px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 800;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 14px;
      font-size: 11px;
    }

    .meta-label {
      color: #64748b;
      font-size: 10px;
      margin-bottom: 2px;
      font-weight: 600;
    }

    .meta-value {
      font-weight: 700;
      color: #0f172a;
    }

    .reason-box {
      background: #fff1f2;
      border: 1px solid #fecdd3;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 12px;
      color: #9f1239;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 16px;
    }

    .table th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 10px;
      font-weight: 700;
      text-align: ${isAr ? "right" : "left"};
    }

    .table td {
      padding: 10px;
      border: 1px solid #e2e8f0;
    }

    .total-row {
      background: #f1f5f9;
      font-weight: 800;
      font-size: 12px;
    }

    .tafqeet-box {
      background: #f8fafc;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 24px;
    }

    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px dashed #cbd5e1;
      text-align: center;
    }

    .sig-title {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 40px;
    }

    .sig-line {
      border-bottom: 1px solid #0f172a;
      width: 75%;
      margin: 0 auto;
    }

    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div class="org-title">${safeOrgName}</div>
          <div style="font-size: 11px; color: #64748b;">${safeResort || (isAr ? "إدارة الشؤون المالية والفوترة" : "Finance & Invoicing Department")}</div>
        </td>
        <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top;">
          <div class="badge">${isAr ? "إشعار خصم ضريبي (CREDIT NOTE)" : "TAX CREDIT NOTE"}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600;">
            ${isAr ? "رقم الإشعار: " : "Doc #: "}<span style="font-family: monospace; font-weight: bold; color: #0f172a;">${safeDocNo}</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="meta-grid">
      <div>
        <div class="meta-label">${isAr ? "تاريخ الإشعار:" : "Credit Date:"}</div>
        <div class="meta-value font-mono">${creditDate}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "الوحدة العقارية:" : "Unit Code:"}</div>
        <div class="meta-value font-mono">${safeUnit}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "المطالبة الأصلية:" : "Original Due:"}</div>
        <div class="meta-value">${safeTitle}</div>
      </div>
    </div>

    <div class="reason-box">
      <strong>${isAr ? "سبب إصدار إشعار الخصم:" : "Reason for Credit Note:"}</strong> ${safeReason}
    </div>

    <!-- Amount Breakdown Table -->
    <table class="table">
      <thead>
        <tr>
          <th>${isAr ? "البيان" : "Description"}</th>
          <th style="text-align: right;">${isAr ? "الوعاء الخاضع (صافي الخصم)" : "Taxable Base"}</th>
          <th style="text-align: right;">${isAr ? `ضريبة القيمة المضافة (${vatRatePercent}%)` : `VAT (${vatRatePercent}%)`}</th>
          <th style="text-align: right;">${isAr ? "إجمالي الخصم شامل الضريبة" : "Total Gross Credit"}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${safeTitle} — ${safeReason}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold;">
            ${fmt(taxableBase)} ${safeCurrency}
          </td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; color: #dc2626;">
            ${fmt(vatAmount)} ${safeCurrency}
          </td>
          <td style="text-align: right; font-family: monospace; font-weight: 900; font-size: 13px; color: #0f172a;">
            ${fmt(grossAmount)} ${safeCurrency}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="tafqeet-box">
      <strong>${isAr ? "فقط وقدره: " : "Total in words: "}</strong> ${tafqeetText}
    </div>

    <!-- Signatures -->
    <div class="signatures-grid">
      <div>
        <div class="sig-title">${isAr ? "المحاسب المسؤول" : "Accountant"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "المراجع الداخلي" : "Audited by"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "اعتماد المدير المالي" : "Financial Controller"}</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <div class="footer">
      <div>${isAr ? "نظام AqarBooks المالي — إدارة الإشعارات الضريبية" : "AqarBooks Tax Credit Management"}</div>
      <div>${isAr ? "تاريخ الطباعة: " : "Printed: "}${printTime}</div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
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
