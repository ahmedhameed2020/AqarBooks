import { escapeHtml } from "@/lib/reports/html-escape";

export interface CommissionRowData {
  id: string;
  brokerName: string;
  propertyName?: string;
  earnedDate: string;
  paidDate?: string | null;
  grossAmount: number;
  whtAmount: number;
  whtRate?: number | null;
  netAmount: number;
  status: "ACCRUED" | "PAID" | string;
  note?: string | null;
}

export interface CommissionsReportPdfData {
  organizationName: string;
  currencyCode: string;
  currencyLabel: string;
  commissions: CommissionRowData[];
  filterStatus?: string;
}

export function generateCommissionsReportPdf(
  data: CommissionsReportPdfData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const { organizationName, currencyCode, currencyLabel, commissions, filterStatus } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeCurrencyLabel = escapeHtml(currencyLabel);

  const totalGross = commissions.reduce((s, c) => s + c.grossAmount, 0);
  const totalWht = commissions.reduce((s, c) => s + c.whtAmount, 0);
  const totalNet = commissions.reduce((s, c) => s + c.netAmount, 0);

  const totalAccrued = commissions
    .filter((c) => c.status === "ACCRUED")
    .reduce((s, c) => s + c.netAmount, 0);
  const totalPaid = commissions
    .filter((c) => c.status === "PAID")
    .reduce((s, c) => s + c.netAmount, 0);

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const rowsHtml = commissions
    .map((c, idx) => {
      const isPaid = c.status === "PAID";
      const statusBadge = isPaid
        ? `<span style="background: #dcfce7; color: #166534; font-weight: bold; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${isAr ? "مسددة" : "Paid"}</span>`
        : `<span style="background: #fef3c7; color: #92400e; font-weight: bold; padding: 2px 8px; border-radius: 10px; font-size: 10px;">${isAr ? "مستحقة" : "Accrued"}</span>`;

      return `<tr class="${idx % 2 === 1 ? "alt-row" : ""}">
        <td><strong>${escapeHtml(c.brokerName)}</strong></td>
        <td style="font-family: monospace; font-size: 11px;">${escapeHtml(c.earnedDate)}</td>
        <td>${escapeHtml(c.propertyName || "—")}</td>
        <td style="text-align: right; font-family: monospace;">${fmt(c.grossAmount)}</td>
        <td style="text-align: right; font-family: monospace; color: #b91c1c;">${c.whtAmount > 0 ? fmt(c.whtAmount) : "—"}</td>
        <td style="text-align: right; font-family: monospace; font-weight: bold; color: #047857;">${fmt(c.netAmount)}</td>
        <td style="text-align: center;">${statusBadge}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? "تقرير كشف عمولات الوسطاء" : "Broker Commissions Statement"}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');

    @page {
      size: A4 landscape;
      margin: 10mm 12mm;
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
      line-height: 1.4;
      padding: 10px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }

    .org-name {
      font-size: 20px;
      font-weight: 800;
    }

    .report-badge {
      display: inline-block;
      background: #0f172a;
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 800;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }

    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
    }

    .card-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }

    .card-value {
      font-size: 16px;
      font-weight: 900;
      font-family: monospace;
      margin-top: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 16px;
    }

    thead {
      display: table-header-group;
    }

    th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 10px;
      font-weight: 700;
      border: 1px solid #0f172a;
      text-align: ${isAr ? "right" : "left"};
    }

    td {
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      text-align: ${isAr ? "right" : "left"};
    }

    .alt-row {
      background: #f8fafc;
    }

    tfoot td {
      background: #e2e8f0;
      font-weight: 800;
      font-size: 11px;
      padding: 8px 10px;
      border-top: 2px solid #0f172a;
    }

    .report-footer {
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="org-name">${safeOrgName}</div>
      <div style="font-size: 11px; color: #64748b;">${isAr ? "الإدارة المالية — تقرير كشف حساب واستحقاق عمولات الوسطاء" : "Finance Dept — Broker Commissions Statement"}</div>
    </div>
    <div style="text-align: ${isAr ? "left" : "right"};">
      <div class="report-badge">${isAr ? "كشف عمولات الوسطاء" : "BROKER COMMISSIONS"}</div>
      <div style="font-size: 10px; color: #64748b; margin-top: 3px;">
        ${filterStatus ? `${isAr ? "الحالة: " : "Status: "}${filterStatus}` : (isAr ? "جميع الحركات والوسطاء" : "All Records")}
      </div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="card-label">${isAr ? "مستحق للوسطاء (معلق)" : "Owed to Brokers (Accrued)"}</div>
      <div class="card-value" style="color: #d97706;">${fmt(totalAccrued)} ${safeCurrencyLabel}</div>
    </div>
    <div class="summary-card">
      <div class="card-label">${isAr ? "عمولات مسددة" : "Settled / Paid"}</div>
      <div class="card-value" style="color: #059669;">${fmt(totalPaid)} ${safeCurrencyLabel}</div>
    </div>
    <div class="summary-card">
      <div class="card-label">${isAr ? "ضريبة منبع محتجزة" : "Withheld Tax (WHT)"}</div>
      <div class="card-value" style="color: #dc2626;">${fmt(totalWht)} ${safeCurrencyLabel}</div>
    </div>
    <div class="summary-card">
      <div class="card-label">${isAr ? "إجمالي العمولات المسجلة" : "Gross Recorded"}</div>
      <div class="card-value" style="color: #1e3a8a;">${fmt(totalGross)} ${safeCurrencyLabel}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${isAr ? "اسم الوسيط" : "Broker"}</th>
        <th style="width: 85px;">${isAr ? "تاريخ الاستحقاق" : "Earned Date"}</th>
        <th>${isAr ? "المشروع / العقار" : "Property / Deal"}</th>
        <th style="width: 105px; text-align: right;">${isAr ? "الإجمالي" : "Gross"}</th>
        <th style="width: 95px; text-align: right;">${isAr ? "خصم المنبع" : "Withheld"}</th>
        <th style="width: 105px; text-align: right;">${isAr ? "الصافي" : "Net"}</th>
        <th style="width: 80px; text-align: center;">${isAr ? "الحالة" : "Status"}</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">${isAr ? "لا توجد عمولات مسجلة" : "No commission records found"}</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">${isAr ? `الإجمالي الكلي (${commissions.length} حركة):` : `Total (${commissions.length} records):`}</td>
        <td style="text-align: right;">${fmt(totalGross)}</td>
        <td style="text-align: right; color: #dc2626;">${fmt(totalWht)}</td>
        <td style="text-align: right; color: #059669;">${fmt(totalNet)} ${safeCurrencyLabel}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="report-footer">
    <div>${isAr ? "نظام AqarBooks المالي لإدارة الكيانات والأصول العقارية" : "AqarBooks Financial Management Suite"}</div>
    <div>${isAr ? "طبعت بتاريخ: " : "Printed: "}${printTime}</div>
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
