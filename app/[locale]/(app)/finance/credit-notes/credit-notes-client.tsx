"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileMinus2,
  Plus,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  Printer,
  DollarSign,
  Layers,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { IssueCreditNoteDialog, type DueCreditableOption } from "./credit-notes-dialog";
import { generateCreditNotePdf } from "@/lib/reports/credit-note-pdf";

export type CreditNoteItem = {
  id: string;
  document_number: string;
  document_type: string;
  credit_date: string;
  gross_amount: number;
  taxable_base: number;
  vat_amount: number;
  reason: string;
  unit_code: string;
  due_title: string;
  decision_snapshot?: any;
};

export function CreditNotesClient({
  creditNotes,
  dues,
  organizationName,
  resortName,
  currency = "EGP",
  locale,
}: {
  creditNotes: CreditNoteItem[];
  dues: DueCreditableOption[];
  organizationName: string;
  resortName?: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);

  // Filtered Credit Notes
  const filteredNotes = useMemo(() => {
    return creditNotes.filter((cn) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const doc = cn.document_number.toLowerCase();
        const unit = cn.unit_code.toLowerCase();
        const reason = cn.reason.toLowerCase();
        const due = cn.due_title.toLowerCase();
        const date = cn.credit_date.toLowerCase();
        return doc.includes(q) || unit.includes(q) || reason.includes(q) || due.includes(q) || date.includes(q);
      }
      return true;
    });
  }, [creditNotes, searchQuery]);

  const handlePrintCreditNote = (cn: CreditNoteItem) => {
    const rate = cn.taxable_base > 0 ? Math.round((cn.vat_amount / cn.taxable_base) * 100) : 14;
    generateCreditNotePdf(
      {
        organizationName,
        resortName,
        documentNumber: cn.document_number,
        creditDate: cn.credit_date,
        unitCode: cn.unit_code,
        dueTitle: cn.due_title,
        reason: cn.reason,
        grossAmount: cn.gross_amount,
        taxableBase: cn.taxable_base,
        vatAmount: cn.vat_amount,
        vatRatePercent: rate,
        currencyCode: currency,
        currencyLabel,
      },
      locale
    );
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث برقم الإشعار، الوحدة، أو السبب..." : "Search credit notes..."}
            className="ps-9 text-xs h-9"
          />
        </div>

        {/* Action Button */}
        <Button
          onClick={() => setIssueDialogOpen(true)}
          className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
        >
          <Plus className="size-3.5" />
          <span>{isAr ? "إصدار إشعار خصم جديد" : "New Credit Note"}</span>
        </Button>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST CREDIT NOTES TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "رقم إشعار الخصم" : "Credit Note #"}</th>
                <th className="p-3.5 text-start">{isAr ? "الوحدة العقارية" : "Unit"}</th>
                <th className="p-3.5 text-start">{isAr ? "تاريخ الإشعار" : "Date"}</th>
                <th className="p-3.5 text-start">{isAr ? "سبب الخصم والمطالبة الأصلية" : "Reason & Original Due"}</th>
                <th className="p-3.5 text-end">{isAr ? "الوعاء (الصافي)" : "Taxable Base"}</th>
                <th className="p-3.5 text-end">{isAr ? "الضريبة المستردة" : "VAT"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي الخصم" : "Gross Total"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredNotes.length ? (
                filteredNotes.map((cn) => {
                  return (
                    <tr
                      key={cn.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-rose-600 dark:text-rose-400">
                        <div className="flex items-center gap-1.5">
                          <FileMinus2 className="size-3.5" />
                          <span>{cn.document_number}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-bold text-slate-900 dark:text-white font-mono">
                        {cn.unit_code}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {cn.credit_date}
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-white">{cn.reason}</div>
                        <div className="text-[11px] text-slate-400 font-medium truncate max-w-xs">{cn.due_title}</div>
                      </td>

                      <td className="p-3.5 text-end font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {cn.taxable_base.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {cn.vat_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                        {cn.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                      </td>

                      <td className="p-3.5 text-end">
                        <Button
                          onClick={() => handlePrintCreditNote(cn)}
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs font-bold gap-1 text-slate-700 hover:bg-slate-100 dark:text-slate-300"
                        >
                          <Printer className="size-3.5" />
                          <span>{isAr ? "طباعة" : "Print"}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد إشعارات خصم ضريبية مسجلة بعد" : "No credit notes found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Credit Note Dialog */}
      <IssueCreditNoteDialog
        open={issueDialogOpen}
        onOpenChange={setIssueDialogOpen}
        dues={dues}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
