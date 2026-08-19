"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateJournalVoucherPdf, type JournalVoucherData } from "@/lib/reports/journal-voucher-pdf";

export function JournalPrintButton({
  voucherData,
  locale,
}: {
  voucherData: JournalVoucherData;
  locale: string;
}) {
  const isAr = locale === "ar";

  return (
    <Button
      onClick={() => generateJournalVoucherPdf(voucherData, locale)}
      variant="outline"
      className="text-xs font-bold gap-1.5 h-9 border-slate-300 dark:border-slate-700 shadow-sm"
    >
      <Printer className="size-3.5 text-slate-600 dark:text-slate-300" />
      <span>{isAr ? "طباعة سند القيد (PDF)" : "Print JV Voucher"}</span>
    </Button>
  );
}
