import { escapeHtml } from "@/lib/reports/html-escape";
import { tafqeetArabic } from "@/lib/tafqeet";

export interface CommissionVoucherPdfData {
  organizationName: string;
  brokerName: string;
  brokerType?: string;
  taxId?: string | null;
  phone?: string | null;
  propertyName?: string;
  grossAmount: number;
  whtRate?: number | null;
  whtAmount: number;
  netAmount: number;
  basisAmount?: number | null;
  ratePercent?: number | null;
  earnedDate: string;
  paidDate?: string | null;
  cashAccountName?: string | null;
  note?: string | null;
  currencyCode: string;
  currencyLabel: string;
  paymentJournalEntryId?: string | null;
  accrualJournalEntryId?: string | null;
}

export function generateCommissionVoucherPdf(
  data: CommissionVoucherPdfData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    brokerName,
    brokerType,
    taxId,
    phone,
    propertyName,
    grossAmount,
    whtRate,
    whtAmount,
    netAmount,
    basisAmount,
    ratePercent,
    earnedDate,
    paidDate,
    cashAccountName,
    note,
    currencyCode,
    currencyLabel,
    paymentJournalEntryId,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeBrokerName = escapeHtml(brokerName || "—");
  const safeProperty = propertyName ? escapeHtml(propertyName) : "";
  const safeDate = escapeHtml(paidDate || earnedDate || new Date().toISOString().split("T")[0]);
  const safeCashAccount = cashAccountName ? escapeHtml(cashAccountName) : "—";
  const safeNote = note ? escapeHtml(note) : "—";
  const safeCurrencyLabel = escapeHtml(currencyLabel);

  const tafqeetText = escapeHtml(tafqeetArabic(netAmount, currencyCode));

  const fmtAmount = (n: number) =>
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
  <title>${isAr ? `سند_صرف_عمولة_${safeBrokerName}` : `Commission_Voucher_${safeBrokerName}`}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');

    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
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

    .voucher-wrapper {
      max-width: 190mm;
      margin: 0 auto;
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 24px 28px;
      background: #ffffff;
    }

    .voucher-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 18px;
    }

    .org-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }

    .org-subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 500;
    }

    .voucher-badge-box {
      text-align: ${isAr ? "left" : "right"};
    }

    .voucher-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 5px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .meta-item-label {
      color: #64748b;
      font-size: 11px;
      margin-bottom: 2px;
    }

    .meta-item-value {
      font-weight: 700;
      color: #0f172a;
      font-size: 13px;
    }

    .amount-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f0fdf4;
      border: 2px solid #16a34a;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 18px;
    }

    .amount-num-label {
      font-size: 11px;
      font-weight: 700;
      color: #15803d;
      text-transform: uppercase;
    }

    .amount-num-value {
      font-size: 24px;
      font-weight: 900;
      color: #14532d;
      font-family: monospace;
      margin-top: 2px;
    }

    .amount-words-box {
      max-width: 55%;
      text-align: ${isAr ? "left" : "right"};
    }

    .amount-words-label {
      font-size: 10px;
      color: #64748b;
      margin-bottom: 2px;
    }

    .amount-words-value {
      font-size: 13px;
      font-weight: 700;
      color: #15803d;
      line-height: 1.4;
    }

    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 12px;
    }

    .details-table th, .details-table td {
      border: 1px solid #e2e8f0;
      padding: 9px 12px;
      text-align: ${isAr ? "right" : "left"};
    }

    .details-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      width: 32%;
    }

    .details-table td {
      color: #0f172a;
      font-weight: 500;
    }

    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 32px;
      padding-top: 20px;
      border-top: 2px solid #cbd5e1;
      text-align: center;
    }

    .signature-title {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 45px;
    }

    .signature-line {
      border-bottom: 1px dashed #64748b;
      width: 80%;
      margin: 0 auto;
    }

    .footer-note {
      margin-top: 24px;
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
  <div class="voucher-wrapper">
    <!-- Header -->
    <div class="voucher-header">
      <div>
        <div class="org-title">${safeOrgName}</div>
        <div class="org-subtitle">${isAr ? "إدارة الوساطة والتسويق العقاري والحسابات" : "Brokerage & Real Estate Finance Dept"}</div>
      </div>
      <div class="voucher-badge-box">
        <div class="voucher-badge">${isAr ? "سند سداد وصرف عمولة" : "COMMISSION PAYMENT VOUCHER"}</div>
      </div>
    </div>

    <!-- Meta Information -->
    <div class="meta-grid">
      <div>
        <div class="meta-item-label">${isAr ? "الوسيط / المستفيد:" : "Broker / Beneficiary:"}</div>
        <div class="meta-item-value">${safeBrokerName} ${taxId ? `(${isAr ? "ضريبي:" : "Tax ID:"} ${escapeHtml(taxId)})` : ""}</div>
      </div>
      <div>
        <div class="meta-item-label">${isAr ? "تاريخ السداد:" : "Payment Date:"}</div>
        <div class="meta-item-value">${safeDate}</div>
      </div>
    </div>

    <!-- Amount Banner -->
    <div class="amount-banner">
      <div>
        <div class="amount-num-label">${isAr ? "صافي العمولة المنصرفة" : "Net Commission Paid"}</div>
        <div class="amount-num-value">${fmtAmount(netAmount)} <span style="font-size: 14px; font-weight: bold;">${safeCurrencyLabel}</span></div>
      </div>
      <div class="amount-words-box">
        <div class="amount-words-label">${isAr ? "المبلغ الصافي بالحروف (تفقيط):" : "Net Amount in Words:"}</div>
        <div class="amount-words-value">${tafqeetText}</div>
      </div>
    </div>

    <!-- Details Table -->
    <table class="details-table">
      <tr>
        <th>${isAr ? "إجمالي العمولة المستحقة" : "Gross Commission Earned"}</th>
        <td style="font-family: monospace; font-weight: bold;">${fmtAmount(grossAmount)} ${safeCurrencyLabel}</td>
      </tr>
      ${
        whtAmount > 0
          ? `<tr>
        <th>${isAr ? `ضريبة الخصم من المنبع المحتجزة (${whtRate || 0}%)` : `Withheld Tax (${whtRate || 0}%)`}</th>
        <td style="color: #b91c1c; font-family: monospace; font-weight: bold;">- ${fmtAmount(whtAmount)} ${safeCurrencyLabel}</td>
      </tr>`
          : ""
      }
      ${
        safeProperty
          ? `<tr>
        <th>${isAr ? "المشروع / العقار المرتبط" : "Property / Deal"}</th>
        <td>${safeProperty}</td>
      </tr>`
          : ""
      }
      ${
        basisAmount && ratePercent
          ? `<tr>
        <th>${isAr ? "معادلة احتساب العمولة" : "Commission Basis"}</th>
        <td>${ratePercent}% ${isAr ? "من قيمة الصفقة" : "of deal value"} (${fmtAmount(basisAmount)} ${safeCurrencyLabel})</td>
      </tr>`
          : ""
      }
      <tr>
        <th>${isAr ? "حساب الدفع / الصرف" : "Paid From Account"}</th>
        <td>${safeCashAccount}</td>
      </tr>
      <tr>
        <th>${isAr ? "البيان / الملاحظات" : "Notes / Purpose"}</th>
        <td>${safeNote}</td>
      </tr>
      ${
        paymentJournalEntryId
          ? `<tr>
        <th>${isAr ? "القيد المحاسبي لليومية" : "General Ledger Posting"}</th>
        <td style="color: #059669; font-weight: 700;">${isAr ? "✓ تم ترحيل إقفال الالتزام والقيد المحاسبي تلقائياً" : "✓ Liability settled & General Ledger posted"}</td>
      </tr>`
          : ""
      }
    </table>

    <!-- Signatures -->
    <div class="signatures-grid">
      <div>
        <div class="signature-title">${isAr ? "إعداد المحاسب" : "Prepared By"}</div>
        <div class="signature-line"></div>
      </div>
      <div>
        <div class="signature-title">${isAr ? "الاعتماد المالي / الإدارة" : "Financial Approval"}</div>
        <div class="signature-line"></div>
      </div>
      <div>
        <div class="signature-title">${isAr ? "توقيع واستلام الوسيط" : "Broker Signature"}</div>
        <div class="signature-line"></div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-note">
      <div>${isAr ? "نظام AqarBooks المالي لإدارة الكيانات والأصول العقارية" : "AqarBooks Financial Management Suite"}</div>
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
