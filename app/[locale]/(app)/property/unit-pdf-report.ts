import type { UnitRow } from "./units-table";
import { unitTypeLabel } from "./units-table";
import { escapeHtml } from "@/lib/reports/html-escape";

interface PdfReportData {
  organizationName: string;
  resortName: string;
  currency: string;
  isAr: boolean;
  totalUnits: number;
  occupancyRate: number;
  totalArrears: number;
  collectedThisMonth: number;
  units: UnitRow[];
}

export function generateUnitsPdfReport(data: PdfReportData) {
  const {
    organizationName,
    resortName,
    currency,
    isAr,
    totalUnits,
    occupancyRate,
    totalArrears,
    collectedThisMonth,
    units,
  } = data;

  const dateLabel = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Escape every user-supplied string field before interpolation below --
  // organizationName/resortName/currency (org config) and, per-unit, code/
  // building/zone names/type label/owner name (all DB free-text or
  // staff-editable values). Numbers (via fmt) and hardcoded ar/en literal
  // strings never need escaping.
  const safeOrganizationName = escapeHtml(organizationName);
  const safeResortName = escapeHtml(resortName);
  const safeCurrency = escapeHtml(currency);

  const html = `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8">
  <title>${isAr ? `تقرير وحدات ${resortName}` : `Units Report - ${resortName}`}</title>
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
      grid-template-columns: repeat(4, 1fr);
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
    .kpi-value.danger {
      color: #e11d48;
    }
    .kpi-value.success {
      color: #10b981;
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

    .badge-occupied {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      background: #dcfce7;
      color: #15803d;
      font-size: 10px;
      font-weight: 600;
    }
    .badge-vacant {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      background: #f1f5f9;
      color: #64748b;
      font-size: 10px;
      font-weight: 600;
    }

    .balance-arrears {
      color: #e11d48;
      font-weight: 700;
    }
    .balance-zero {
      color: #64748b;
    }
    .balance-credit {
      color: #10b981;
      font-weight: 600;
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
        <div class="resort-title">${isAr ? `دليل وحدات ${safeResortName}` : `Units Directory - ${safeResortName}`}</div>
      </div>
    </div>
    <div class="meta-info">
      <div>${isAr ? "تاريخ التقرير:" : "Report Date:"} <strong>${dateLabel}</strong></div>
      <div>${isAr ? "إجمالي الوحدات في التقرير:" : "Reported Units:"} <strong>${units.length}</strong></div>
      <div>${isAr ? "عقار بوكس — النظام المحاسبي والعقاري" : "AqarBooks Financial & Real Estate System"}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "إجمالي الوحدات" : "Total Units"}</div>
      <div class="kpi-value">${totalUnits}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? "نسبة الإشغال" : "Occupancy Rate"}</div>
      <div class="kpi-value">${occupancyRate}%</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? `إجمالي المتأخرات (${safeCurrency})` : `Total Arrears (${safeCurrency})`}</div>
      <div class="kpi-value ${totalArrears > 0 ? "danger" : ""}">${totalArrears > 0 ? fmt(totalArrears) : (isAr ? "لا يوجد" : "None")}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">${isAr ? `تحصيلات الشهر (${safeCurrency})` : `Monthly Collections (${safeCurrency})`}</div>
      <div class="kpi-value success">${fmt(collectedThisMonth)}</div>
    </div>
  </div>

  <table class="report-table">
    <thead>
      <tr>
        <th>#</th>
        <th>${isAr ? "رقم/رمز الوحدة" : "Unit Code"}</th>
        <th>${isAr ? "المبنى" : "Building"}</th>
        <th>${isAr ? "المنطقة" : "Zone"}</th>
        <th>${isAr ? "المساحة" : "Area"}</th>
        <th>${isAr ? "النوع" : "Type"}</th>
        <th>${isAr ? "حالة الإشغال" : "Occupancy"}</th>
        <th>${isAr ? "المالك الحالي" : "Current Owner"}</th>
        <th>${isAr ? `الرصيد المالي (${safeCurrency})` : `Balance (${safeCurrency})`}</th>
      </tr>
    </thead>
    <tbody>
      ${units
        .map((u, i) => {
          const buildingName = (isAr ? u.building_name_ar : u.building_name_en) ?? "—";
          const zoneName = (isAr ? u.zone_name_ar : u.zone_name_en) ?? "—";
          const ownerName = u.owner_name ?? "—";
          return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(u.code)}</strong></td>
          <td>${escapeHtml(buildingName)}</td>
          <td>${escapeHtml(zoneName)}</td>
          <td>${u.area ? `${u.area} ${isAr ? "م²" : "m²"}` : "—"}</td>
          <td>${escapeHtml(unitTypeLabel(u, isAr))}</td>
          <td>
            <span class="${u.occupancy_status === "OCCUPIED" ? "badge-occupied" : "badge-vacant"}">
              ${u.occupancy_status === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant")}
            </span>
          </td>
          <td>${escapeHtml(ownerName)}</td>
          <td class="${u.balance > 0 ? "balance-arrears" : u.balance < 0 ? "balance-credit" : "balance-zero"}">
            ${u.balance > 0 ? `+${fmt(u.balance)}` : u.balance < 0 ? fmt(u.balance) : fmt(0)}
          </td>
        </tr>
      `;
        })
        .join("")}
    </tbody>
  </table>

  <div class="report-footer">
    <div>${isAr ? `عقار بوكس لإدارة الكيانات والأصول العقارية &copy; ${new Date().getFullYear()} AqarBooks` : `AqarBooks &copy; ${new Date().getFullYear()} Real Estate & Asset Management`}</div>
    <div>${isAr ? `تقرير رسمي مطبوع · تم التصدير بواسطة النظام` : `Official Print Report · Exported Systematically`}</div>
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
}
