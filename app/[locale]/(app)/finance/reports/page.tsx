import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ReportsHubClient } from "./reports-hub-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "مركز التقارير والقوائم المالية — AqarBooks"
      : "Financial Reports & Statements Hub — AqarBooks",
    description: isAr
      ? "القوائم المالية الختامية المعتمدة، موازين المراجعة، دفاتر الأستاذ، والتحليلات المحاسبية مع التصدير المباشر."
      : "Statutory financial statements, trial balances, general ledgers, and cash flow reports with instant PDF/Excel exports.",
  };
}

export default async function ReportsIndexPage({
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
  const today = new Date().toISOString().slice(0, 10);

  const { data: currentPeriod } = await supabase
    .from("fiscal_periods")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .eq("status", "OPEN")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [
    { data: periodTrialBalance },
    { data: cashPositionData },
  ] = await Promise.all([
    supabase.rpc("get_trial_balance", {
      p_organization_id: organization.id,
      p_start_date: currentPeriod?.start_date ?? "1900-01-01",
      p_end_date: currentPeriod?.end_date ?? today,
    }),
    supabase.rpc("get_cash_position", {
      p_organization_id: organization.id,
      p_as_of_date: today,
    }),
  ]);

  const revenueTotal = (periodTrialBalance ?? [])
    .filter((r) => r.category === "REVENUE")
    .reduce((s, r) => s + r.balance, 0);

  const expenseTotal = (periodTrialBalance ?? [])
    .filter((r) => r.category === "EXPENSE")
    .reduce((s, r) => s + r.balance, 0);

  const surplus = revenueTotal - expenseTotal;
  const cashPosition = Number(cashPositionData || 0);
  const currency = organization.default_currency || "EGP";

  return (
    <ReportsHubClient
      totalRevenue={revenueTotal}
      totalExpense={expenseTotal}
      netSurplus={surplus}
      cashPosition={cashPosition}
      currency={currency}
      organizationName={organization.name}
      taxId={organization.tax_id}
      locale={locale}
    />
  );
}
