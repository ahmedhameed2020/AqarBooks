import ExcelJS from "exceljs";
import type { CommissionRow } from "./commissions-client";

const HEADER_FILL = "FF0F172A";
const HEADER_BORDER = "FFCBD5E1";
const CELL_BORDER = "FFE2E8F0";

export async function buildCommissionsXlsxBuffer(
  rows: CommissionRow[],
  brokerMap: Map<string, string>,
  propertyMap: Map<string, string>,
  currencyLabel: string,
  isAr: boolean
): Promise<ExcelJS.Buffer> {
  const headers = isAr
    ? [
        "الوسيط",
        "تاريخ الاستحقاق",
        "المشروع / العقار",
        "المبلغ الإجمالي",
        "نسبة الخصم %",
        "خصم المنبع المحتجز",
        "صافي العمولة المستحق",
        "العملة",
        "الحالة",
        "تاريخ السداد",
        "البيان / الملاحظات",
      ]
    : [
        "Broker Name",
        "Earned Date",
        "Property / Deal",
        "Gross Amount",
        "WHT Rate %",
        "Withheld Tax",
        "Net Amount",
        "Currency",
        "Status",
        "Paid Date",
        "Notes",
      ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AqarBooks Financial Suite";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(
    isAr ? "عمولات الوسطاء" : "Broker Commissions",
    {
      views: [{ rightToLeft: isAr }],
    }
  );

  worksheet.columns = [
    { header: headers[0], width: 22 },
    { header: headers[1], width: 16 },
    { header: headers[2], width: 22 },
    { header: headers[3], width: 16 },
    { header: headers[4], width: 14 },
    { header: headers[5], width: 16 },
    { header: headers[6], width: 18 },
    { header: headers[7], width: 12 },
    { header: headers[8], width: 14 },
    { header: headers[9], width: 16 },
    { header: headers[10], width: 30 },
  ];

  // Header styling
  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", horizontal: isAr ? "right" : "left" };
    cell.border = {
      top: { style: "thin", color: { argb: HEADER_BORDER } },
      left: { style: "thin", color: { argb: HEADER_BORDER } },
      bottom: { style: "medium", color: { argb: HEADER_BORDER } },
      right: { style: "thin", color: { argb: HEADER_BORDER } },
    };
  });
  worksheet.getRow(1).height = 28;

  // Add data rows
  rows.forEach((r, idx) => {
    const isPaid = r.status === "PAID";
    const row = worksheet.addRow([
      brokerMap.get(r.broker_id) || "—",
      r.earned_date || "—",
      (r.property_id ? propertyMap.get(r.property_id) : "") || "—",
      r.gross_amount,
      r.wht_rate ? `${r.wht_rate}%` : "0%",
      r.wht_amount,
      r.net_amount,
      currencyLabel,
      isPaid ? (isAr ? "مسددة" : "Paid") : isAr ? "مستحقة" : "Accrued",
      r.paid_date || "—",
      r.note || "—",
    ]);

    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: isAr ? "right" : "left" };
      cell.border = {
        top: { style: "thin", color: { argb: CELL_BORDER } },
        left: { style: "thin", color: { argb: CELL_BORDER } },
        bottom: { style: "thin", color: { argb: CELL_BORDER } },
        right: { style: "thin", color: { argb: CELL_BORDER } },
      };

      // Number formatting for gross, wht, net
      if (colNumber === 4 || colNumber === 6 || colNumber === 7) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
    });

    if (idx % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF8FAFC" },
        };
      });
    }
  });

  // Summary Row
  const totalGross = rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalWht = rows.reduce((s, r) => s + r.wht_amount, 0);
  const totalNet = rows.reduce((s, r) => s + r.net_amount, 0);

  const totalRow = worksheet.addRow([
    isAr ? "الإجمالي الكلي" : "Grand Total",
    "",
    `${rows.length} ${isAr ? "حركة" : "records"}`,
    totalGross,
    "",
    totalWht,
    totalNet,
    currencyLabel,
    "",
    "",
    "",
  ]);

  totalRow.height = 26;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    if (colNumber === 4 || colNumber === 6 || colNumber === 7) {
      cell.numFmt = "#,##0.00";
    }
  });

  return workbook.xlsx.writeBuffer();
}

export function downloadXlsxBuffer(filename: string, buffer: ExcelJS.Buffer) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
