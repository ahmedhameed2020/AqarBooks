"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";

export type PaymentExportRow = {
  paymentDate: string;
  method: string;
  amount: number;
  receiptNumber: number | null;
  status: string;
};

export function PaymentsExportButton({
  payments,
  unitCode,
  memberName,
  currency,
  organizationName = "AqarBooks",
  locale,
}: {
  payments: PaymentExportRow[];
  unitCode?: string;
  memberName?: string;
  currency: string;
  organizationName?: string;
  locale: string;
}) {
  const isAr = locale === "ar";

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AqarBooks";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(isAr ? "المدفوعات" : "Payments", {
      views: [{ rightToLeft: isAr }],
    });

    const headers = [
      isAr ? "تاريخ السداد" : "Payment Date",
      isAr ? "طريقة السداد" : "Payment Method",
      isAr ? "رقم الإيصال" : "Receipt #",
      isAr ? "المبلغ المسدد" : "Amount Paid",
      isAr ? "الحالة" : "Status",
    ];

    worksheet.columns = [
      { header: headers[0], width: 18 },
      { header: headers[1], width: 22 },
      { header: headers[2], width: 16 },
      { header: headers[3], width: 18 },
      { header: headers[4], width: 16 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: isAr ? "right" : "left", vertical: "middle" };
    });

    for (const p of payments) {
      const row = worksheet.addRow([
        p.paymentDate,
        p.method,
        p.receiptNumber ?? "—",
        p.amount,
        p.status,
      ]);
      row.getCell(4).numFmt = "#,##0.00";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payments_${unitCode || memberName || "Report"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const totalAmount = payments.reduce((s, p) => s + p.amount, 0);

    generateFinancialStatementPdf(
      {
        title: isAr ? "سجل المدفوعات والتحصيلات" : "Payments & Collections Log",
        subtitle: unitCode
          ? isAr ? `بيان المدفوعات المسددة للوحدة ${unitCode}` : `Payments for Unit ${unitCode}`
          : memberName
          ? isAr ? `بيان المدفوعات المسددة للعضو ${memberName}` : `Payments for Member ${memberName}`
          : "",
        organizationName,
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "تاريخ السداد" : "Payment Date", key: "date", align: "center", width: "20%" },
          { header: isAr ? "طريقة السداد" : "Method", key: "method", align: "start", width: "25%" },
          { header: isAr ? "رقم الإيصال" : "Receipt #", key: "receipt", align: "center", width: "18%" },
          { header: isAr ? "المبلغ" : "Amount", key: "amount", align: "end", isNumber: true, width: "20%" },
          { header: isAr ? "الحالة" : "Status", key: "status", align: "center", width: "17%" },
        ],
        rows: payments.map((p) => ({
          date: p.paymentDate,
          method: p.method,
          receipt: p.receiptNumber ? `#${p.receiptNumber}` : "—",
          amount: p.amount,
          status: p.status,
        })),
        totalRow: {
          date: isAr ? "الإجمالي" : "Total",
          method: "",
          receipt: "",
          amount: totalAmount,
          status: "",
        },
        summaryCards: [
          { label: isAr ? "عدد الدفعات" : "Total Payments", value: payments.length },
          {
            label: isAr ? "إجمالي المبلغ المحصل" : "Total Collected",
            value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            highlight: true,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  if (!payments.length) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleExportPdf}
        className="h-7 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 gap-1 cursor-pointer"
      >
        <Printer className="size-3 text-purple-600" />
        <span>{isAr ? "PDF" : "PDF"}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleExportExcel}
        className="h-7 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 gap-1 cursor-pointer"
      >
        <Download className="size-3 text-emerald-600" />
        <span>{isAr ? "Excel" : "Excel"}</span>
      </Button>
    </div>
  );
}
