import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateFiscalYearForm } from "./create-fiscal-year-form";
import { PeriodsClient, type FiscalYearItem, type FiscalPeriodItem, type PendingDuesSummary } from "./periods-client";
import { getCurrencyLabel } from "@/lib/currency";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

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
    title: isAr ? "إدارة السنوات والفترات المالية والإقفال المحاسبي | AqarBooks" : "Fiscal Years, Periods & Closing | AqarBooks",
    description: isAr
      ? "إدارة السنوات المحاسبية، فتح وإقفال الفترات الدورية، فحص قيود الإقفال، والاعتراف بالمستحقات في دفتر الأستاذ."
      : "Manage fiscal years, accounting periods, closing entries, and recognize unit dues in general ledger.",
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

  const denied = await denyIfMissingPermission(organization.id, "finance.periods.manage", locale);
  if (denied) return denied;

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
      .select("name, tax_id, default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const pending = pendingRows?.[0] as PendingDuesSummary | undefined;

  const initialYears: FiscalYearItem[] = (years ?? []).map((y) => ({
    id: y.id,
    name: y.name,
    start_date: y.start_date,
    end_date: y.end_date,
    status: y.status,
  }));

  const initialPeriods: FiscalPeriodItem[] = (periods ?? []).map((p) => ({
    id: p.id,
    fiscal_year_id: p.fiscal_year_id,
    period_number: p.period_number,
    name: p.name,
    start_date: p.start_date,
    end_date: p.end_date,
    status: p.status as FiscalPeriodItem["status"],
  }));

  return (
    <div className="space-y-6">
      <PeriodsClient
        organizationId={organization.id}
        organizationName={orgData?.name || organization.name}
        taxId={orgData?.tax_id}
        currencyLabel={currencyLabel}
        locale={locale}
        initialYears={initialYears}
        initialPeriods={initialPeriods}
        pendingDues={pending}
      />

      {/* CREATE FISCAL YEAR FORM */}
      <CreateFiscalYearForm organizationId={organization.id} locale={locale} />
    </div>
  );
}
