import { escapeHtml } from "@/lib/reports/html-escape";
import { tafqeetArabic } from "@/lib/tafqeet";

export interface ChequeVoucherData {
  organizationName: string;
  resortName?: string;
  chequeNumber: string;
  bankName: string;
  accountName?: string;
  issuerName?: string;
  amount: number;
  chequeDate: string;
  dueDate: string;
  status: string;
  direction?: "INCOMING" | "OUTGOING" | string;
  currencyCode: string;
  currencyLabel: string;
  note?: string | null;
}

export function generateChequeVoucherPdf(
  data: ChequeVoucherData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    chequeNumber,
    bankName,
    accountName,
    issuerName,
    amount,
    chequeDate,
    dueDate,
    status,
    currencyCode,
    currencyLabel,
    note,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResort = resortName ? escapeHtml(resortName) : "";
  const safeChequeNo = escapeHtml(chequeNumber);
  const safeBankName = escapeHtml(bankName || "—");
  const safeAccountName = accountName ? escapeHtml(accountName) : "";
  const safeIssuer = escapeHtml(issuerName || (isAr ? "العميل / الساحب" : "Client"));
  const safeCurrency = escapeHtml(currencyLabel);

  const tafqeetText = tafqeetArabic(amount, currencyCode);

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const statusLabel =
    status === "RECEIVED"
      ? isAr ? "مستلم / برسم التحصيل" : "Received"
      : status === "DEPOSITED"
      ? isAr ? "أودع بالبنك للتحصيل" : "Deposited"
      : status === "CLEARED"
      ? isAr ? "تم التحصيل والإضافة" : "Cleared"
      : status === "RETURNED"
      ? isAr ? "مرتد / مرفوض" : "Returned"
      : isAr ? "ملغي" : "Cancelled";

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `إشعار_استلام_شيك_${safeChequeNo}` : `Cheque_Voucher_${safeChequeNo}`}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');

    @page {
      size: A4 portrait;
      margin: 15mm 20mm;
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
      max-width: 180mm;
      margin: 0 auto;
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 24px;
      position: relative;
    }

    .header-table {
      width: 100%;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }

    .org-title {
      font-size: 20px;
      font-weight: 800;
    }

    .voucher-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 6px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 800;
    }

    .amount-box {
      background: #f8fafc;
      border: 2px solid #0f172a;
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .amount-val {
      font-size: 24px;
      font-weight: 800;
      font-family: monospace;
      color: #1e3a8a;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }

    .info-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
    }

    .info-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }

    .info-value {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    .tafqeet-box {
      background: #f1f5f9;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      margin-bottom: 20px;
    }

    .cheque-visual {
      border: 1px dashed #94a3b8;
      border-radius: 6px;
      padding: 14px;
      background: #ffffff;
      margin-bottom: 24px;
      font-size: 12px;
    }

    .signatures-table {
      width: 100%;
      margin-top: 30px;
      padding-top: 14px;
      border-top: 1px dashed #cbd5e1;
    }

    .sig-col {
      width: 33.33%;
      text-align: center;
      vertical-align: top;
    }

    .sig-title {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 45px;
    }

    .sig-line {
      border-bottom: 1px solid #0f172a;
      width: 70%;
      margin: 0 auto;
    }

    .footer {
      margin-top: 20px;
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
          <div style="font-size: 11px; color: #64748b;">${safeResort || (isAr ? "إدارة الخزينة والرقابة المالية" : "Treasury & Banking Desk")}</div>
        </td>
        <td style="text-align: ${isAr ? "left" : "right"}; vertical-align: top;">
          <div class="voucher-badge">${isAr ? "إشعار استلام شيك وارد" : "CHEQUE RECEIPT VOUCHER"}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 600;">
            ${isAr ? "رقم الشيك: " : "Cheque #: "}<span style="font-family: monospace; font-weight: bold; color: #0f172a;">${safeChequeNo}</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="amount-box">
      <div>
        <div style="font-size: 11px; color: #64748b; font-weight: 700;">${isAr ? "قيمة الشيك الإجمالية" : "Cheque Amount"}</div>
        <div class="amount-val">${fmt(amount)} ${safeCurrency}</div>
      </div>
      <div style="text-align: ${isAr ? "left" : "right"};">
        <div style="font-size: 11px; color: #64748b; font-weight: 700;">${isAr ? "حالة الشيك الحالية" : "Status"}</div>
        <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${statusLabel}</div>
      </div>
    </div>

    <div class="tafqeet-box">
      <strong>${isAr ? "المبلغ بالحروف: " : "Amount in words: "}</strong> ${tafqeetText}
    </div>

    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">${isAr ? "الساحب / المحرر منه:" : "Issuer / Member:"}</div>
        <div class="info-value">${safeIssuer}</div>
      </div>

      <div class="info-item">
        <div class="info-label">${isAr ? "البنك المسحوب عليه:" : "Drawee Bank:"}</div>
        <div class="info-value">${safeBankName} ${safeAccountName ? `(${safeAccountName})` : ""}</div>
      </div>

      <div class="info-item">
        <div class="info-label">${isAr ? "تاريخ تحرير الشيك:" : "Cheque Date:"}</div>
        <div class="info-value" style="font-family: monospace;">${chequeDate}</div>
      </div>

      <div class="info-item">
        <div class="info-label">${isAr ? "تاريخ الاستحقاق والصرف:" : "Maturity / Due Date:"}</div>
        <div class="info-value" style="font-family: monospace; color: #b91c1c;">${dueDate}</div>
      </div>
    </div>

    ${
      note
        ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 11px; margin-bottom: 18px;">
            <span style="font-weight: 700; color: #64748b;">${isAr ? "ملاحظات وبيان: " : "Notes: "}</span>${escapeHtml(note)}
          </div>`
        : ""
    }

    <!-- Signatures -->
    <table class="signatures-table">
      <tr>
        <td class="sig-col">
          <div class="sig-title">${isAr ? "المستلم / أمين الخزينة" : "Received by"}</div>
          <div class="sig-line"></div>
        </td>
        <td class="sig-col">
          <div class="sig-title">${isAr ? "المراجع المالي" : "Auditor"}</div>
          <div class="sig-line"></div>
        </td>
        <td class="sig-col">
          <div class="sig-title">${isAr ? "اعتماد الإدارة المالية" : "Finance Approval"}</div>
          <div class="sig-line"></div>
        </td>
      </tr>
    </table>

    <div class="footer">
      <div>${isAr ? "نظام AqarBooks المالي — إدارة البنوك وحافظة الشيكات" : "AqarBooks Banking & Treasury System"}</div>
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
