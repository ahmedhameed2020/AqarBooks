import ExcelJS from "exceljs";
import { unitTypeLabel, type UnitRow } from "./units-table";

export { downloadCsv } from "@/lib/csv";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Demo labelling (spec §28). A trailing row rather than a leading one: the
 * header row is what a spreadsheet and any importer key on, and pushing it
 * down would corrupt the file in order to make it legible. The row is still
 * visible, and the `DEMO-` filename prefix applied at the download call site
 * is the marker someone sees before they even open it.
 */
export function buildUnitsCsv(
  rows: UnitRow[],
  isAr: boolean,
  demoNotice?: string | null,
): string {
  const headers = isAr
    ? ["كود الوحدة", "المبنى", "المنطقة", "المساحة (م²)", "النوع", "حالة الإشغال", "المالك الحالي", "الرصيد المالي", "عليها متأخرات"]
    : ["Unit Code", "Building", "Zone", "Area (m²)", "Type", "Occupancy", "Current Owner", "Financial Balance", "Has Arrears"];
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        (isAr ? r.building_name_ar : r.building_name_en) ?? "",
        (isAr ? r.zone_name_ar : r.zone_name_en) ?? "",
        r.area ? String(r.area) : "",
        unitTypeLabel(r, isAr),
        r.occupancy_status === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : isAr ? "شاغرة" : "Vacant",
        r.owner_name ?? "",
        r.balance.toFixed(2),
        r.has_arrears ? (isAr ? "نعم" : "Yes") : isAr ? "لا" : "No",
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(","),
    );
  }
  // UTF-8 BOM so Microsoft Excel opens CSV with correct Arabic text encoding
  const BOM = "﻿";
  if (demoNotice) lines.push(escapeCsvField(demoNotice));

  return BOM + lines.join("\r\n");
}

const HEADER_FILL = "FF1E3A8A";
const HEADER_BORDER = "FFCBD5E1";
const CELL_BORDER = "FFE2E8F0";

// Builds a genuine OOXML .xlsx workbook -- NOT an HTML table disguised with
// an Excel MIME type/extension (that trick used to mostly work but current
// Excel versions validate real file content against the extension and
// reject it: "file format or file extension is not valid"). ExcelJS runs
// client-side here via its bundled browser build (see its package.json
// "browser" field), since this is only ever invoked from a "use client"
// component after a button click.
export async function buildUnitsXlsxBuffer(
  rows: UnitRow[],
  isAr: boolean,
  demoNotice?: string | null,
): Promise<ExcelJS.Buffer> {
  const headers = isAr
    ? ["كود الوحدة", "المبنى", "المنطقة", "المساحة (م²)", "النوع", "حالة الإشغال", "المالك الحالي", "الرصيد المالي", "عليها متأخرات"]
    : ["Unit Code", "Building", "Zone", "Area (m²)", "Type", "Occupancy", "Current Owner", "Financial Balance", "Has Arrears"];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AqarBooks";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(isAr ? "الوحدات" : "Units", {
    views: [{ rightToLeft: isAr }],
  });
  worksheet.columns = headers.map((header) => ({ header, width: 20 }));

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: isAr ? "right" : "left", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: HEADER_BORDER } },
      left: { style: "thin", color: { argb: HEADER_BORDER } },
      bottom: { style: "thin", color: { argb: HEADER_BORDER } },
      right: { style: "thin", color: { argb: HEADER_BORDER } },
    };
  });

  for (const r of rows) {
    const row = worksheet.addRow([
      r.code,
      (isAr ? r.building_name_ar : r.building_name_en) ?? "—",
      (isAr ? r.zone_name_ar : r.zone_name_en) ?? "—",
      r.area ?? "—",
      unitTypeLabel(r, isAr),
      r.occupancy_status === "OCCUPIED" ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant"),
      r.owner_name ?? "—",
      r.balance,
      r.has_arrears ? (isAr ? "نعم" : "Yes") : (isAr ? "لا" : "No"),
    ]);
    row.eachCell((cell) => {
      cell.alignment = { horizontal: isAr ? "right" : "left" };
      cell.border = {
        top: { style: "thin", color: { argb: CELL_BORDER } },
        left: { style: "thin", color: { argb: CELL_BORDER } },
        bottom: { style: "thin", color: { argb: CELL_BORDER } },
        right: { style: "thin", color: { argb: CELL_BORDER } },
      };
    });
    row.getCell(8).numFmt = "#,##0.00";
  }


  // Appended after the data for the same reason the CSV notice is: it
  // labels the file without disturbing the header row that row-1 styling
  // and every importer depend on.
  if (demoNotice) {
    const notice = worksheet.addRow([demoNotice]);
    notice.font = { italic: true, color: { argb: "FF7C2D12" } };
    notice.alignment = { horizontal: isAr ? "right" : "left" };
    workbook.creator = "AqarBooks Demo Environment";
  }

  return workbook.xlsx.writeBuffer();
}

export function downloadXlsxBuffer(filename: string, buffer: ExcelJS.Buffer) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
