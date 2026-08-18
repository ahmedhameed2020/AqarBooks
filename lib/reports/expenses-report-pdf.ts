import { escapeHtml } from "@/lib/reports/html-escape";
import type { ExpenseRow } from "@/app/[locale]/(app)/finance/expenses/expenses-client";

export interface ExpensesReportPdfData {
  organizationName: string;
  resortName?: string;
  currencyCode: string;
  currencyLabel: string;
  expenses: ExpenseRow[];
  categoryMap: Map<string, string>;
  accountMap: Map<string, string>;
  filterCategoryName?: string;
}

export function generateExpensesReportPdf(
  data: ExpensesReportPdfData,
  locale: string
): Window | null {
  const isAr = locale === "ar";
  const {
    organizationName,
    resortName,
    currencyCode,
    currencyLabel,
    expenses,
    categoryMap,
    accountMap,
    filterCategoryName,
  } = data;

  const safeOrgName = escapeHtml(organizationName || "AqarBooks");
  const safeResortName = resortName ? escapeHtml(resortName) : "";
  const safeCurrencyLabel = escapeHtml(currencyLabel);

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const count = expenses.length;
  const avgAmount = count > 0 ? totalAmount / count : 0;

  const fmtAmount = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const rowsHtml = expenses
    .map((e, idx) => {
      const voucherNo = e.voucher_number ? `#${e.voucher_number}` : "—";
      const catName = categoryMap.get(e.expense_category_id) || "—";
      const accName = e.payment_account_id
        ? accountMap.get(e.payment_account_id) || "—"
        : "—";

      return `<tr class="${idx % 2 === 1 ? "alt-row" : ""}">
        <td class="num-cell" style="font-family: monospace; font-weight: bold;">${escapeHtml(voucherNo)}</td>
        <td style="font-family: monospace; font-size: 11px;">${escapeHtml(e.expense_date)}</td>
        <td><span class="category-pill">${escapeHtml(catName)}</span></td>
        <td class="desc-cell">${escapeHtml(e.description || "—")}</td>
        <td style="font-size: 11px; color: #475569;">${escapeHtml(accName)}</td>
        <td class="amount-cell" style="font-family: monospace; font-weight: bold; color: #b91c1c;">${fmtAmount(e.amount)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? "تقرير كشف المصروفات وسندات الصرف" : "Expenses & Disbursement Vouchers Report"}</title>
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
      line-height: 1.4;
      padding: 10px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }

    .org-name {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
    }

    .report-title-box {
      text-align: ${isAr ? "left" : "right"};
    }

    .report-badge {
      display: inline-block;
      background: #1e3a8a;
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 800;
    }

    .report-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }

    /* Executive KPI Grid */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
    }

    .card-label {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }

    .card-value {
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 2px;
      font-family: monospace;
    }

    .table-container {
      width: 100%;
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    thead {
      display: table-header-group;
    }

    th {
      background: #1e3a8a;
      color: #ffffff;
      padding: 8px 10px;
      font-weight: 700;
      border: 1px solid #1e3a8a;
      text-align: ${isAr ? "right" : "left"};
    }

    td {
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      text-align: ${isAr ? "right" : "left"};
    }

    .alt-row {
      background: #f8fafc;
    }

    .num-cell {
      width: 65px;
      color: #1e3a8a;
    }

    .category-pill {
      display: inline-block;
      padding: 2px 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      color: #334155;
    }

    .desc-cell {
      max-width: 200px;
      word-break: break-word;
    }

    .amount-cell {
      text-align: right;
      width: 95px;
    }

    tfoot td {
      background: #e2e8f0;
      font-weight: 800;
      font-size: 12px;
      padding: 9px 10px;
      border-top: 2px solid #0f172a;
    }

    .signatures-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      page-break-inside: avoid;
    }

    .signature-title {
      font-size: 11px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 40px;
    }

    .signature-line {
      border-bottom: 1px dashed #64748b;
      width: 70%;
      margin: 0 auto;
    }

    .report-footer {
      margin-top: 25px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
      page-break-inside: avoid;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="report-header">
    <div>
      <div class="org-name">${safeOrgName}</div>
      ${safeResortName ? `<div style="font-size: 12px; color: #475569;">${safeResortName}</div>` : ""}
      <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
        ${isAr ? "الإدارة المالية — كشف المصروفات وسندات الصرف" : "Financial Dept — Expenses Statement"}
      </div>
    </div>
    <div class="report-title-box">
      <div class="report-badge">${isAr ? "كشف حساب المصروفات" : "EXPENSES STATEMENT"}</div>
      <div class="report-subtitle">
        ${filterCategoryName ? `${isAr ? "تصفية: " : "Filter: "}${escapeHtml(filterCategoryName)}` : (isAr ? "جميع الفئات والعمليات" : "All Categories")}
      </div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <div class="card-label">${isAr ? "إجمالي المصروفات" : "Total Expenses"}</div>
      <div class="card-value" style="color: #b91c1c;">${fmtAmount(totalAmount)} <span style="font-size: 12px;">${safeCurrencyLabel}</span></div>
    </div>
    <div class="summary-card">
      <div class="card-label">${isAr ? "عدد سندات الصرف" : "Total Vouchers"}</div>
      <div class="card-value" style="color: #1e3a8a;">${count}</div>
    </div>
    <div class="summary-card">
      <div class="card-label">${isAr ? "متوسط قيمة السند" : "Average Voucher"}</div>
      <div class="card-value" style="color: #d97706;">${fmtAmount(avgAmount)} <span style="font-size: 12px;">${safeCurrencyLabel}</span></div>
    </div>
  </div>

  <!-- Table -->
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th style="width: 70px;">${isAr ? "رقم السند" : "Voucher #"}</th>
          <th style="width: 85px;">${isAr ? "التاريخ" : "Date"}</th>
          <th style="width: 110px;">${isAr ? "الفئة" : "Category"}</th>
          <th>${isAr ? "البيان / الوصف" : "Description"}</th>
          <th style="width: 130px;">${isAr ? "حساب الدفع" : "Paid From"}</th>
          <th style="width: 95px; text-align: right;">${isAr ? "المبلغ" : "Amount"}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #94a3b8;">${isAr ? "لا توجد حركات مسجلة" : "No expense records found"}</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align: ${isAr ? "right" : "left"};">
            ${isAr ? `الإجمالي الكلي (${count} سند صرف):` : `Grand Total (${count} vouchers):`}
          </td>
          <td style="text-align: right; color: #b91c1c; font-family: monospace;">
            ${fmtAmount(totalAmount)} ${safeCurrencyLabel}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Signatures -->
  <div class="signatures-section">
    <div>
      <div class="signature-title">${isAr ? "إعداد ومراجعة المحاسب" : "Prepared & Audited By"}</div>
      <div class="signature-line"></div>
    </div>
    <div>
      <div class="signature-title">${isAr ? "الاعتماد المالي / الإدارة" : "Financial Approval"}</div>
      <div class="signature-line"></div>
    </div>
  </div>

  <!-- Footer -->
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
