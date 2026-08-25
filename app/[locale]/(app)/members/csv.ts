import ExcelJS from "exceljs";
import type { MemberRow } from "./members-table";

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
export function buildMembersCsv(
  rows: MemberRow[],
  isAr: boolean,
  demoNotice?: string | null,
): string {
  const headers = isAr
    ? ["الاسم", "البريد", "الهاتف", "عدد الوحدات", "الرصيد الإجمالي", "عليه متأخرات"]
    : ["Name", "Email", "Phone", "Units", "Total balance", "Has arrears"];
  const lines = [headers.map(escapeCsvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.full_name,
        r.email ?? "",
        r.phone ?? "",
        String(r.units_count),
        r.total_balance.toFixed(2),
        r.has_arrears ? (isAr ? "نعم" : "Yes") : isAr ? "لا" : "No",
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(","),
    );
  }
  // UTF-8 BOM so Excel opens the file with correct Arabic-text encoding.
  const BOM = "\uFEFF";
  if (demoNotice) lines.push(escapeCsvField(demoNotice));

  return BOM + lines.join("\r\n");
}

const HEADER_FILL = "FF1E3A8A";
const HEADER_BORDER = "FFCBD5E1";
const CELL_BORDER = "FFE2E8F0";

export async function buildMembersXlsxBuffer(
  rows: MemberRow[],
  isAr: boolean,
  demoNotice?: string | null,
): Promise<ExcelJS.Buffer> {
  const headers = isAr
    ? ["الاسم الكامل", "البريد الإلكتروني", "رقم الهاتف", "عدد الوحدات المملوكة", "الرصيد المالي الإجمالي", "حالة المتأخرات"]
    : ["Full Name", "Email Address", "Phone Number", "Units Owned", "Total Balance", "Arrears Status"];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AqarBooks";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(isAr ? "الأعضاء والملاك" : "Members & Owners", {
    views: [{ rightToLeft: isAr }],
  });
  worksheet.columns = headers.map((header) => ({ header, width: 22 }));

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
      r.full_name,
      r.email ?? "—",
      r.phone ?? "—",
      r.units_count,
      r.total_balance,
      r.has_arrears ? (isAr ? "عليه متأخرات" : "Has Arrears") : (isAr ? "منتظم" : "Current"),
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
    row.getCell(5).numFmt = "#,##0.00";
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
