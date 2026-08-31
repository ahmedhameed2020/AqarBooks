"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, History, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";

export interface LegacyFinancialAccount {
  account_id: string;
  account_code: string;
  legacy_account_name: string;
  current_member_name: string;
  source_debit: number;
  source_credit: number;
  source_net: number;
  staging_debit: number;
  staging_credit: number;
  staging_net: number;
}

export interface LegacyLedgerLine {
  account_id: string;
  account_code: string;
  entry_id: string;
  entry_number: number | null;
  entry_date: string;
  description: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

const PAGE_SIZE = 25;

export function LegacyFinancialHistory({
  accounts,
  lines,
  locale,
  currency,
}: {
  accounts: LegacyFinancialAccount[];
  lines: LegacyLedgerLine[];
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const [page, setPage] = useState(1);
  const orderedLines = useMemo(
    () => [...lines].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || (b.entry_number ?? 0) - (a.entry_number ?? 0)),
    [lines],
  );
  const pageCount = Math.max(1, Math.ceil(orderedLines.length / PAGE_SIZE));
  const visibleLines = orderedLines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalDebit = accounts.reduce((sum, account) => sum + Number(account.staging_debit), 0);
  const totalCredit = accounts.reduce((sum, account) => sum + Number(account.staging_credit), 0);
  const net = totalDebit - totalCredit;
  const fmt = (value: number) =>
    Number(value).toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (!accounts.length) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
        <History className="mx-auto mb-2 size-5 text-slate-400" />
        <p className="text-sm font-semibold">{isAr ? "لا يوجد حساب مالي قديم مرتبط بهذه الوحدة" : "No legacy financial account is linked to this unit"}</p>
        <p className="mt-1 text-xs text-slate-500">{isAr ? "المستحقات والمدفوعات الجديدة ستظهر في الأقسام التالية." : "New dues and payments will appear in the sections below."}</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm dark:border-cyan-900/60 dark:bg-slate-900">
      <div className="border-b border-cyan-100 bg-cyan-50/70 p-5 dark:border-cyan-900/50 dark:bg-cyan-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="size-5 text-cyan-700 dark:text-cyan-400" />
              <h2 className="text-sm font-black text-slate-950 dark:text-white">
                {isAr ? "الحركات المالية التاريخية" : "Legacy financial history"}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {isAr
                ? "حركات دفتر الأستاذ المستوردة من النظام القديم — منفصلة عن المستحقات والمدفوعات التشغيلية الجديدة."
                : "General-ledger movements imported from the legacy system, kept separate from new operational dues and payments."}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
            <ShieldCheck className="size-3.5" />
            {isAr ? "مرجع مالي فقط — لا يثبت الملكية" : "Financial reference only — not ownership evidence"}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [isAr ? "إجمالي المدين" : "Total debit", totalDebit],
            [isAr ? "إجمالي الدائن" : "Total credit", totalCredit],
            [isAr ? "الرصيد الختامي" : "Closing balance", net],
            [isAr ? "عدد الحركات" : "Movement lines", orderedLines.length],
          ].map(([label, value], index) => (
            <div key={String(label)} className="rounded-xl border border-white/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[11px] font-semibold text-slate-500">{label}</p>
              <p className="mt-1 font-mono text-base font-black text-slate-950 dark:text-white">
                {index === 3 ? Number(value).toLocaleString(isAr ? "ar-EG" : "en-US") : fmt(Number(value))}
                {index !== 3 && <span className="ms-1 text-[10px] font-semibold text-slate-500">{currency}</span>}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {accounts.map((account) => (
            <div key={account.account_id} className="flex flex-col gap-2 rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs dark:border-cyan-900/50 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-mono font-black text-cyan-700 dark:text-cyan-400">{account.account_code}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="font-semibold">{account.legacy_account_name.trim()}</span>
                {account.legacy_account_name.trim() !== account.current_member_name.trim() && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    {isAr
                      ? `المالك الحالي: ${account.current_member_name} — اختلاف الاسم محفوظ للتدقيق.`
                      : `Current owner: ${account.current_member_name} — name difference retained for audit.`}
                  </p>
                )}
              </div>
              <Link
                href={`/finance/reports/general-ledger?accountId=${account.account_id}`}
                className="font-bold text-cyan-700 hover:underline dark:text-cyan-400"
              >
                {isAr ? "فتح دفتر الأستاذ الكامل" : "Open full general ledger"}
              </Link>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-3 text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-3 text-start">{isAr ? "رقم القيد" : "Entry no."}</th>
              <th className="p-3 text-start">{isAr ? "البيان" : "Description"}</th>
              <th className="p-3 text-end">{isAr ? "مدين" : "Debit"}</th>
              <th className="p-3 text-end">{isAr ? "دائن" : "Credit"}</th>
              <th className="p-3 text-end">{isAr ? "الرصيد الجاري" : "Running balance"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleLines.map((line) => (
              <tr key={`${line.account_id}-${line.entry_id}-${line.entry_number ?? "draft"}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap p-3 font-mono">{line.entry_date}</td>
                <td className="p-3 font-mono font-bold">{line.entry_number ?? "—"}</td>
                <td className="max-w-md p-3 font-medium">{line.description || "—"}</td>
                <td className="p-3 text-end font-mono">{fmt(Number(line.debit))}</td>
                <td className="p-3 text-end font-mono">{fmt(Number(line.credit))}</td>
                <td className="p-3 text-end font-mono font-bold">{fmt(Number(line.running_balance))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
        <span className="text-slate-500">
          {isAr
            ? `عرض ${visibleLines.length} من أصل ${orderedLines.length} حركة`
            : `Showing ${visibleLines.length} of ${orderedLines.length} movements`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
            aria-label={isAr ? "الصفحة السابقة" : "Previous page"}
          >
            {isAr ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
          <span className="min-w-16 text-center font-bold">{page} / {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
            aria-label={isAr ? "الصفحة التالية" : "Next page"}
          >
            {isAr ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
    </section>
  );
}
