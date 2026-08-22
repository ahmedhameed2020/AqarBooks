"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";

export function InstallmentExportButton({
  buyerName,
  unitCode,
  currency,
  totalPrice,
  downPayment,
  installmentCount,
  frequency,
  schedule,
  organizationName = "AqarBooks",
  locale,
}: {
  buyerName: string;
  unitCode: string;
  currency: string;
  totalPrice: number;
  downPayment: number;
  installmentCount: number;
  frequency: string;
  schedule: { sequence_no: number; amount: number; due_date: string; status: string }[];
  organizationName?: string;
  locale: string;
}) {
  const isAr = locale === "ar";

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AqarBooks";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(isAr ? "جدول الأقساط" : "Installment Schedule", {
      views: [{ rightToLeft: isAr }],
    });

    const headers = [
      isAr ? "رقم القسط" : "Installment #",
      isAr ? "تاريخ الاستحقاق" : "Due Date",
      isAr ? "قيمة القسط" : "Installment Amount",
      isAr ? "حالة السداد" : "Payment Status",
    ];

    worksheet.columns = [
      { header: headers[0], width: 16 },
      { header: headers[1], width: 20 },
      { header: headers[2], width: 22 },
      { header: headers[3], width: 18 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: isAr ? "right" : "left", vertical: "middle" };
    });

    for (const s of schedule) {
      const row = worksheet.addRow([
        `${isAr ? "قسط رقم" : "Inst. #"} ${s.sequence_no}`,
        s.due_date,
        s.amount,
        s.status === "PAID"
          ? isAr ? "مدفوع" : "Paid"
          : s.status === "OVERDUE"
          ? isAr ? "متأخر" : "Overdue"
          : isAr ? "مستحق" : "Due",
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
    a.download = `Installments_${unitCode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    const paidCount = schedule.filter((s) => s.status === "PAID").length;
    const paidAmount = schedule.filter((s) => s.status === "PAID").reduce((sum, s) => sum + s.amount, 0);

    generateFinancialStatementPdf(
      {
        title: isAr ? "جدول وخطة أقساط الوحدة" : "Installment Plan Schedule",
        subtitle: isAr
          ? `خطة أقساط الوحدة (${unitCode}) — المشتري: ${buyerName}`
          : `Unit ${unitCode} Installment Schedule — Buyer: ${buyerName}`,
        organizationName,
        currencyLabel: currency,
        dateRangeLabel: new Date().toISOString().slice(0, 10),
        columns: [
          { header: isAr ? "رقم القسط" : "Installment #", key: "seq", align: "center", width: "18%" },
          { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "date", align: "center", width: "26%" },
          { header: isAr ? "قيمة القسط" : "Amount", key: "amount", align: "end", isNumber: true, width: "28%" },
          { header: isAr ? "حالة السداد" : "Status", key: "status", align: "center", width: "28%" },
        ],
        rows: schedule.map((s) => ({
          seq: `#${s.sequence_no}`,
          date: s.due_date,
          amount: s.amount,
          status:
            s.status === "PAID"
              ? isAr ? "مدفوع بالكامل" : "Paid in Full"
              : s.status === "OVERDUE"
              ? isAr ? "متأخر" : "Overdue"
              : isAr ? "غير مسدد" : "Unpaid",
        })),
        totalRow: {
          seq: isAr ? "الإجمالي" : "Total",
          date: "",
          amount: schedule.reduce((sum, s) => sum + s.amount, 0),
          status: "",
        },
        summaryCards: [
          {
            label: isAr ? "إجمالي سعر الوحدة" : "Total Price",
            value: `${totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
          },
          {
            label: isAr ? "المقدم المسدد" : "Down Payment",
            value: `${downPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
          },
          {
            label: isAr ? "الأقساط المسددة" : "Paid Installments",
            value: `${paidCount} / ${installmentCount} (${paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency})`,
            highlight: true,
          },
        ],
        includeCoverPage: false,
      },
      locale
    );
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExportPdf}
        className="h-8 gap-1.5 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
      >
        <Printer className="size-3.5 text-purple-600" />
        <span>{isAr ? "طباعة الخطة PDF" : "Plan PDF"}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleExportExcel}
        className="h-8 gap-1.5 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
      >
        <Download className="size-3.5 text-emerald-600" />
        <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
      </Button>
    </div>
  );
}
