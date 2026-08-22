import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AssetsClient, type AssetRow } from "./assets-client";
import { type Option } from "./asset-forms";

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
    title: isAr ? "الأصول الثابتة والإهلاك | AqarBooks" : "Fixed Assets & Depreciation | AqarBooks",
    description: isAr
      ? "سجل الأصول الثابتة، احتساب الإهلاك بالقسط الثابت، وترحيله إلى الدفاتر لكل فترة مالية."
      : "Fixed asset register, straight-line depreciation, and posting to the ledger per fiscal period.",
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

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.assets.manage"),
    hasPermission(organization.id, "finance.assets.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-start">
        <h1 className="text-xl font-bold text-red-900">
          {isAr ? "الأصول الثابتة والإهلاك" : "Fixed Assets & Depreciation"}
        </h1>
        <p className="text-sm text-red-700">
          {isAr
            ? "لا تملك صلاحية الاطلاع على سجل الأصول الثابتة."
            : "You do not have permission to view the fixed asset register."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: assetsRaw }, { data: accounts }, { data: periods }] = await Promise.all([
    supabase.rpc("list_fixed_assets", { p_organization_id: organization.id }),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET", "EXPENSE"])
      .order("code"),
    supabase
      .from("fiscal_periods")
      .select("id, name, start_date, end_date, status")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date"),
  ]);

  const assets = (assetsRaw ?? []) as unknown as AssetRow[];
  const currency = organization.default_currency ?? "EGP";

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;
  const assetAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: label(a) }));
  const expenseAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: label(a) }));
  const deprAccounts: Option[] = assetAccounts;

  const periodOptions: Option[] = (periods ?? []).map((p) => ({
    id: p.id,
    label: `${p.name} (${p.start_date} → ${p.end_date})`,
  }));

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 text-start">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "الأصول الثابتة والإهلاك" : "Fixed Assets & Depreciation"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {isAr ? "القسط الثابت (Straight-Line)" : "Straight-Line"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? "سجل الأصول الثابتة، احتساب الإهلاك الدوري بالقسط الثابت، ترحيل القيود، وإدارة الاستبعاد والتخريد."
              : "Fixed assets register, automated straight-line depreciation, journal postings, and disposal tracking."}
          </p>
        </div>
      </div>

      {/* Main Interactive Client Table & KPIs */}
      <AssetsClient
        assets={assets}
        assetAccounts={assetAccounts}
        deprAccounts={deprAccounts}
        expenseAccounts={expenseAccounts}
        gainAccounts={assetAccounts}
        lossAccounts={expenseAccounts}
        periods={periodOptions}
        canManage={canManage}
        locale={locale}
        currency={currency}
        organizationName={organization.name}
      />
    </div>
  );
}
