import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Scale } from "lucide-react";
import { TrialBalanceClient, type TrialBalanceRow } from "./trial-balance-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "ميزان المراجعة بالمجاميع والأرصدة — عقار بوكس"
      : "Trial Balance Statement — AqarBooks",
    description: isAr
      ? "كشف شامل لأرصدة وحركات الحسابات المحاسبية مع فحص التوازن والتصدير للـ PDF والإكسل."
      : "Full trial balance statement with debit/credit balance validation and PDF/Excel export.",
  };
}

export default async function TrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { locale } = await params;
  const { asOf } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.reports.read", locale);
  if (denied) return denied;

  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: rowsData } = await supabase.rpc("get_trial_balance", {
    p_organization_id: organization.id,
    p_start_date: "1900-01-01",
    p_end_date: asOfDate,
  });

  const rawRows = (rowsData ?? []) as unknown as TrialBalanceRow[];
  const rows = rawRows.filter((r) => r.total_debit !== 0 || r.total_credit !== 0);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Scale className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "ميزان المراجعة بالمجاميع والأرصدة" : "Trial Balance Statement"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `ميزان الأرصدة التراكمية والحركات لكافة الحسابات حتى تاريخ ${asOfDate}`
                  : `Cumulative balances and ledger activity for all chart of accounts as of ${asOfDate}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <TrialBalanceClient
        rows={rows}
        asOfDate={asOfDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
