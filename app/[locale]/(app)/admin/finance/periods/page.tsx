import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { CreateFiscalYearForm } from "./create-fiscal-year-form";
import { PeriodStatusForm } from "./period-status-form";
import { RecognizeDuesForm } from "./recognize-dues-form";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Layers,
  Sparkles,
} from "lucide-react";
import { getCurrencyLabel } from "@/lib/currency";

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
    title: isAr ? "إدارة السنوات والفترات المالية | AqarBooks" : "Fiscal Years & Periods | AqarBooks",
    description: isAr
      ? "إدارة السنوات المحاسبية، فتح وإقفال الفترات الدورية، والاعتراف بالمستحقات في دفتر الأستاذ."
      : "Manage fiscal years, lock accounting periods, and recognize pending dues in ledger.",
  };
}

export default async function FiscalPeriodsPage({
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

  const [
    { data: years },
    { data: periods },
    { data: pendingRows },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("fiscal_years")
      .select("id, name, start_date, end_date, status")
      .eq("organization_id", organization.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("fiscal_periods")
      .select("id, fiscal_year_id, period_number, name, start_date, end_date, status")
      .eq("organization_id", organization.id)
      .order("start_date", { ascending: true }),
    supabase.rpc("get_unrecognized_dues_summary", {
      p_organization_id: organization.id,
    }),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const pending = pendingRows?.[0];

  const allPeriods = periods ?? [];
  const openPeriodsCount = allPeriods.filter((p) => p.status === "OPEN").length;
  const lockedPeriodsCount = allPeriods.filter((p) => p.status === "LOCKED" || p.status === "CLOSED").length;
  const plannedPeriodsCount = allPeriods.filter((p) => p.status === "PLANNED").length;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "السنوات والفترات المالية (Fiscal Periods & Closing)" : "Fiscal Years & Periods"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "التحكم في فترات الترحيل المحاسبي، إقفال السنوات المالية، والاعتراف الدوري بمستحقات الوحدات."
              : "Control fiscal period states, year-end closings, and recognize unit dues in ledger."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Fiscal Years */}
        <KpiCard
          label={isAr ? "السنوات المالية المعرفة" : "Fiscal Years"}
          value={(years ?? []).length.toString()}
          hint={
            isAr
              ? `تتضمن ${allPeriods.length} فترة محاسبية إجمالاً`
              : `${allPeriods.length} total periods`
          }
          icon={<Calendar className="size-5" />}
          tone="info"
        />

        {/* 2. Open Periods */}
        <KpiCard
          label={isAr ? "فترات مفتوحة للقيود" : "Open Periods"}
          value={openPeriodsCount.toString()}
          hint={
            isAr
              ? "فترات تقبل تسجيل وترحيل الحركات والقيود"
              : "Active periods accepting entries"
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 3. Locked / Closed Periods */}
        <KpiCard
          label={isAr ? "فترات مقفلة ومغلقة" : "Locked / Closed"}
          value={lockedPeriodsCount.toString()}
          hint={
            isAr
              ? "فترات منتهية ومحمية من أي تعديل"
              : "Audited & protected periods"
          }
          icon={<Lock className="size-5" />}
        />

        {/* 4. Unrecognized Dues */}
        <KpiCard
          label={isAr ? "مستحقات معلقة خارج الفترات" : "Pending Dues"}
          value={
            pending && pending.pending_count > 0 ? (
              <>
                {Number(pending.pending_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
              </>
            ) : (
              (isAr ? "لا توجد معلقات" : "None")
            )
          }
          hint={
            pending && pending.pending_count > 0
              ? isAr ? `${pending.pending_count} مستحق بانتظار فتح فترته` : `${pending.pending_count} dues pending`
              : isAr ? "جميع المستحقات مرحلة بالكامل" : "All dues recognized in GL"
          }
          icon={<AlertTriangle className="size-5" />}
          tone={pending && pending.pending_count > 0 ? "warning" : "positive"}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          PENDING UNRECOGNIZED DUES BANNER
          ────────────────────────────────────────────────────────────────────────── */}
      {pending && pending.pending_count > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-extrabold text-sm">
              {isAr ? "تنبيه محاسبي: مستحقات صادرة لم تُقيد في دفتر الأستاذ العام" : "Accounting Alert: Issued Dues Pending Ledger Recognition"}
            </h3>
            <p>
              {isAr
                ? `يوجد ${pending.pending_count} مستحق بقيمة إجمالية ${Number(pending.pending_total).toLocaleString()} ${currencyLabel} تم إصدارها لكن تواريخها (${pending.earliest_issue_date} → ${pending.latest_issue_date}) تقع خارج أي فترة محاسبية مفتوحة. يرجى فتح الفترة المقابلة أدناه ثم الضغط على «اعتراف بالمستحقات» لترحيل القيود.`
                : `${pending.pending_count} due(s) totalling ${Number(pending.pending_total).toLocaleString()} ${currencyLabel} are outside open periods. Open the period below and click "Recognise Dues".`}
            </p>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          CREATE FISCAL YEAR FORM
          ────────────────────────────────────────────────────────────────────────── */}
      <CreateFiscalYearForm organizationId={organization.id} locale={locale} />

      {/* ──────────────────────────────────────────────────────────────────────────
          FISCAL YEARS & PERIODS MATRICES
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {years?.map((year) => {
          const yearPeriods = allPeriods.filter((p) => p.fiscal_year_id === year.id);

          return (
            <div
              key={year.id}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
            >
              {/* Year Header Bar */}
              <div className="bg-slate-900 text-white dark:bg-slate-800/95 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 font-black">
                    <Calendar className="size-4" />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm text-white">
                      {isAr ? `السنة المالية: ${year.name}` : `Fiscal Year: ${year.name}`}
                    </h2>
                    <span className="text-[11px] font-mono text-slate-400">
                      {year.start_date} → {year.end_date}
                    </span>
                  </div>
                </div>

                <Badge
                  className={`text-[10px] font-bold ${
                    year.status === "OPEN"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {year.status === "OPEN" ? (isAr ? "سنة مالية نشطة" : "Active Year") : year.status}
                </Badge>
              </div>

              {/* Periods Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3 text-start">{isAr ? "الفترة المحاسبية" : "Period"}</th>
                      <th className="p-3 text-start">{isAr ? "تاريخ البداية" : "Start Date"}</th>
                      <th className="p-3 text-start">{isAr ? "تاريخ النهاية" : "End Date"}</th>
                      <th className="p-3 text-center">{isAr ? "الحالة الحالية" : "Current Status"}</th>
                      <th className="p-3 text-end">{isAr ? "تعديل الحالة والترحيل" : "Actions & Dues"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {yearPeriods.length ? (
                      yearPeriods.map((period) => {
                        const isOpen = period.status === "OPEN";
                        const isPlanned = period.status === "PLANNED";
                        const isClosed = period.status === "CLOSED";
                        const isLocked = period.status === "LOCKED";

                        return (
                          <tr
                            key={period.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="p-3 font-bold text-slate-900 dark:text-white">
                              {period.name}
                            </td>

                            <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {period.start_date}
                            </td>

                            <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                              {period.end_date}
                            </td>

                            <td className="p-3 text-center">
                              <Badge
                                className={`text-[10px] font-bold ${
                                  isOpen
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                    : isPlanned
                                    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                                    : isClosed
                                    ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                                    : "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {isOpen && (isAr ? "✓ مفتوحة للقيود" : "Open")}
                                {isPlanned && (isAr ? "مخططة" : "Planned")}
                                {isClosed && (isAr ? "مغلقة" : "Closed")}
                                {isLocked && (isAr ? "مقفلة نهائياً" : "Locked")}
                              </Badge>
                            </td>

                            <td className="p-3 text-end">
                              <div className="flex items-center justify-end gap-2 flex-wrap">
                                <PeriodStatusForm periodId={period.id} currentStatus={period.status} locale={locale} />
                                {isOpen && (
                                  <RecognizeDuesForm
                                    organizationId={organization.id}
                                    periodId={period.id}
                                    locale={locale}
                                  />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                          {isAr ? "لا توجد فترات تابعة لهذه السنة" : "No periods found for this year"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
