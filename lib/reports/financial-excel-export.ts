import ExcelJS from "exceljs";

export interface ExcelColumnConfig {
  header: string;
  key: string;
  width?: number;
  isNumber?: boolean;
  align?: "left" | "center" | "right";
}

export interface ExcelExportData {
  filename: string;
  sheetName?: string;
  reportTitle: string;
  organizationName: string;
  taxNumber?: string | null;
  currencyLabel: string;
  dateRangeLabel: string;
  columns: ExcelColumnConfig[];
  rows: Record<string, any>[];
  totalRow?: Record<string, any>;
  summaries?: { label: string; value: string | number }[];
}

export async function exportFinancialStatementToExcel(
  data: ExcelExportData,
  locale: string = "ar"
): Promise<void> {
  const isAr = locale === "ar";
  const {
    filename,
    sheetName,
    reportTitle,
    organizationName,
    taxNumber,
    currencyLabel,
    dateRangeLabel,
    columns,
    rows,
    totalRow,
    summaries = [],
  } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AqarBooks ERP";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName || reportTitle.slice(0, 30), {
    views: [{ rightToLeft: isAr }],
    properties: { defaultRowHeight: 20 },
  });

  // 1. Organization & Title Header
  const titleRow = worksheet.addRow([organizationName || "AqarBooks"]);
  titleRow.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F172A" } };
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length);

  const subTitleRow = worksheet.addRow([reportTitle]);
  subTitleRow.font = { name: "Arial", size: 12, bold: true, color: { argb: "FF1E293B" } };
  worksheet.mergeCells(subTitleRow.number, 1, subTitleRow.number, columns.length);

  const metaText = `${isAr ? "الفترة المالية:" : "Period:"} ${dateRangeLabel} | ${isAr ? "العملة:" : "Currency:"} ${currencyLabel}${taxNumber ? ` | ${isAr ? "الرقم الضريبي:" : "Tax ID:"} ${taxNumber}` : ""}`;
  const metaRow = worksheet.addRow([metaText]);
  metaRow.font = { name: "Arial", size: 9.5, italic: true, color: { argb: "FF64748B" } };
  worksheet.mergeCells(metaRow.number, 1, metaRow.number, columns.length);

  // Blank line
  worksheet.addRow([]);

  // 2. Summary cards (if any)
  if (summaries.length > 0) {
    const summaryHeaderRow = worksheet.addRow(summaries.map((s) => s.label));
    summaryHeaderRow.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF475569" } };
    summaryHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const summaryValRow = worksheet.addRow(summaries.map((s) => s.value));
    summaryValRow.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF0F172A" } };
    summaryValRow.eachCell((cell) => {
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
      }
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    worksheet.addRow([]);
  }

  // 3. Table Column Headers
  const headerRow = worksheet.addRow(columns.map((c) => c.header));
  headerRow.height = 25;
  headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.eachCell((cell, colIndex) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" }, // Deep Navy Slate
    };
    const colCfg = columns[colIndex - 1];
    cell.alignment = {
      horizontal: colCfg?.align || (colCfg?.isNumber ? (isAr ? "left" : "right") : (isAr ? "right" : "left")),
      vertical: "middle",
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FF1E293B" } },
      bottom: { style: "thin", color: { argb: "FF1E293B" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } },
    };
  });

  // 4. Data Rows
  rows.forEach((r, idx) => {
    const rowValues = columns.map((c) => r[c.key]);
    const dataRow = worksheet.addRow(rowValues);
    dataRow.height = 20;
    dataRow.font = {
      name: "Arial",
      size: 9.5,
      bold: Boolean(r.__isGroup),
      color: { argb: r.__isGroup ? "FF0F172A" : "FF334155" },
    };

    dataRow.eachCell((cell, colIndex) => {
      const colCfg = columns[colIndex - 1];

      // Alternating background or group row
      if (r.__isGroup) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
      } else if (idx % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      }

      if (colCfg?.isNumber && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
      }

      cell.alignment = {
        horizontal: colCfg?.align || (colCfg?.isNumber ? (isAr ? "left" : "right") : (isAr ? "right" : "left")),
        vertical: "middle",
      };

      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // 5. Total Summary Row
  if (totalRow) {
    const totalValues = columns.map((c, idx) => {
      const val = totalRow[c.key];
      if (val !== undefined) return val;
      if (idx === 0) return isAr ? "الإجمالي العام" : "Total";
      return "";
    });

    const totRow = worksheet.addRow(totalValues);
    totRow.height = 24;
    totRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF0F172A" } };

    totRow.eachCell((cell, colIndex) => {
      const colCfg = columns[colIndex - 1];
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };

      if (colCfg?.isNumber && typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
      }

      cell.alignment = {
        horizontal: colCfg?.align || (colCfg?.isNumber ? (isAr ? "left" : "right") : (isAr ? "right" : "left")),
        vertical: "middle",
      };

      cell.border = {
        top: { style: "medium", color: { argb: "FF0F172A" } },
        bottom: { style: "double", color: { argb: "FF0F172A" } },
      };
    });
  }

  // 6. Adjust Column Widths
  columns.forEach((col, idx) => {
    const worksheetColumn = worksheet.getColumn(idx + 1);
    let maxLength = col.header.length || 10;
    rows.forEach((r) => {
      const val = r[col.key];
      if (val !== undefined && val !== null) {
        const strVal = typeof val === "number" ? val.toFixed(2) : String(val);
        if (strVal.length > maxLength) maxLength = strVal.length;
      }
    });
    worksheetColumn.width = col.width || Math.max(maxLength + 4, 12);
  });

  // 7. Write to buffer and trigger download in browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename || "financial_statement"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
