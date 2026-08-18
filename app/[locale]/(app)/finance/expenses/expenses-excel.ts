import ExcelJS from "exceljs";
import type { ExpenseRow } from "./expenses-client";
import type { OptionItem } from "./expense-dialogs";

const HEADER_FILL = "FF1E3A8A";
const HEADER_BORDER = "FFCBD5E1";
const CELL_BORDER = "FFE2E8F0";

export async function buildExpensesXlsxBuffer(
  rows: ExpenseRow[],
  categoryMap: Map<string, string>,
  accountMap: Map<string, string>,
  currencyLabel: string,
  isAr: boolean
): Promise<ExcelJS.Buffer> {
  const headers = isAr
    ? [
        "رقم السند",
        "فئة المصروف",
        "البيان / الوصف",
        "المبلغ",
        "العملة",
        "تاريخ الصرف",
        "حساب الدفع / الخزينة",
        "حالة القيد المحاسبي",
      ]
    : [
        "Voucher #",
        "Expense Category",
        "Description",
        "Amount",
        "Currency",
        "Expense Date",
        "Payment Account",
        "Journal Status",
      ];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AqarBooks Financial Suite";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(
    isAr ? "سندات المصروفات" : "Expense Vouchers",
    {
      views: [{ rightToLeft: isAr }],
    }
  );

  worksheet.columns = [
    { header: headers[0], width: 14 },
    { header: headers[1], width: 22 },
    { header: headers[2], width: 36 },
    { header: headers[3], width: 16 },
    { header: headers[4], width: 12 },
    { header: headers[5], width: 16 },
    { header: headers[6], width: 26 },
    { header: headers[7], width: 20 },
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
    const row = worksheet.addRow([
      r.voucher_number ? `#${r.voucher_number}` : "—",
      categoryMap.get(r.expense_category_id) || "—",
      r.description || "—",
      r.amount,
      currencyLabel,
      r.expense_date || "—",
      r.payment_account_id ? accountMap.get(r.payment_account_id) || "—" : "—",
      r.journal_entry_id
        ? isAr
          ? "مرحل محاسبياً"
          : "Posted"
        : isAr
        ? "غير مرحل"
        : "Unposted",
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

      // Number formatting for amount
      if (colNumber === 4) {
        cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }
    });

    // Alternate row background
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

  // Summary row at the bottom
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalRow = worksheet.addRow([
    isAr ? "الإجمالي الكلي" : "Total",
    "",
    `${rows.length} ${isAr ? "سند صرف" : "vouchers"}`,
    totalAmount,
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
    if (colNumber === 4) {
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
