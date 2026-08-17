import { METHOD_LABELS } from "@/lib/portal/row-types";
import { escapeHtml } from "@/lib/reports/html-escape";

// Mirrors app/[locale]/(app)/property/unit-pdf-report.ts's pattern: build an
// HTML string, wrap it in a same-origin Blob URL (never a cross-origin
// frame/src, for security), open it in a new window, and trigger print.
// Adapted for a single member's own payment receipt instead of a units
// directory. Security: this function renders ONLY the fields explicitly
// passed in `data` -- no raw provider webhook payload, no secrets, and no
// internal transaction id beyond the human-facing receipt number the caller
// already resolved.
export interface PaymentReceiptAllocation {
  unitCode: string;
  description: string;
  dueDate: string;
  allocatedAmount: number;
}

interface PaymentReceiptData {
  organizationName: string;
  resortName: string;
  currency: string;
  receiptNo: string;
  paymentDate: string;
  amount: number;
  unallocatedAmount: number;
  memberName: string;
  method: string;
  memo: string | null;
  createdByName: string | null;
  allocations: PaymentReceiptAllocation[];
}

export function generatePaymentReceiptPdf(data: PaymentReceiptData, locale: string): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    currency,
    receiptNo,
    paymentDate,
    amount,
    unallocatedAmount,
    memberName,
    method,
    memo,
    createdByName,
    allocations,
  } = data;

  const dateLabel = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const methodMeta = METHOD_LABELS[method];
  const methodLabel = methodMeta ? (isAr ? methodMeta.ar : methodMeta.en) : method;

  // Escape every user-supplied string field before interpolation below --
  // organizationName/resortName/currency (org config), receiptNo/paymentDate
  // (formatted but still string data), memberName/memo/createdByName (free
  // text), and allocation unitCode/description/dueDate. Numbers (via fmt)
  // and the hardcoded ar/en literal strings never need escaping.
  const safeOrganizationName = escapeHtml(organizationName);
  const safeResortName = escapeHtml(resortName);
  const safeCurrency = escapeHtml(currency);
  const safeReceiptNo = escapeHtml(receiptNo);
  const safePaymentDate = escapeHtml(paymentDate);
  const safeMemberName = escapeHtml(memberName);
  const safeMethodLabel = escapeHtml(methodLabel);
  const safeMemo = memo ? escapeHtml(memo) : null;
  const safeCreatedByName = createdByName ? escapeHtml(createdByName) : null;
  const safeAllocations = allocations.map((a) => ({
    ...a,
    unitCode: escapeHtml(a.unitCode),
    description: escapeHtml(a.description),
    dueDate: escapeHtml(a.dueDate),
  }));

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `إيصال دفع ${safeReceiptNo}` : `Payment Receipt ${safeReceiptNo}`}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
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
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      body {
        padding: 0;
      }
      thead {
        display: table-header-group;
      }
      tr {
        page-break-inside: avoid;
      }
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 16px;
      margin-bottom: 20px;
    }
    .org-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: #2563eb;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: bold;
    }
    .org-name {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
    }
    .resort-title {
      font-size: 13px;
      color: #64748b;
    }
    .meta-info {
      text-align: ${isAr ? "left" : "right"};
      font-size: 11px;
      color: #64748b;
    }
    .meta-info strong {
      color: #0f172a;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-box {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 14px;
      background: #f8fafc;
    }
    .kpi-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 500;
    }
    .kpi-value {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .kpi-value.success {
      color: #10b981;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px;
      margin-bottom: 20px;
      font-size: 12px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #e2e8f0;
      padding-bottom: 6px;
    }
    .info-row .label {
      color: #64748b;
    }
    .info-row .value {
      color: #0f172a;
      font-weight: 600;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    .report-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 600;
      text-align: ${isAr ? "right" : "left"};
      padding: 8px 10px;
      border-bottom: 1px solid #cbd5e1;
    }
    .report-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
    }
    .report-table tr:nth-child(even) td {
      background: #fafafa;
    }
    .report-table tfoot td {
      font-weight: 700;
      color: #0f172a;
      border-top: 1px solid #cbd5e1;
      border-bottom: none;
    }

    .no-allocations {
      padding: 12px;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      border: 1px dashed #e2e8f0;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .report-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <div class="report-header">
    <div class="org-brand">
      <div class="logo-badge">${escapeHtml(organizationName.slice(0, 1).toUpperCase())}</div>
      <div>
        <div class="org-name">${safeOrganizationName}</div>
        <div class="resort-title">${safeResortName ? (isAr ? `${safeResortName} · إيصال دفع` : `${safeResortName} · Payment Receipt`) : isAr ? "إيصال دفع" : "Payment Receipt"}</div>
      </div>
    </div>
    <div class="meta-info">
      <div>${isAr ? "تاريخ الطباعة:" : "Printed:"} <strong>${dateLabel}</strong></div>
      <div>${isAr ? "رقم الإيصال:" : "Receipt No:"} <strong>${safeReceiptNo || "—"}</strong></div>
      <div>${isAr ? "عقار بوكس — بوابة الملاك والمقبوضات" : "AqarBooks Owner Portal"}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? `المبلغ المدفوع (${safeCurrency})` : `Amount Paid (${safeCurrency})`}</div>
      <div class="kpi-value success">${fmt(amount)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "طريقة الدفع" : "Payment Method"}</div>
      <div class="kpi-value">${safeMethodLabel}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? `مبلغ غير مخصص (${safeCurrency})` : `Unallocated (${safeCurrency})`}</div>
      <div class="kpi-value">${fmt(unallocatedAmount)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-row">
      <span class="label">${isAr ? "اسم المالك" : "Owner Name"}</span>
      <span class="value">${safeMemberName || "—"}</span>
    </div>
    <div class="info-row">
      <span class="label">${isAr ? "تاريخ الدفع" : "Payment Date"}</span>
      <span class="value">${safePaymentDate || "—"}</span>
    </div>
    <div class="info-row">
      <span class="label">${isAr ? "ملاحظات" : "Memo"}</span>
      <span class="value">${safeMemo || "—"}</span>
    </div>
    ${
      safeCreatedByName
        ? `<div class="info-row">
      <span class="label">${isAr ? "تم الإصدار بواسطة" : "Issued By"}</span>
      <span class="value">${safeCreatedByName}</span>
    </div>`
        : ""
    }
  </div>

  ${
    safeAllocations.length === 0
      ? `<div class="no-allocations">${isAr ? "لا توجد تخصيصات لهذا الدفع." : "No allocations for this payment."}</div>`
      : `<table class="report-table">
    <thead>
      <tr>
        <th>#</th>
        <th>${isAr ? "رقم/رمز الوحدة" : "Unit Code"}</th>
        <th>${isAr ? "الوصف" : "Description"}</th>
        <th>${isAr ? "تاريخ الاستحقاق" : "Due Date"}</th>
        <th>${isAr ? `المبلغ المخصص (${safeCurrency})` : `Allocated (${safeCurrency})`}</th>
      </tr>
    </thead>
    <tbody>
      ${safeAllocations
        .map(
          (a, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${a.unitCode || "—"}</strong></td>
          <td>${a.description || "—"}</td>
          <td>${a.dueDate || "—"}</td>
          <td>${fmt(a.allocatedAmount)}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4">${isAr ? "الإجمالي المخصص" : "Total Allocated"}</td>
        <td>${fmt(allocations.reduce((sum, a) => sum + a.allocatedAmount, 0))}</td>
      </tr>
    </tfoot>
  </table>`
  }

  <div class="report-footer">
    <div>${isAr ? `عقار بوكس لإدارة الكيانات والأصول العقارية &copy; ${new Date().getFullYear()} AqarBooks` : `AqarBooks &copy; ${new Date().getFullYear()} Real Estate & Asset Management`}</div>
    <div>${isAr ? "إيصال رسمي مطبوع · تم التصدير بواسطة النظام" : "Official Print Receipt · Exported Systematically"}</div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  // Create same-origin Blob URL to guarantee 100% security & zero cross-origin frame errors
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    window.location.href = url;
  }
  return win;
}
