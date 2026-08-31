import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AlertCircle } from "lucide-react";
import { FixedAssetsClient, type FixedAssetItem } from "./fixed-assets-client";

interface FixedAssetReportRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  status: string;
  acquisition_date: string;
  acquisition_cost: number | string;
  salvage_value: number | string;
  useful_life_months: number;
  accumulated_depreciation: number | string;
  net_book_value: number | string;
  periods_posted: number | string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "سجل الأصول الثابتة والإهلاك المحاسبي — AqarBooks"
      : "Fixed Assets & Depreciation Schedule — AqarBooks",
    description: isAr
      ? "سجل الأصول الثابتة المسجلة فعليًا والإهلاكات المرحلة لها وصافي القيمة الدفترية."
      : "Persisted fixed-asset register, posted depreciation, and net book value.",
  };
}

export default async function FixedAssetsPage({
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

  const [canReport, canAudit, canAssetRead, canAssetManage] = await Promise.all([
    hasPermission(organization.id, "finance.reports.read"),
    hasPermission(organization.id, "finance.audit.read"),
    hasPermission(organization.id, "finance.assets.read"),
    hasPermission(organization.id, "finance.assets.manage"),
  ]);
  const canRead = canReport || canAudit || canAssetRead || canAssetManage;

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "سجل الأصول الثابتة" : "Fixed Assets Schedule"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض سجل الأصول الثابتة."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // Generated Supabase types intentionally trail staging-only migrations.
  // Keep this RPC locally typed until the schema is promoted and types are regenerated.
  const fixedAssetsRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: "get_fixed_assets_report",
    args: { p_organization_id: string },
  ) => Promise<{
    data: FixedAssetReportRow[] | null;
    error: { message: string; code?: string } | null;
  }>;

  const { data, error } = await fixedAssetsRpc("get_fixed_assets_report", {
    p_organization_id: organization.id,
  });
  if (error) throw error;

  const assets: FixedAssetItem[] = (data ?? []).map((row) => ({
    assetCode: row.code,
    name: isAr ? row.name_ar : row.name_en || row.name_ar,
    acquisitionDate: row.acquisition_date,
    cost: Number(row.acquisition_cost),
    salvageValue: Number(row.salvage_value),
    usefulLifeMonths: Number(row.useful_life_months),
    accumulatedDepreciation: Number(row.accumulated_depreciation),
    netBookValue: Number(row.net_book_value),
    periodsPosted: Number(row.periods_posted),
    status: row.status,
  }));

  return (
    <FixedAssetsClient
      assets={assets}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
