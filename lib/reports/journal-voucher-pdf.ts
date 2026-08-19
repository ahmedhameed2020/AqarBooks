import { escapeHtml } from "@/lib/reports/html-escape";
import { tafqeetArabic } from "@/lib/tafqeet";

export interface JournalVoucherLine {
  accountCode: string;
  accountName: string;
  description?: string | null;
  debit: number;
  credit: number;
}

export interface JournalVoucherData {
  organizationName: string;
  resortName?: string;
  entryNumber?: string | null;
  entryDate: string;
  description: string;
  sourceType: string;
  status: string;
  currencyCode: string;
  currencyLabel: string;
  totalDebit: number;
  totalCredit: number;
  lines: JournalVoucherLine[];
}

export function generateJournalVoucherPdf(
  data: JournalVoucherData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    entryNumber,
    entryDate,
    description,
    sourceType,
    status,
    currencyCode,
    currencyLabel,
    totalDebit,
    totalCredit,
    lines,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResort = resortName ? escapeHtml(resortName) : "";
  const safeEntryNo = entryNumber ? escapeHtml(entryNumber) : (isAr ? "مسودة" : "Draft");
  const safeDesc = escapeHtml(description || "—");
  const safeCurrency = escapeHtml(currencyLabel);

  const tafqeetText = tafqeetArabic(totalDebit, currencyCode);

  const fmt = (n: number) =>
    n > 0
      ? n.toLocaleString(isAr ? "ar-EG" : "en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const statusLabel =
    status === "POSTED"
      ? isAr ? "مرحل ومعتمد" : "Posted"
      : status === "DRAFT"
      ? isAr ? "مسودة" : "Draft"
      : status === "UNDER_REVIEW"
      ? isAr ? "قيد المراجعة" : "Under Review"
      : isAr ? "قيد ملغي / عكسي" : "Reversed";

  const rowsHtml = lines
    .map((l, idx) => {
      return `<tr class="${idx % 2 === 1 ? "alt-row" : ""}">
        <td style="font-family: monospace; font-weight: bold; width: 90px;">${escapeHtml(l.accountCode)}</td>
        <td style="font-weight: 600;">${escapeHtml(l.accountName)}</td>
        <td style="color: #64748b; font-size: 11px;">${escapeHtml(l.description || "—")}</td>
        <td style="text-align: right; font-family: monospace; font-weight: bold; width: 110px; color: ${l.debit > 0 ? "#166534" : "#94a3b8"};">
          ${fmt(l.debit)}
        </td>
        <td style="text-align: right; font-family: monospace; font-weight: bold; width: 110px; color: ${l.credit > 0 ? "#1e3a8a" : "#94a3b8"};">
          ${fmt(l.credit)}
        </td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `سند_قيد_يومية_${safeEntryNo}` : `Journal_Voucher_${safeEntryNo}`}</title>
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
      padding: 0;
    }

    .voucher-card {
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

    .voucher-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 5px 16px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 800;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
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

    .desc-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .lines-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 16px;
    }

    .lines-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 10px;
      font-weight: 700;
      text-align: ${isAr ? "right" : "left"};
    }

    .lines-table td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
    }

    .alt-row {
      background: #f8fafc;
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
  <div class="voucher-card">
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div class="org-title">${safeOrgName}</div>
          <div style="font-size: 11px; color: #64748b;">${safeResort || (isAr ? "دفتر الأستاذ والقيود اليومية العامة" : "General Ledger & Journal Entries")}</div>
        </td>
        <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top;">
          <div class="voucher-badge">${isAr ? "سند قيد يومية عامة" : "JOURNAL VOUCHER"}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600;">
            ${isAr ? "رقم القيد: " : "Entry #: "}<span style="font-family: monospace; font-weight: bold; color: #0f172a;">${safeEntryNo}</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="meta-grid">
      <div>
        <div class="meta-label">${isAr ? "تاريخ القيد:" : "Entry Date:"}</div>
        <div class="meta-value" style="font-family: monospace;">${entryDate}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "حالة القيد:" : "Status:"}</div>
        <div class="meta-value">${statusLabel}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "المصدر / النوع:" : "Source Type:"}</div>
        <div class="meta-value font-mono">${sourceType}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "العملة:" : "Currency:"}</div>
        <div class="meta-value">${safeCurrency} (${currencyCode})</div>
      </div>
    </div>

    <div class="desc-box">
      <strong style="color: #64748b;">${isAr ? "البيان والشرح العام للقيد:" : "Narration / Memo:"}</strong> ${safeDesc}
    </div>

    <!-- Journal Lines Table -->
    <table class="lines-table">
      <thead>
        <tr>
          <th>${isAr ? "رقم الحساب" : "Account #"}</th>
          <th>${isAr ? "اسم الحساب" : "Account Name"}</th>
          <th>${isAr ? "البيان التفصيلي" : "Line Memo"}</th>
          <th style="text-align: right;">${isAr ? "مدين (Dr)" : "Debit"}</th>
          <th style="text-align: right;">${isAr ? "دائن (Cr)" : "Credit"}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="3" style="text-align: ${isAr ? "left" : "right"}; padding: 10px;">${isAr ? "إجمالي قيد اليومية المتوازن:" : "Total Balanced Journal:"}</td>
          <td style="text-align: right; font-family: monospace; color: #166534; padding: 10px;">
            ${fmt(totalDebit)} ${safeCurrency}
          </td>
          <td style="text-align: right; font-family: monospace; color: #1e3a8a; padding: 10px;">
            ${fmt(totalCredit)} ${safeCurrency}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="tafqeet-box">
      <strong>${isAr ? "فقط وقدره: " : "Amount in words: "}</strong> ${tafqeetText}
    </div>

    <!-- Signatures -->
    <div class="signatures-grid">
      <div>
        <div class="sig-title">${isAr ? "إعداد المحاسب" : "Prepared by"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "المراجع والمطابقة" : "Audited by"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "اعتماد المدير المالي" : "Approved by"}</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <div class="footer">
      <div>${isAr ? "نظام AqarBooks المالي — الإدارة المحاسبية ودفاتر الأستاذ" : "AqarBooks General Ledger System"}</div>
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
