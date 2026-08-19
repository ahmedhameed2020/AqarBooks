import { escapeHtml } from "@/lib/reports/html-escape";

export interface CashTransactionItem {
  id: string;
  type: "RECEIPT" | "PAYMENT" | string;
  amount: number;
  description?: string | null;
  createdAt: string;
}

export interface CashierSessionZReportData {
  organizationName: string;
  resortName?: string;
  cashboxName: string;
  glAccountCode?: string;
  sessionId: string;
  cashierName?: string;
  openedAt: string;
  closedAt?: string | null;
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  expectedClosingBalance: number;
  actualClosingBalance: number;
  variance: number;
  status: string;
  currencyCode: string;
  currencyLabel: string;
  transactions?: CashTransactionItem[];
}

export function generateCashierSessionZReportPdf(
  data: CashierSessionZReportData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    cashboxName,
    glAccountCode,
    sessionId,
    cashierName,
    openedAt,
    closedAt,
    openingBalance,
    totalReceipts,
    totalPayments,
    expectedClosingBalance,
    actualClosingBalance,
    variance,
    status,
    currencyCode,
    currencyLabel,
    transactions = [],
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResort = resortName ? escapeHtml(resortName) : "";
  const safeCashbox = escapeHtml(cashboxName || "—");
  const safeCashier = escapeHtml(cashierName || "—");
  const safeCurrencyLabel = escapeHtml(currencyLabel);

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const isBalanced = Math.abs(variance) < 0.01;
  const isSurplus = variance > 0.01;
  const isShortage = variance < -0.01;

  const varianceColor = isBalanced ? "#16a34a" : isSurplus ? "#2563eb" : "#dc2626";
  const varianceStatusText = isBalanced
    ? isAr ? "✓ مطابقة تامة (لا يوجد عجز أو زيادة)" : "✓ Balanced (Zero Variance)"
    : isSurplus
    ? `${isAr ? "فائض نقدي بالخزينة: +" : "Cash Surplus: +"}${fmt(variance)} ${safeCurrencyLabel}`
    : `${isAr ? "عجز نقدي بالخزينة: " : "Cash Shortage: "}${fmt(variance)} ${safeCurrencyLabel}`;

  const txRows = transactions.length
    ? transactions
        .map((tx, idx) => {
          const isReceipt = tx.type === "RECEIPT";
          return `<tr class="${idx % 2 === 1 ? "alt-row" : ""}">
            <td style="font-family: monospace; font-size: 10px;">${new Date(tx.createdAt).toLocaleTimeString(isAr ? "ar-EG" : "en-US")}</td>
            <td>
              <span style="font-weight: bold; color: ${isReceipt ? "#166534" : "#991b1b"};">
                ${isReceipt ? (isAr ? "قبض / تحصيل" : "Receipt") : (isAr ? "صرف نقدية" : "Disbursement")}
              </span>
            </td>
            <td>${escapeHtml(tx.description || "—")}</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: ${isReceipt ? "#166534" : "#991b1b"};">
              ${isReceipt ? "+" : "-"}${fmt(tx.amount)} ${safeCurrencyLabel}
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 12px;">${isAr ? "لا توجد حركات نقدية مسجلة في هذه الجلسة" : "No cash transactions recorded in this session"}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `تقرير_إقفال_الخزينة_${safeCashbox}` : `Cashier_ZReport_${safeCashbox}`}</title>
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

    .report-wrapper {
      max-width: 190mm;
      margin: 0 auto;
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 24px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }

    .org-title {
      font-size: 20px;
      font-weight: 800;
    }

    .badge-box {
      text-align: ${isAr ? "left" : "right"};
    }

    .z-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 4px 14px;
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
      margin-bottom: 16px;
      font-size: 11px;
    }

    .meta-label {
      color: #64748b;
      font-size: 10px;
      margin-bottom: 2px;
    }

    .meta-value {
      font-weight: 700;
      color: #0f172a;
    }

    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .summary-table th, .summary-table td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: ${isAr ? "right" : "left"};
    }

    .summary-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      width: 50%;
    }

    .summary-table td {
      font-family: monospace;
      font-weight: bold;
      font-size: 13px;
    }

    .variance-banner {
      background: #f8fafc;
      border: 2px solid ${varianceColor};
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 18px;
      text-align: center;
      font-weight: 800;
      font-size: 14px;
      color: ${varianceColor};
    }

    .tx-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 20px;
    }

    .tx-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 6px 10px;
      font-weight: 700;
      text-align: ${isAr ? "right" : "left"};
    }

    .tx-table td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
    }

    .alt-row {
      background: #f8fafc;
    }

    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 2px solid #cbd5e1;
      text-align: center;
    }

    .sig-title {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 40px;
    }

    .sig-line {
      border-bottom: 1px dashed #64748b;
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
  <div class="report-wrapper">
    <div class="report-header">
      <div>
        <div class="org-title">${safeOrgName}</div>
        <div style="font-size: 11px; color: #64748b;">${isAr ? "تقرير إقفال وردية الخزينة والتسوية النقدية (Z-Report)" : "Cashier Session Closure & Z-Report"}</div>
      </div>
      <div class="badge-box">
        <div class="z-badge">${isAr ? "تقرير تسوية الوردية (Z-Report)" : "Z-REPORT"}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
          ${isAr ? "الحالة: " : "Status: "}${status === "OPEN" ? (isAr ? "جلسة مفتوحة" : "Open") : (isAr ? "جلسة مقفلة" : "Closed")}
        </div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="meta-label">${isAr ? "اسم الصندوق / الخزينة:" : "Cashbox:"}</div>
        <div class="meta-value">${safeCashbox} ${glAccountCode ? `(${glAccountCode})` : ""}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "توقيت فتح الوردية:" : "Opened At:"}</div>
        <div class="meta-value">${new Date(openedAt).toLocaleString(isAr ? "ar-EG" : "en-US")}</div>
      </div>
      <div>
        <div class="meta-label">${isAr ? "توقيت إقفال الوردية:" : "Closed At:"}</div>
        <div class="meta-value">${closedAt ? new Date(closedAt).toLocaleString(isAr ? "ar-EG" : "en-US") : (isAr ? "قيد التشغيل" : "Active")}</div>
      </div>
    </div>

    <!-- Financial Reconciliation Table -->
    <table class="summary-table">
      <tr>
        <th>${isAr ? "الرصيد الافتتاحي للوردية" : "Opening Balance"}</th>
        <td style="color: #334155;">${fmt(openingBalance)} ${safeCurrencyLabel}</td>
      </tr>
      <tr>
        <th>${isAr ? "إجمالي المقبوضات والتحصيلات النقدية (+)" : "Total Cash Receipts (+)"}</th>
        <td style="color: #16a34a;">+ ${fmt(totalReceipts)} ${safeCurrencyLabel}</td>
      </tr>
      <tr>
        <th>${isAr ? "إجمالي المدفوعات والمصروفات النقدية (-)" : "Total Cash Payments (-)"}</th>
        <td style="color: #dc2626;">- ${fmt(totalPayments)} ${safeCurrencyLabel}</td>
      </tr>
      <tr style="background: #f8fafc;">
        <th>${isAr ? "الرصيد الدفتري المتوقع بالخزينة (Expected)" : "Expected Closing Balance"}</th>
        <td style="font-size: 14px; color: #0f172a;">${fmt(expectedClosingBalance)} ${safeCurrencyLabel}</td>
      </tr>
      <tr style="background: #f1f5f9;">
        <th>${isAr ? "الرصيد الفعلي المعدود عند الجرد (Actual Count)" : "Actual Cash Counted"}</th>
        <td style="font-size: 14px; color: #1e3a8a;">${fmt(actualClosingBalance)} ${safeCurrencyLabel}</td>
      </tr>
    </table>

    <div class="variance-banner">
      ${varianceStatusText}
    </div>

    <!-- Cash Transactions Breakdown -->
    <div style="font-weight: 700; font-size: 12px; margin-bottom: 6px;">
      ${isAr ? `كشف حركات النقدية خلال الوردية (${transactions.length} حركة):` : `Cash Transactions Log (${transactions.length}):`}
    </div>
    <table class="tx-table">
      <thead>
        <tr>
          <th style="width: 75px;">${isAr ? "الوقت" : "Time"}</th>
          <th style="width: 100px;">${isAr ? "نوع الحركة" : "Type"}</th>
          <th>${isAr ? "البيان / تفاصيل التحصيل" : "Description"}</th>
          <th style="width: 110px; text-align: right;">${isAr ? "المبلغ" : "Amount"}</th>
        </tr>
      </thead>
      <tbody>
        ${txRows}
      </tbody>
    </table>

    <!-- Signatures Section -->
    <div class="signatures-grid">
      <div>
        <div class="sig-title">${isAr ? "أمين الخزينة / الكاشير" : "Cashier / Teller"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "المراجع والمطابقة" : "Auditor / Supervisor"}</div>
        <div class="sig-line"></div>
      </div>
      <div>
        <div class="sig-title">${isAr ? "اعتماد الإدارة المالية" : "Finance Approval"}</div>
        <div class="sig-line"></div>
      </div>
    </div>

    <div class="footer">
      <div>${isAr ? "نظام AqarBooks المالي — إدارة الخزينة ونقاط التحصيل" : "AqarBooks Treasury & POS System"}</div>
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
