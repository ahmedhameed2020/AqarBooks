import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { TrendingUp } from "lucide-react";
import { IncomeStatementClient, type IncomeStatementRow } from "./income-statement-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "قائمة الدخل والأرباح والخسائر — AqarBooks"
      : "Income Statement (P&L) — AqarBooks",
    description: isAr
      ? "بيان شامل للإيرادات والمصروفات وصافي الفائض أو العجز المالي مع التصدير الرسمي للـ PDF والإكسل."
      : "Full statutory statement of operating revenues, expenses, and net surplus/deficit with PDF/Excel export.",
  };
}

export default async function IncomeStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { locale } = await params;
  const { start, end } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.reports.read", locale);
  if (denied) return denied;

  const supabase = await createClient();

  let startDate = start;
  let endDate = end;
  if (!startDate || !endDate) {
    const { data: openPeriod } = await supabase
      .from("fiscal_periods")
      .select("start_date, end_date")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    startDate = startDate || openPeriod?.start_date || "1900-01-01";
    endDate = endDate || openPeriod?.end_date || new Date().toISOString().slice(0, 10);
  }

  const pageSize = 1000;
  const rawRows: IncomeStatementRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .rpc("get_income_statement", {
        p_organization_id: organization.id,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as IncomeStatementRow[];
    rawRows.push(...page);
    if (page.length < pageSize) break;
  }
  const revenueRows = rawRows.filter((r) => r.category === "REVENUE" && r.balance !== 0);
  const expenseRows = rawRows.filter((r) => r.category === "EXPENSE" && r.balance !== 0);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "قائمة الدخل والأرباح والخسائر" : "Income Statement (P&L)"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `بيان الأداء المالي للفترة من ${startDate} إلى ${endDate} — مع استبعاد قيود الإقفال السنوي`
                  : `Operating performance from ${startDate} to ${endDate} — excluding year-end closing entries`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <IncomeStatementClient
        revenueRows={revenueRows}
        expenseRows={expenseRows}
        startDate={startDate}
        endDate={endDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
