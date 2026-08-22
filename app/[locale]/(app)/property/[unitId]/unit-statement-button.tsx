"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAccountStatementPdf, type StatementLine } from "@/lib/reports/account-statement-pdf";
import type { UnitRow } from "../units-table";

export function UnitStatementButton({
  organizationName,
  resortName,
  currency,
  unit,
  dues,
  payments,
  locale,
}: {
  organizationName: string;
  resortName: string;
  currency: string;
  unit: UnitRow;
  dues: { date: string; type: string; amount: number; status: string }[];
  payments: { date: string; method: string; amount: number }[];
  locale: string;
}) {
  const isAr = locale === "ar";

  const handlePrint = () => {
    const lines: StatementLine[] = [];

    // Dues (Charges)
    for (const d of dues) {
      lines.push({
        date: d.date,
        kind: "CHARGE",
        description: d.type,
        unitCode: unit.code,
        reference: null,
        amount: d.amount,
      });
    }

    // Payments
    for (const p of payments) {
      lines.push({
        date: p.date,
        kind: "PAYMENT",
        description: isAr ? `سداد دفعة (${p.method})` : `Payment (${p.method})`,
        unitCode: unit.code,
        reference: null,
        amount: p.amount,
      });
    }

    // Sort by date ascending
    lines.sort((a, b) => a.date.localeCompare(b.date));

    generateAccountStatementPdf(
      {
        organizationName,
        propertyName: resortName || organizationName,
        currency,
        accountName: `${isAr ? "الوحدة" : "Unit"} ${unit.code} ${unit.owner_name ? `(${unit.owner_name})` : ""}`,
        periodStart: lines.length > 0 ? lines[0].date : null,
        periodEnd: lines.length > 0 ? lines[lines.length - 1].date : null,
        openingBalance: 0,
        lines,
      },
      locale
    );
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePrint}
      className="h-8.5 gap-1.5 text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
    >
      <Printer className="size-3.5 text-purple-600" />
      <span>{isAr ? "كشف حساب الوحدة PDF" : "Unit Statement PDF"}</span>
    </Button>
  );
}
