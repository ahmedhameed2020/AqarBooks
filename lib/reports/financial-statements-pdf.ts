import { escapeHtml } from "@/lib/reports/html-escape";

export interface ReportPdfColumn {
  header: string;
  key: string;
  align?: "start" | "center" | "end";
  isNumber?: boolean;
  width?: string;
}

export interface ReportPdfSummaryItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface FinancialStatementPdfData {
  title: string;
  subtitle?: string;
  organizationName: string;
  taxNumber?: string | null;
  commercialRegistry?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  resortName?: string | null;
  currencyLabel: string;
  dateRangeLabel: string;
  columns: ReportPdfColumn[];
  rows: Record<string, any>[];
  totalRow?: Record<string, any>;
  summaries?: ReportPdfSummaryItem[];
  notes?: string[];
  includeCoverPage?: boolean;
}

export function generateFinancialStatementPdf(
  data: FinancialStatementPdfData,
  locale: string = "ar"
): Window | null {
  const isAr = locale === "ar";
  const {
    title,
    subtitle,
    organizationName,
    taxNumber,
    commercialRegistry,
    tagline,
    logoUrl,
    brandColor = "#1E1B4B",
    resortName,
    currencyLabel,
    dateRangeLabel,
    columns,
    rows,
    totalRow,
    summaries = [],
    notes = [],
    includeCoverPage = true,
  } = data;

  const storedBrandColor = typeof window !== "undefined" ? localStorage.getItem("aqarbooks_brand_color") : null;
  const storedTagline = typeof window !== "undefined" ? localStorage.getItem("aqarbooks_tagline") : null;
  const storedLogo = typeof window !== "undefined" ? localStorage.getItem("aqarbooks_logo_url") : null;

  const safeOrgName = escapeHtml(organizationName || "عقار بوكس");
  const safeTitle = escapeHtml(title);
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : "";
  const safeDateRange = escapeHtml(dateRangeLabel);
  const safeCurrency = escapeHtml(currencyLabel);
  const safeBrandColor = storedBrandColor || brandColor || "#1E1B4B";
  const safeTagline = storedTagline || (tagline ? escapeHtml(tagline) : (isAr ? "للإدارة والخدمات العقارية المتكاملة" : "Property Management & Financial Services"));
  const safeLogoUrl = storedLogo || logoUrl || null;

  const printTime = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  // Formatting strictly in standard Western Arabic digits for maximum financial clarity (e.g. 363,460.00)
  const fmtNum = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // 1. COVER PAGE HTML
  const coverPageHtml = includeCoverPage
    ? `
    <div class="cover-page">
      <div class="cover-accent-bar" style="background: linear-gradient(135deg, ${safeBrandColor}, #3B82F6);"></div>
      
      <div class="cover-header">
        <div class="cover-logo-box">
          ${
            logoUrl
              ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="cover-logo-img" />`
              : `<div class="cover-logo-placeholder" style="background: ${safeBrandColor};">
                  <span>${safeOrgName.slice(0, 2).toUpperCase()}</span>
                </div>`
          }
          <div>
            <h1 class="cover-org-name" style="color: ${safeBrandColor};">${safeOrgName}</h1>
            <p class="cover-org-tagline">${safeTagline}</p>
          </div>
        </div>

        <div class="cover-badge" style="border-color: ${safeBrandColor}; color: ${safeBrandColor};">
          <span>${isAr ? "تقرير مالي رسمي معتمد" : "Official Statutory Report"}</span>
        </div>
      </div>

      <div class="cover-body">
        <div class="cover-divider" style="background: ${safeBrandColor};"></div>
        <h2 class="cover-report-title" style="color: #0F172A;">${safeTitle}</h2>
        ${safeSubtitle ? `<p class="cover-report-subtitle">${safeSubtitle}</p>` : ""}

        <div class="cover-meta-grid">
          <div class="cover-meta-card">
            <span class="cover-meta-label">${isAr ? "الفترة المالية / حتى تاريخ" : "Period / As of Date"}</span>
            <span class="cover-meta-val">${safeDateRange}</span>
          </div>

          <div class="cover-meta-card">
            <span class="cover-meta-label">${isAr ? "عملة التقرير" : "Report Currency"}</span>
            <span class="cover-meta-val font-mono">${safeCurrency}</span>
          </div>

          ${
            taxNumber
              ? `<div class="cover-meta-card">
                  <span class="cover-meta-label">${isAr ? "الرقم الضريبي للمنشأة" : "Tax ID Number"}</span>
                  <span class="cover-meta-val font-mono">${escapeHtml(taxNumber)}</span>
                </div>`
              : ""
          }

          ${
            commercialRegistry
              ? `<div class="cover-meta-card">
                  <span class="cover-meta-label">${isAr ? "رقم السجل التجاري" : "Commercial Registry"}</span>
                  <span class="cover-meta-val font-mono">${escapeHtml(commercialRegistry)}</span>
                </div>`
              : ""
          }

          ${
            resortName
              ? `<div class="cover-meta-card">
                  <span class="cover-meta-label">${isAr ? "الكيان العقاري التابع" : "Property Entity"}</span>
                  <span class="cover-meta-val">${escapeHtml(resortName)}</span>
                </div>`
              : ""
          }
        </div>
      </div>

      <div class="cover-footer">
        <div class="cover-confidential-ribbon" style="background: #F8FAFC; border-color: #E2E8F0;">
          <div class="confidential-text">
            <strong>${isAr ? "وثيقة رسمية وسرية:" : "Official & Confidential:"}</strong>
            <span>${isAr ? "تم استخراج هذا التقرير آلياً وفقاً للقيود والحسابات المرحّلة بدفاتر المنشأة." : "Generated automatically from official posted accounting ledgers."}</span>
          </div>
          <div class="cover-date">${isAr ? "تاريخ الإصدار:" : "Issued on:"} ${printTime}</div>
        </div>
      </div>
    </div>
    <div class="page-break"></div>
  `
    : "";

  // 2. SUMMARY CARDS
  const summaryCardsHtml =
    summaries.length > 0
      ? `<div class="summary-grid">
        ${summaries
          .map(
            (s) => `
          <div class="summary-card ${s.highlight ? "highlight" : ""}" style="${s.highlight ? `border-top: 3px solid ${safeBrandColor};` : ""}">
            <div class="summary-label">${escapeHtml(s.label)}</div>
            <div class="summary-value" style="${s.highlight ? `color: ${safeBrandColor};` : ""}">
              ${typeof s.value === "number" ? fmtNum(s.value) : escapeHtml(String(s.value))}
              ${typeof s.value === "number" ? `<span class="currency">${safeCurrency}</span>` : ""}
            </div>
          </div>
        `
          )
          .join("")}
      </div>`
      : "";

  // 3. TABLE HEAD
  const theadHtml = `
    <thead>
      <tr style="background: ${safeBrandColor}; color: #ffffff;">
        ${columns
          .map(
            (c) => `
          <th style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; ${c.width ? `width: ${c.width};` : ""}">
            ${escapeHtml(c.header)}
          </th>
        `
          )
          .join("")}
      </tr>
    </thead>
  `;

  // 4. TABLE BODY
  const tbodyHtml = `
    <tbody>
      ${
        rows.length > 0
          ? rows
              .map(
                (r, idx) => `
            <tr class="${idx % 2 === 1 ? "alt-row" : ""} ${r.__isGroup ? "group-row" : ""}">
              ${columns
                .map((c) => {
                  const val = r[c.key];
                  const formatted =
                    c.isNumber && typeof val === "number"
                      ? fmtNum(val)
                      : escapeHtml(String(val ?? "—"));

                  return `
                  <td style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; ${c.isNumber ? "font-family: 'Consolas', 'Courier New', monospace; font-weight: 700; direction: ltr;" : ""}">
                    ${formatted}
                  </td>
                `;
                })
                .join("")}
            </tr>
          `
              )
              .join("")
          : `<tr><td colspan="${columns.length}" style="text-align: center; padding: 25px; color: #64748b;">${isAr ? "لا توجد بيانات مسجلة لهذه الفترة" : "No records found for this period"}</td></tr>`
      }
    </tbody>
  `;

  // 5. TABLE FOOTER
  const tfootHtml = totalRow
    ? `
    <tfoot>
      <tr class="total-row" style="border-top: 2px solid ${safeBrandColor}; border-bottom: 3px double ${safeBrandColor};">
        ${columns
          .map((c, idx) => {
            const val = totalRow[c.key];
            const formatted =
              c.isNumber && typeof val === "number"
                ? fmtNum(val)
                : val !== undefined
                ? escapeHtml(String(val))
                : idx === 0
                ? isAr
                  ? "الإجمالي العام"
                  : "Total"
                : "";

            return `
            <td style="text-align: ${c.align || (c.isNumber ? "right" : "left")}; font-weight: 900; ${c.isNumber ? "font-family: 'Consolas', 'Courier New', monospace; direction: ltr;" : ""}">
              ${formatted}
            </td>
          `;
          })
          .join("")}
      </tr>
    </tfoot>
  `
    : "";

  // 6. NOTES
  const notesHtml =
    notes.length > 0
      ? `
    <div class="notes-section" style="border-inline-start: 3px solid ${safeBrandColor};">
      <div class="notes-title">${isAr ? "ملاحظات وإيضاحات محاسبية معتمدة:" : "Accounting Notes & Basis of Preparation:"}</div>
      <ul>
        ${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
      </ul>
    </div>
  `
      : "";

  const html = `<!DOCTYPE html>
<html lang="${locale}" dir="${isAr ? "rtl" : "ltr"}">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle} — ${safeOrgName}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Tajawal", "Cairo", "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.45;
      color: #0F172A;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .font-mono {
      font-family: 'Consolas', 'Courier New', monospace;
      direction: ltr;
      display: inline-block;
    }

    /* ─── COVER PAGE STYLES ─── */
    .cover-page {
      min-height: 250mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 10px 5px;
      position: relative;
    }
    .cover-accent-bar {
      height: 8px;
      border-radius: 4px;
      margin-bottom: 25px;
    }
    .cover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #E2E8F0;
      padding-bottom: 18px;
    }
    .cover-logo-box {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .cover-logo-img {
      max-height: 55px;
      max-width: 140px;
      object-fit: contain;
    }
    .cover-logo-placeholder {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      font-size: 18px;
      font-weight: 900;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .cover-org-name {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: -0.5px;
    }
    .cover-org-tagline {
      font-size: 11px;
      color: #64748B;
      font-weight: 600;
      margin-top: 1px;
    }
    .cover-badge {
      border: 1.5px solid;
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .cover-body {
      padding: 40px 0;
    }
    .cover-divider {
      width: 45px;
      height: 4px;
      border-radius: 2px;
      margin-bottom: 16px;
    }
    .cover-report-title {
      font-size: 28px;
      font-weight: 900;
      line-height: 1.25;
      margin-bottom: 8px;
    }
    .cover-report-subtitle {
      font-size: 13px;
      color: #475569;
      font-weight: 600;
      margin-bottom: 30px;
    }

    .cover-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-top: 25px;
    }
    .cover-meta-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .cover-meta-label {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 700;
    }
    .cover-meta-val {
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
    }

    .cover-footer {
      margin-top: auto;
    }
    .cover-confidential-ribbon {
      border: 1px solid;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
    }
    .confidential-text strong {
      color: #0F172A;
      margin-inline-end: 6px;
    }
    .confidential-text span {
      color: #64748B;
    }
    .cover-date {
      color: #64748B;
      font-weight: 700;
      font-size: 9.5px;
    }

    .page-break {
      page-break-after: always;
      break-after: page;
    }

    /* ─── CONTENT PAGES STYLES ─── */
    .content-header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid ${safeBrandColor};
      padding-bottom: 8px;
      margin-bottom: 14px;
    }
    .content-header-table td {
      vertical-align: middle;
    }
    .header-org-title {
      font-size: 14px;
      font-weight: 900;
      color: ${safeBrandColor};
    }
    .header-report-title {
      font-size: 15px;
      font-weight: 900;
      color: #0F172A;
    }
    .header-meta {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 600;
      margin-top: 2px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
      margin-bottom: 14px;
    }
    .summary-card {
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 8px 12px;
      background: #F8FAFC;
    }
    .summary-card.highlight {
      background: #FFFFFF;
      border-color: #CBD5E1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .summary-label {
      font-size: 9.5px;
      color: #64748B;
      font-weight: 800;
    }
    .summary-value {
      font-size: 14px;
      font-weight: 900;
      color: #0F172A;
      font-family: 'Consolas', 'Courier New', monospace;
      margin-top: 3px;
      direction: ltr;
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 4px;
    }
    .summary-value .currency {
      font-size: 9px;
      font-weight: 700;
      color: #64748B;
    }

    /* TABLE */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .data-table th {
      font-size: 10px;
      font-weight: 800;
      padding: 7px 9px;
      border: 1px solid ${safeBrandColor};
    }
    .data-table td {
      padding: 6px 9px;
      border: 1px solid #E2E8F0;
      font-size: 10px;
    }
    .data-table tr.alt-row td {
      background: #F8FAFC;
    }
    .data-table tr.group-row td {
      background: #F1F5F9;
      font-weight: 900;
      color: #0F172A;
    }
    .data-table tr.total-row td {
      background: #F8FAFC;
      font-size: 11px;
      padding: 8px 9px;
      color: #0F172A;
    }

    .notes-section {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 9px 14px;
      margin-bottom: 16px;
      font-size: 9.5px;
      color: #475569;
    }
    .notes-title {
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 4px;
    }
    .notes-section ul {
      padding-inline-start: 16px;
    }

    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 25px;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 33.33%;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      padding: 10px 12px;
      text-align: center;
      background: #FFFFFF;
    }
    .sig-title {
      font-size: 10px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 35px;
    }
    .sig-line {
      border-top: 1px dotted #94A3B8;
      padding-top: 4px;
      font-size: 9px;
      color: #64748B;
    }

    .footer-bar {
      margin-top: 18px;
      border-top: 1px solid #E2E8F0;
      padding-top: 6px;
      font-size: 8.5px;
      color: #94A3B8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  ${coverPageHtml}

  <!-- CONTENT PAGE HEADER -->
  <table class="content-header-table">
    <tr>
      <td style="width: 50%;">
        <div class="header-org-title">${safeOrgName}</div>
        <div class="header-report-title">${safeTitle}</div>
      </td>
      <td style="width: 50%; text-align: ${isAr ? "left" : "right"};">
        <div class="header-meta">${isAr ? "الفترة:" : "Period:"} <strong>${safeDateRange}</strong> | ${isAr ? "العملة:" : "Currency:"} <strong>${safeCurrency}</strong></div>
        ${taxNumber ? `<div class="header-meta">${isAr ? "الرقم الضريبي:" : "Tax ID:"} <span class="font-mono">${escapeHtml(taxNumber)}</span></div>` : ""}
      </td>
    </tr>
  </table>

  <!-- SUMMARIES -->
  ${summaryCardsHtml}

  <!-- DATA TABLE -->
  <table class="data-table">
    ${theadHtml}
    ${tbodyHtml}
    ${tfootHtml}
  </table>

  <!-- NOTES -->
  ${notesHtml}

  <!-- SIGNATURES -->
  <table class="signatures-table">
    <tr>
      <td class="sig-box" style="padding-inline-end: 6px;">
        <div class="sig-title">${isAr ? "المحاسب المسؤول" : "Prepared By"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع" : "Signature"}</div>
      </td>
      <td style="width: 12px;"></td>
      <td class="sig-box">
        <div class="sig-title">${isAr ? "المراجع الداخلي" : "Reviewed By"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع" : "Signature"}</div>
      </td>
      <td style="width: 12px;"></td>
      <td class="sig-box" style="padding-inline-start: 6px;">
        <div class="sig-title">${isAr ? "المدير المالي / الاعتماد" : "Financial Director / Approval"}</div>
        <div class="sig-line">${isAr ? "الاسم والتوقيع والختم" : "Signature & Stamp"}</div>
      </td>
    </tr>
  </table>

  <!-- FOOTER -->
  <div class="footer-bar">
    <div>${isAr ? "تم استخراج هذا التقرير آلياً من منظومة عقار بوكس المحاسبية" : "Generated automatically via AqarBooks Financial Engine"}</div>
    <div>${isAr ? "تاريخ ووقت الطباعة:" : "Printed at:"} ${printTime}</div>
  </div>

  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }
  return printWindow;
}
