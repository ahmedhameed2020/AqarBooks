"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAccountStatementPdf, type StatementLine } from "@/lib/reports/account-statement-pdf";

// The statement is already fully rendered on the page, so unlike the receipt
// button there is nothing to fetch on click -- the same rows the member is
// looking at are handed straight to the generator. That also means the printed
// document can never disagree with the screen.
export function PrintStatementButton({
  organizationName,
  propertyName,
  currency,
  accountName,
  lines,
  locale,
}: {
  organizationName: string;
  propertyName: string;
  currency: string;
  accountName: string;
  lines: StatementLine[];
  locale: string;
}) {
  const isAr = locale === "ar";

  function handleClick() {
    const dates = lines.map((l) => l.date).sort();
    generateAccountStatementPdf(
      {
        organizationName,
        propertyName,
        currency,
        accountName,
        // The portal statement is full-history, so the period is simply the
        // span the movements actually cover.
        periodStart: dates[0] ?? null,
        periodEnd: dates[dates.length - 1] ?? null,
        // Full history means nothing precedes the first line.
        openingBalance: 0,
        lines,
      },
      isAr ? "ar" : "en",
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={lines.length === 0}>
      <Printer className="size-4" />
      {isAr ? "طباعة كشف الحساب" : "Print statement"}
    </Button>
  );
}
