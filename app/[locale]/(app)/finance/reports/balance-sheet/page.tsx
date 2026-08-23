import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Landmark } from "lucide-react";
import { BalanceSheetClient, type BalanceSheetAccountRow } from "./balance-sheet-client";
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
      ? "الميزانية العمومية والمركز المالي — عقار بوكس"
      : "Balance Sheet (Statement of Financial Position) — AqarBooks",
    description: isAr
      ? "بيان الأصول، الخصوم والالتزامات، وحقوق الملكية وفحص توازن المعادلة المحاسبية مع التصدير الرسمي."
      : "Statement of financial position detailing assets, liabilities, and equity with PDF/Excel export.",
  };
}

export default async function BalanceSheetPage({
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

  const rawRows = (rowsData ?? []) as unknown as BalanceSheetAccountRow[];
  const assetRows = rawRows.filter((r) => r.category === "ASSET" && r.balance !== 0);
  const liabilityRows = rawRows.filter((r) => r.category === "LIABILITY" && r.balance !== 0);
  const equityRows = rawRows.filter((r) => r.category === "EQUITY" && r.balance !== 0);
  const revenueTotal = rawRows.filter((r) => r.category === "REVENUE").reduce((s, r) => s + r.balance, 0);
  const expenseTotal = rawRows.filter((r) => r.category === "EXPENSE").reduce((s, r) => s + r.balance, 0);
  const currentEarnings = revenueTotal - expenseTotal;

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <Landmark className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "الميزانية العمومية وقائمة المركز المالي" : "Balance Sheet (Financial Position)"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `بيان الأصول والخصوم وحقوق الملكية وفحص المعادلة المحاسبية كما في ${asOfDate}`
                  : `Statement of assets, liabilities, and equity balances as of ${asOfDate}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <BalanceSheetClient
        assetRows={assetRows}
        liabilityRows={liabilityRows}
        equityRows={equityRows}
        currentEarnings={currentEarnings}
        asOfDate={asOfDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
