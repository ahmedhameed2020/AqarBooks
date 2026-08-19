import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { EntryActions } from "./entry-actions";
import { JournalPrintButton } from "./print-button";
import { getCurrencyLabel } from "@/lib/currency";
import { FileText, ArrowRight, ArrowLeft, Calendar, Layers, ShieldCheck, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function JournalEntryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("journal_entries")
    .select(
      "id, organization_id, entry_number, entry_date, description, status, source_type, reversed_entry_id",
    )
    .eq("id", id)
    .single();

  if (!entry) notFound();

  const [
    { data: org },
    { data: lines },
    { data: accounts },
    { data: openPeriods },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, default_currency")
      .eq("id", entry.organization_id)
      .maybeSingle(),
    supabase
      .from("journal_entry_lines")
      .select("id, line_number, account_id, description, debit, credit")
      .eq("journal_entry_id", id)
      .order("line_number"),
    supabase.from("chart_of_accounts").select("id, code, name_ar, name_en"),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", entry.organization_id)
      .eq("status", "OPEN")
      .order("start_date"),
  ]);

  const currency = org?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const totalDebit = (lines ?? []).reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = (lines ?? []).reduce((s, l) => s + Number(l.credit), 0);

  const isPosted = entry.status === "POSTED";
  const isDraft = entry.status === "DRAFT";
  const isUnderReview = entry.status === "UNDER_REVIEW";

  const voucherLines = (lines ?? []).map((l) => {
    const acc = accountById.get(l.account_id);
    return {
      accountCode: acc?.code || "—",
      accountName: acc ? (isAr ? acc.name_ar : acc.name_en) : "—",
      description: l.description,
      debit: Number(l.debit),
      credit: Number(l.credit),
    };
  });

  const voucherData = {
    organizationName: org?.name || "AqarBooks",
    entryNumber: entry.entry_number,
    entryDate: entry.entry_date,
    description: entry.description,
    sourceType: entry.source_type || "MANUAL",
    status: entry.status,
    currencyCode: currency,
    currencyLabel,
    totalDebit,
    totalCredit,
    lines: voucherLines,
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/finance/journals"
            locale={locale as Locale}
            className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 mb-2"
          >
            {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
            <span>{isAr ? "العودة إلى سجل القيود اليومية" : "Back to Journal Entries"}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm">
              <FileText className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-950 dark:text-white">
                {entry.entry_number ? `#${entry.entry_number}` : isAr ? "مسودة قيد" : "Draft Journal Entry"}
              </h1>
              <p className="text-xs text-slate-500 font-mono">
                {entry.entry_date} · {entry.source_type || "MANUAL"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            className={`font-bold text-xs px-3 py-1 ${
              isPosted
                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                : isDraft
                ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                : isUnderReview
                ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                : "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
            }`}
          >
            {isPosted && (isAr ? "✓ قيد مرحل ومعتمد" : "Posted & Locked")}
            {isDraft && (isAr ? "مسودة" : "Draft")}
            {isUnderReview && (isAr ? "قيد المراجعة" : "Under Review")}
            {entry.status === "REVERSED" && (isAr ? "قيد عكسي" : "Reversed")}
          </Badge>

          <JournalPrintButton voucherData={voucherData} locale={locale} />
        </div>
      </div>

      {/* Meta Box */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <dt className="text-slate-400 font-bold mb-1">{isAr ? "تاريخ القيد" : "Entry Date"}</dt>
            <dd className="font-mono font-bold text-slate-900 dark:text-white">{entry.entry_date}</dd>
          </div>
          <div>
            <dt className="text-slate-400 font-bold mb-1">{isAr ? "المصدر" : "Source Type"}</dt>
            <dd className="font-mono font-bold text-slate-900 dark:text-white">{entry.source_type}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-slate-400 font-bold mb-1">{isAr ? "البيان والشرح العام" : "Description / Memo"}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">{entry.description || "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Lines Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "رقم واسم الحساب" : "Account"}</th>
                <th className="p-3.5 text-start">{isAr ? "البيان التفصيلي" : "Memo"}</th>
                <th className="p-3.5 text-end">{isAr ? "مدين (Dr)" : "Debit"}</th>
                <th className="p-3.5 text-end">{isAr ? "دائن (Cr)" : "Credit"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines?.map((line) => {
                const account = accountById.get(line.account_id);
                return (
                  <tr key={line.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-white">
                      {account ? (
                        <div>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 me-2">
                            {account.code}
                          </span>
                          <span>{isAr ? account.name_ar : account.name_en}</span>
                        </div>
                      ) : (
                        line.account_id
                      )}
                    </td>
                    <td className="p-3.5 text-slate-500">{line.description || "—"}</td>
                    <td className="p-3.5 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {line.debit > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </td>
                    <td className="p-3.5 text-end font-mono font-bold text-blue-600 dark:text-blue-400">
                      {line.credit > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 dark:bg-slate-900 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                <td colSpan={2} className="p-3.5 text-slate-900 dark:text-white">
                  {isAr ? "إجمالي القيد المحاسبي" : "Total Journal Balance"}
                </td>
                <td className="p-3.5 text-end font-mono font-black text-sm text-emerald-600">
                  {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                </td>
                <td className="p-3.5 text-end font-mono font-black text-sm text-blue-600">
                  {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry Actions */}
      <EntryActions
        journalEntryId={entry.id}
        status={entry.status}
        openPeriods={openPeriods ?? []}
        locale={locale}
      />
    </div>
  );
}
