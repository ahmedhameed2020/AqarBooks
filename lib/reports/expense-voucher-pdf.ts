import { escapeHtml } from "@/lib/reports/html-escape";
import { tafqeetArabic } from "@/lib/tafqeet";

export interface ExpenseVoucherPdfData {
  organizationName: string;
  resortName?: string;
  voucherNumber: number | string | null;
  expenseDate: string;
  categoryName: string;
  paymentAccountName: string;
  description: string;
  amount: number;
  currencyCode: string;
  currencyLabel: string;
  journalEntryId?: string | null;
}

export function generateExpenseVoucherPdf(
  data: ExpenseVoucherPdfData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    voucherNumber,
    expenseDate,
    categoryName,
    paymentAccountName,
    description,
    amount,
    currencyCode,
    currencyLabel,
    journalEntryId,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResortName = resortName ? escapeHtml(resortName) : "";
  const safeVoucherNo = escapeHtml(String(voucherNumber ?? "—"));
  const safeDate = escapeHtml(expenseDate || new Date().toISOString().split("T")[0]);
  const safeCategory = escapeHtml(categoryName || "—");
  const safeAccount = escapeHtml(paymentAccountName || "—");
  const safeDescription = escapeHtml(description || "—");
  const safeCurrencyLabel = escapeHtml(currencyLabel);

  const tafqeetText = escapeHtml(tafqeetArabic(amount, currencyCode));

  const fmtAmount = amount.toLocaleString(isAr ? "ar-EG" : "en-US", {
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
  <title>${isAr ? `سند صرف #${safeVoucherNo}` : `Payment Voucher #${safeVoucherNo}`}</title>
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
      position: relative;
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

    .voucher-number {
      font-family: monospace;
      font-size: 13px;
      font-weight: 700;
      color: #1e40af;
      margin-top: 6px;
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
      background: #f0f9ff;
      border: 2px solid #0284c7;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 18px;
    }

    .amount-num-label {
      font-size: 11px;
      font-weight: 700;
      color: #0369a1;
      text-transform: uppercase;
    }

    .amount-num-value {
      font-size: 24px;
      font-weight: 900;
      color: #0c4a6e;
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
      color: #0369a1;
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
      padding: 10px 14px;
      text-align: ${isAr ? "right" : "left"};
    }

    .details-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      width: 28%;
    }

    .details-table td {
      color: #0f172a;
      font-weight: 500;
    }

    .description-text {
      font-size: 13px;
      line-height: 1.6;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 36px;
      padding-top: 20px;
      border-top: 2px solid #cbd5e1;
      text-align: center;
    }

    .signature-box {
      font-size: 12px;
    }

    .signature-title {
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
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #94a3b8;
    }

    @media print {
      body {
        padding: 0;
      }
      .voucher-wrapper {
        border: 2px solid #000000;
      }
    }
  </style>
</head>
<body>
  <div class="voucher-wrapper">
    <!-- Header -->
    <div class="voucher-header">
      <div>
        <div class="org-title">${safeOrgName}</div>
        ${safeResortName ? `<div class="org-subtitle">${safeResortName}</div>` : ""}
        <div class="org-subtitle">${isAr ? "الإدارة المالية والحسابات العامة" : "Finance & Accounts Department"}</div>
      </div>
      <div class="voucher-badge-box">
        <div class="voucher-badge">${isAr ? "سند صرف نقدية / بنك" : "PAYMENT VOUCHER"}</div>
        <div class="voucher-number">${isAr ? "رقم السند: " : "VOUCHER #: "}#${safeVoucherNo}</div>
      </div>
    </div>

    <!-- Meta Information -->
    <div class="meta-grid">
      <div>
        <div class="meta-item-label">${isAr ? "تاريخ التحرير والصرف:" : "Disbursement Date:"}</div>
        <div class="meta-item-value">${safeDate}</div>
      </div>
      <div>
        <div class="meta-item-label">${isAr ? "حساب الدفع / الخزينة:" : "Paid From Account:"}</div>
        <div class="meta-item-value">${safeAccount}</div>
      </div>
    </div>

    <!-- Amount Banner -->
    <div class="amount-banner">
      <div>
        <div class="amount-num-label">${isAr ? "المبلغ المستحق للصرف" : "Amount Paid"}</div>
        <div class="amount-num-value">${fmtAmount} <span style="font-size: 14px; font-weight: bold;">${safeCurrencyLabel}</span></div>
      </div>
      <div class="amount-words-box">
        <div class="amount-words-label">${isAr ? "المبلغ بالحروف (تفقيط):" : "Amount in words:"}</div>
        <div class="amount-words-value">${tafqeetText}</div>
      </div>
    </div>

    <!-- Details Table -->
    <table class="details-table">
      <tr>
        <th>${isAr ? "فئة المصروف" : "Expense Category"}</th>
        <td><strong>${safeCategory}</strong></td>
      </tr>
      <tr>
        <th>${isAr ? "البيان / تفاصيل الصرف" : "Purpose of Expense"}</th>
        <td>
          <div class="description-text">${safeDescription}</div>
        </td>
      </tr>
      ${
        journalEntryId
          ? `<tr>
        <th>${isAr ? "حالة القيد المحاسبي" : "General Ledger Posting"}</th>
        <td style="color: #059669; font-weight: 700;">${isAr ? "✓ تم ترحيل القيد المزدوج تلقائياً لدفتر اليومية العامة" : "✓ Double-entry ledger automatically posted"}</td>
      </tr>`
          : ""
      }
    </table>

    <!-- Signatures -->
    <div class="signatures-grid">
      <div class="signature-box">
        <div class="signature-title">${isAr ? "إعداد المحاسب" : "Accountant"}</div>
        <div class="signature-line"></div>
      </div>
      <div class="signature-box">
        <div class="signature-title">${isAr ? "الاعتماد المالي / الإدارة" : "Financial Approval"}</div>
        <div class="signature-line"></div>
      </div>
      <div class="signature-box">
        <div class="signature-title">${isAr ? "توقيع واستلام المستفيد" : "Recipient Signature"}</div>
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
