"use client";

import { useState } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  BookOpen,
  Printer,
  FileSpreadsheet,
  Calendar,
  Search,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface AccountOption {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
}

export interface LedgerLine {
  entry_id: string;
  entry_number: number | null;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export function GeneralLedgerClient({
  accounts,
  selectedAccount,
  lines,
  startDate,
  endDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  accounts: AccountOption[];
  selectedAccount: AccountOption | null;
  lines: LedgerLine[];
  startDate: string;
  endDate: string;
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [accountId, setAccountId] = useState(selectedAccount?.id || "");
  const [currentStart, setCurrentStart] = useState(startDate);
  const [currentEnd, setCurrentEnd] = useState(endDate);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    router.push(`${pathname}?accountId=${accountId}&start=${currentStart}&end=${currentEnd}`);
  };

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const closingBalance = lines.length > 0 ? lines[lines.length - 1].running_balance : 0;

  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // PDF Export
  const handleExportPdf = () => {
    if (!selectedAccount) return;

    generateFinancialStatementPdf(
      {
        title: isAr ? `دفتر الأستاذ — ${selectedAccount.name_ar}` : `General Ledger — ${selectedAccount.name_en}`,
        subtitle: `${isAr ? "كود الحساب:" : "Account Code:"} ${selectedAccount.code} | ${isAr ? "الفترة:" : "Period:"} ${startDate} → ${endDate}`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رقم القيد" : "Entry #", key: "entryNo", align: "start", width: "12%" },
          { header: isAr ? "التاريخ" : "Date", key: "entry_date", align: "center", width: "15%" },
          { header: isAr ? "البيان والشرح" : "Description / Particulars", key: "description", align: "start", width: "37%" },
          { header: isAr ? "مدين" : "Debit", key: "debit", isNumber: true, width: "12%" },
          { header: isAr ? "دائن" : "Credit", key: "credit", isNumber: true, width: "12%" },
          { header: isAr ? "الرصيد التراكمي" : "Running Balance", key: "running_balance", isNumber: true, width: "12%" },
        ],
        rows: lines.map((l) => ({
          entryNo: l.entry_number ? `#${l.entry_number}` : "—",
          entry_date: l.entry_date,
          description: l.description,
          debit: l.debit > 0 ? l.debit : 0,
          credit: l.credit > 0 ? l.credit : 0,
          running_balance: l.running_balance,
        })),
        totalRow: {
          entryNo: isAr ? "الإجمالي" : "Total",
          entry_date: "",
          description: "",
          debit: totalDebit,
          credit: totalCredit,
          running_balance: closingBalance,
        },
        summaries: [
          { label: isAr ? "إجمالي الحركات المدينة" : "Total Debit", value: totalDebit },
          { label: isAr ? "إجمالي الحركات الدائنة" : "Total Credit", value: totalCredit },
          { label: isAr ? "رصيد الإقفال الحالي" : "Closing Balance", value: closingBalance, highlight: true },
        ],
        notes: [
          isAr
            ? "يعكس كشف الأستاذ العام تفاصيل القيود المحاسبية المرحّلة بالحساب المحدد والرصيد التراكمي بعد كل قيد."
            : "Reflects itemized posted entries for the selected ledger account and resulting running balance.",
        ],
      },
      locale
    );
  };

  // Excel Export
  const handleExportExcel = async () => {
    if (!selectedAccount) return;

    toast.add({
      type: "info",
      title: isAr ? "جاري تصدير كشف الأستاذ..." : "Exporting General Ledger...",
      description: isAr ? "يتم تجهيز ملف الإكسل" : "Preparing workbook",
    });

    await exportFinancialStatementToExcel(
      {
        filename: `general_ledger_${selectedAccount.code}`,
        sheetName: selectedAccount.code,
        reportTitle: `${isAr ? "كشف حساب الأستاذ العام" : "General Ledger"} — ${isAr ? selectedAccount.name_ar : selectedAccount.name_en} (${selectedAccount.code})`,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: `${startDate} → ${endDate}`,
        columns: [
          { header: isAr ? "رقم القيد" : "Entry #", key: "entryNo", isNumber: false, width: 15 },
          { header: isAr ? "التاريخ" : "Date", key: "entry_date", isNumber: false, width: 16 },
          { header: isAr ? "البيان والشرح" : "Description", key: "description", isNumber: false, width: 40 },
          { header: isAr ? "مدين" : "Debit", key: "debit", isNumber: true, width: 18 },
          { header: isAr ? "دائن" : "Credit", key: "credit", isNumber: true, width: 18 },
          { header: isAr ? "الرصيد التراكمي" : "Balance", key: "running_balance", isNumber: true, width: 18 },
        ],
        rows: lines.map((l) => ({
          entryNo: l.entry_number ? `#${l.entry_number}` : "—",
          entry_date: l.entry_date,
          description: l.description,
          debit: l.debit > 0 ? l.debit : 0,
          credit: l.credit > 0 ? l.credit : 0,
          running_balance: l.running_balance,
        })),
        totalRow: {
          entryNo: isAr ? "الإجمالي" : "Total",
          entry_date: "",
          description: "",
          debit: totalDebit,
          credit: totalCredit,
          running_balance: closingBalance,
        },
        summaries: [
          { label: isAr ? "إجمالي المدين" : "Total Debit", value: totalDebit },
          { label: isAr ? "إجمالي الدائن" : "Total Credit", value: totalCredit },
          { label: isAr ? "رصيد الإقفال" : "Closing Balance", value: closingBalance },
        ],
      },
      locale
    );

    toast.add({
      type: "success",
      title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel Exported Successfully",
      description: isAr ? "تم حفظ كشف الأستاذ" : "General ledger workbook downloaded",
    });
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE TOOLBAR & ACCOUNT SELECTOR
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5 space-y-1 text-start">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "اختر الحساب من الدليل المحاسبي *" : "Select Ledger Account *"}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="" disabled>
                {isAr ? "— اختر حساباً لاستعراض كشف الأستاذ —" : "— Select Account —"}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {isAr ? a.name_ar : a.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1 text-start">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "من تاريخ" : "From"}</label>
            <Input
              type="date"
              value={currentStart}
              onChange={(e) => setCurrentStart(e.target.value)}
              className="text-xs h-9 font-mono font-bold"
            />
          </div>

          <div className="sm:col-span-2 space-y-1 text-start">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "إلى تاريخ" : "To"}</label>
            <Input
              type="date"
              value={currentEnd}
              onChange={(e) => setCurrentEnd(e.target.value)}
              className="text-xs h-9 font-mono font-bold"
            />
          </div>

          <div className="sm:col-span-3 flex items-center gap-2">
            <Button type="submit" className="h-9 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white w-full">
              {isAr ? "استعراض الكشف" : "View Statement"}
            </Button>
          </div>
        </form>

        {selectedAccount && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold gap-1.5 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Printer className="size-3.5 text-purple-600" />
              <span>{isAr ? "طباعة / تصدير PDF" : "Print / PDF"}</span>
            </Button>

            <Button
              onClick={handleExportExcel}
              size="sm"
              className="h-8 text-xs font-bold gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm"
            >
              <FileSpreadsheet className="size-3.5" />
              <span>{isAr ? "تصدير إكسل (Excel)" : "Export Excel"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          ACCOUNT LEDGER KPIS & DETAILS
          ────────────────────────────────────────────────────────────────────────── */}
      {selectedAccount ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-bold text-slate-500">{isAr ? "مجموع الحركات المدينة" : "Total Debits"}</span>
              <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-white">
                {fmt(totalDebit)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <span className="text-xs font-bold text-slate-500">{isAr ? "مجموع الحركات الدائنة" : "Total Credits"}</span>
              <div className="mt-1 font-mono text-xl font-black text-slate-900 dark:text-white">
                {fmt(totalCredit)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 shadow-sm dark:border-purple-900/50 dark:bg-purple-950/40">
              <span className="text-xs font-bold text-purple-800 dark:text-purple-300">{isAr ? "الرصيد التراكمي النهائي" : "Closing Running Balance"}</span>
              <div className="mt-1 font-mono text-xl font-black text-purple-700 dark:text-purple-300">
                {fmt(closingBalance)} <span className="text-xs text-slate-500 font-semibold">{currency}</span>
              </div>
            </div>
          </div>

          {/* HIGH-CONTRAST LEDGER TABLE */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 text-start w-24">{isAr ? "رقم القيد" : "Entry #"}</th>
                    <th className="p-3.5 text-center w-28">{isAr ? "التاريخ" : "Date"}</th>
                    <th className="p-3.5 text-start">{isAr ? "البيان والشرح" : "Description"}</th>
                    <th className="p-3.5 text-end w-32">{isAr ? "مدين" : "Debit"}</th>
                    <th className="p-3.5 text-end w-32">{isAr ? "دائن" : "Credit"}</th>
                    <th className="p-3.5 text-end w-36">{isAr ? "الرصيد التراكمي" : "Balance"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {lines.length ? (
                    lines.map((l) => (
                      <tr
                        key={l.entry_id + String(l.running_balance)}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400">
                          {l.entry_number ? `#${l.entry_number}` : "—"}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500">{l.entry_date}</td>
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{l.description || "—"}</td>
                        <td className="p-3 text-end font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {l.debit > 0 ? fmt(l.debit) : "—"}
                        </td>
                        <td className="p-3 text-end font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {l.credit > 0 ? fmt(l.credit) : "—"}
                        </td>
                        <td className="p-3 text-end font-mono font-bold text-purple-700 dark:text-purple-300">
                          {fmt(l.running_balance)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد حركات مسجلة لهذا الحساب في الفترة المحددة" : "No posted ledger activity"}
                      </td>
                    </tr>
                  )}
                </tbody>
                {lines.length > 0 && (
                  <tfoot className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-slate-900 dark:border-slate-700 font-bold">
                    <tr>
                      <td colSpan={3} className="p-3.5 text-start font-black text-slate-900 dark:text-white">
                        {isAr ? "الإجمالي العام" : "Total"}
                      </td>
                      <td className="p-3.5 text-end font-mono text-sm font-black text-slate-950 dark:text-white">
                        {fmt(totalDebit)}
                      </td>
                      <td className="p-3.5 text-end font-mono text-sm font-black text-slate-950 dark:text-white">
                        {fmt(totalCredit)}
                      </td>
                      <td className="p-3.5 text-end font-mono text-sm font-black text-purple-700 dark:text-purple-300">
                        {fmt(closingBalance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-400 space-y-2">
          <BookOpen className="size-8 mx-auto text-slate-300 dark:text-slate-600" />
          <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
            {isAr ? "يرجى اختيار حساب من القائمة أعلاه لعرض كشف الأستاذ العام" : "Please select an account above"}
          </div>
        </div>
      )}
    </div>
  );
}
