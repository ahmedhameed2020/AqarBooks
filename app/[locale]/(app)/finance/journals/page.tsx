import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  JournalsClient,
  type JournalEntryItem,
} from "./journals-client";
import {
  FileText,
  CheckCircle2,
  Clock,
  RotateCcw,
  BookOpen,
  DollarSign,
  Scale,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "القيود اليومية العامة | AqarBooks" : "General Journal Entries | AqarBooks",
    description: isAr
      ? "إدارة وتدقيق القيود اليومية العامة، دورة الترحيل المحاسبي، ودفاتر الأستاذ."
      : "General ledger journal entries, posting workflow, audit trails, and vouchers.",
  };
}

export default async function JournalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();

  // 1. Get Primary Resort
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 2. Fetch Journal Entries with Lines
  const [
    { data: entriesRaw },
    { data: linesRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, entry_number, entry_date, description, status, source_type")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      // journal_entry_lines carries no organization_id of its own; it is scoped
      // through its parent entry.
      .from("journal_entry_lines")
      .select("journal_entry_id, debit, credit, journal_entries!inner(organization_id)")
      .eq("journal_entries.organization_id", organization.id),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Group lines by journal entry ID to compute total debits and credits
  const entryTotals = new Map<string, { debit: number; credit: number; count: number }>();
  (linesRaw ?? []).forEach((line) => {
    const existing = entryTotals.get(line.journal_entry_id) || { debit: 0, credit: 0, count: 0 };
    existing.debit += Number(line.debit) || 0;
    existing.credit += Number(line.credit) || 0;
    existing.count += 1;
    entryTotals.set(line.journal_entry_id, existing);
  });

  const entries: JournalEntryItem[] = (entriesRaw ?? []).map((e) => {
    const totals = entryTotals.get(e.id) || { debit: 0, credit: 0, count: 0 };
    return {
      id: e.id,
      entry_number: e.entry_number != null ? String(e.entry_number) : null,
      entry_date: e.entry_date,
      description: e.description,
      status: e.status,
      source_type: e.source_type,
      total_debit: totals.debit,
      total_credit: totals.credit,
      lines_count: totals.count,
    };
  });

  // KPI Calculations
  const postedList = entries.filter((e) => e.status === "POSTED");
  const draftList = entries.filter((e) => e.status === "DRAFT" || e.status === "UNDER_REVIEW");
  const reversedList = entries.filter((e) => e.status === "REVERSED");
  const totalVolume = postedList.reduce((sum, e) => sum + e.total_debit, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "القيود اليومية العامة (General Journal Entries)" : "General Journal Entries"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "سجل القيود المحاسبية العامة، دورة الاعتماد والترحيل المالي، وسندات القيد الرسمية."
              : "General journal ledger entries, posting workflows, and official JV print vouchers."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Posted Entries */}
        <KpiCard
          label={isAr ? "القيود المرحلة والمعتمدة" : "Posted Entries"}
          value={postedList.length.toString()}
          hint={
            isAr
              ? "قيود مقفلة ومؤثرة بدفتر الأستاذ"
              : "Posted and locked in ledger"
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 2. Draft & Under Review */}
        <KpiCard
          label={isAr ? "مسودات وقيد المراجعة" : "Draft & Under Review"}
          value={draftList.length.toString()}
          hint={
            isAr
              ? draftList.length > 0 ? `${draftList.length} قيد بانتظار الاعتماد والترحيل` : "لا توجد مسودات معلقة"
              : `${draftList.length} pending entries`
          }
          icon={<Clock className="size-5" />}
          tone={draftList.length > 0 ? "warning" : "positive"}
        />

        {/* 3. Reversed Entries */}
        <KpiCard
          label={isAr ? "القيود العكسية (الملغاة)" : "Reversed Entries"}
          value={reversedList.length.toString()}
          hint={
            isAr
              ? "قيود تمت تسويتها بقيد عكسي"
              : "Storno / reversed ledger entries"
          }
          icon={<RotateCcw className="size-5" />}
          tone={reversedList.length > 0 ? "negative" : "info"}
        />

        {/* 4. Total Ledger Turnover */}
        <KpiCard
          label={isAr ? "إجمالي الحركة المدينة المقيدة" : "Posted Debits Volume"}
          value={
            <>
              {totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي حركة الحسابات عبر ${postedList.length} قيد مرحل`
              : `Total posted debits across entries`
          }
          icon={<Scale className="size-5" />}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      <JournalsClient
        entries={entries}
        organizationName={organization.name}
        resortName={resort?.name}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
