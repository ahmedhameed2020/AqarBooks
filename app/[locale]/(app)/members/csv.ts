import ExcelJS from "exceljs";
import type { MemberRow } from "./members-table";

export { downloadCsv } from "@/lib/csv";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildMembersCsv(rows: MemberRow[], isAr: boolean): string {
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
  return BOM + lines.join("\r\n");
}

const HEADER_FILL = "FF1E3A8A";
const HEADER_BORDER = "FFCBD5E1";
const CELL_BORDER = "FFE2E8F0";

export async function buildMembersXlsxBuffer(rows: MemberRow[], isAr: boolean): Promise<ExcelJS.Buffer> {
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
