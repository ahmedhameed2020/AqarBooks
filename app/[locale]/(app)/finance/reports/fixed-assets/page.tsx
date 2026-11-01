import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Layers, AlertCircle } from "lucide-react";
import { FixedAssetsClient, type FixedAssetItem } from "./fixed-assets-client";

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
      ? "حصر الأصول الرأسمالية والمعدات والمنشآت، معدلات الإهلاك السنوية، ومجمع الإهلاك وصافي القيمة الدفترية."
      : "Fixed assets register tracking capital equipment, acquisition cost, accumulated depreciation, and Net Book Value (NBV).",
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.audit.read"));

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
  const [
    { data: assetsRaw, error: assetsError },
    { data: depRaw, error: depError },
    { data: accountsRaw },
  ] = await Promise.all([
    supabase
      .from("fixed_assets")
      .select("id, code, name_ar, name_en, asset_account_id, acquisition_date, acquisition_cost, salvage_value, useful_life_months, status")
      .eq("organization_id", organization.id),
    supabase
      .from("fixed_asset_depreciation")
      .select("fixed_asset_id, amount")
      .eq("organization_id", organization.id),
    supabase
      .from("chart_of_accounts")
      .select("id, name_ar, name_en")
      .eq("organization_id", organization.id),
  ]);

  // A failed read is a failure, never an empty register.
  if (assetsError || depError) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تعذر تحميل سجل الأصول" : "The asset register could not be loaded"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لم تُقرأ البيانات من قاعدة البيانات. أعد المحاولة؛ لا تُعرض أرقام ناقصة."
            : "Data could not be read from the database. Try again; no partial numbers are shown."}
        </p>
      </div>
    );
  }

  const accountsById = new Map((accountsRaw ?? []).map((a) => [a.id, a]));
  const depreciationByAsset = new Map<string, number>();
  for (const row of depRaw ?? []) {
    depreciationByAsset.set(
      row.fixed_asset_id,
      (depreciationByAsset.get(row.fixed_asset_id) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const assets: FixedAssetItem[] = (assetsRaw ?? [])
    .map((asset) => {
      const cost = Number(asset.acquisition_cost ?? 0);
      const salvage = Number(asset.salvage_value ?? 0);
      const lifeMonths = Number(asset.useful_life_months ?? 0);
      const accumulated = depreciationByAsset.get(asset.id) ?? 0;
      const years = lifeMonths > 0 ? lifeMonths / 12 : 0;
      const account = asset.asset_account_id ? accountsById.get(asset.asset_account_id) : undefined;
      return {
        assetCode: asset.code,
        name: (isAr ? asset.name_ar : asset.name_en) || asset.name_ar || asset.name_en,
        category: (isAr ? account?.name_ar : account?.name_en) || account?.name_ar || account?.name_en || "—",
        purchaseDate: asset.acquisition_date ?? "",
        cost,
        depreciationRate: years > 0 ? 100 / years : 0,
        annualDepreciation: years > 0 ? (cost - salvage) / years : 0,
        accumulatedDepreciation: accumulated,
        netBookValue: cost - accumulated,
        status: asset.status,
      };
    })
    .sort((a, b) => a.assetCode.localeCompare(b.assetCode));

  return (
    <FixedAssetsClient
      assets={assets}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
