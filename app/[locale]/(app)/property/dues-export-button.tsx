"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";

export type DueExportRow = {
  date: string;
  type: string;
  amount: number;
  status: string;
  description?: string | null;
};

export function DuesExportButton({
  dues,
  unitCode,
  memberName,
  currency,
  organizationName = "AqarBooks",
  locale,
}: {
  dues: DueExportRow[];
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

    const worksheet = workbook.addWorksheet(isAr ? "الاستحقاقات" : "Dues", {
      views: [{ rightToLeft: isAr }],
    });

    const headers = [
      isAr ? "تاريخ الاستحقاق" : "Due Date",
      isAr ? "نوع المطالبة / البيان" : "Due Type / Description",
      isAr ? "المبلغ المستحق" : "Amount",
      isAr ? "حالة السداد" : "Status",
    ];

    worksheet.columns = [
      { header: headers[0], width: 18 },
      { header: headers[1], width: 32 },
      { header: headers[2], width: 18 },
      { header: headers[3], width: 16 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: isAr ? "right" : "left", vertical: "middle" };
    });

    for (const d of dues) {
      const row = worksheet.addRow([
        d.date,
        d.type || d.description || "—",
        d.amount,
        d.status,
      ]);
      row.getCell(3).numFmt = "#,##0.00";
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Dues_${unitCode || memberName || "Report"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const totalAmount = dues.reduce((s, d) => s + d.amount, 0);

    generateFinancialStatementPdf(
      {
        title: isAr ? "سجل الاستحقاقات والمطالبات المالية" : "Dues & Fee Schedule",
        subtitle: unitCode
          ? isAr ? `بيان المطالبات للوحدة ${unitCode}` : `Dues for Unit ${unitCode}`
          : memberName
          ? isAr ? `بيان المطالبات للعضو ${memberName}` : `Dues for Member ${memberName}`
          : "",
        organizationName,
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "date", align: "center", width: "20%" },
          { header: isAr ? "نوع المطالبة / البيان" : "Type / Description", key: "type", align: "start", width: "40%" },
          { header: isAr ? "المبلغ" : "Amount", key: "amount", align: "end", isNumber: true, width: "22%" },
          { header: isAr ? "الحالة" : "Status", key: "status", align: "center", width: "18%" },
        ],
        rows: dues.map((d) => ({
          date: d.date,
          type: d.type || d.description || "—",
          amount: d.amount,
          status: d.status,
        })),
        totalRow: {
          date: isAr ? "الإجمالي" : "Total",
          type: "",
          amount: totalAmount,
          status: "",
        },
        summaryCards: [
          { label: isAr ? "عدد الاستحقاقات" : "Total Items", value: dues.length },
          {
            label: isAr ? "إجمالي المبلغ المستحق" : "Total Due Amount",
            value: `${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            highlight: true,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  if (!dues.length) return null;

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
