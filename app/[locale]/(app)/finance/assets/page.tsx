import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { getCurrencyLabel } from "@/lib/currency";
import type { Locale } from "@/i18n/routing";
import { RegisterAssetForm, RunDepreciationForm, type Option } from "./asset-forms";

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

type AssetRow = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  status: string;
  acquisition_date: string;
  acquisition_cost: number | string;
  salvage_value: number | string;
  useful_life_months: number;
  accumulated: number | string;
  net_book_value: number | string;
  remaining: number | string;
  periods_posted: number | string;
};

const n = (v: number | string) => Number(v ?? 0);

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

  // RLS already empties the register for someone without the permission, so
  // without this the page would render in full with zeroes and a form that
  // fails on submit. A stated refusal is the honest version.
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "الأصول الثابتة والإهلاك" : "Fixed Assets & Depreciation"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على سجل الأصول الثابتة."
            : "You don't have permission to view the fixed asset register."}
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
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const money = (v: number) =>
    v.toLocaleString(isAr ? "ar-EG" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;
  const assetAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: label(a) }));
  const expenseAccounts: Option[] = (accounts ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: label(a) }));
  // Accumulated depreciation is a contra-ASSET, so it is chosen from the same
  // list rather than a separate one -- there is no CONTRA category.
  const accumulatedAccounts = assetAccounts;

  const periodOptions: Option[] = (periods ?? []).map((p) => ({
    id: p.id,
    label: `${p.name} (${p.start_date} → ${p.end_date})`,
  }));

  const totalCost = assets.reduce((s, a) => s + n(a.acquisition_cost), 0);
  const totalAccum = assets.reduce((s, a) => s + n(a.accumulated), 0);
  const totalNbv = assets.reduce((s, a) => s + n(a.net_book_value), 0);
  const active = assets.filter((a) => a.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {isAr ? "الأصول الثابتة والإهلاك" : "Fixed Assets & Depreciation"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "القسط الثابت. الإهلاك يُرحَّل مرة واحدة لكل أصل ولكل فترة، وإعادة التشغيل بلا أثر."
            : "Straight line. Depreciation posts once per asset per period, and re-running is a no-op."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { k: "count", label: isAr ? "أصول نشطة" : "Active assets", v: String(active.length) },
          { k: "cost", label: isAr ? "إجمالي التكلفة" : "Total cost", v: money(totalCost) },
          { k: "accum", label: isAr ? "مجمع الإهلاك" : "Accumulated", v: money(totalAccum) },
          { k: "nbv", label: isAr ? "القيمة الدفترية" : "Net book value", v: money(totalNbv) },
        ].map((c) => (
          <div key={c.k} data-kpi={c.k} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold" dir="ltr">{c.v}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <section aria-label={isAr ? "ترحيل الإهلاك" : "Run depreciation"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "ترحيل إهلاك فترة" : "Post a period's depreciation"}</h2>
          {periodOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "لا توجد فترة مالية مفتوحة. الإهلاك لا يُرحَّل إلى فترة مقفلة."
                : "No open fiscal period. Depreciation cannot post into a closed one."}
            </p>
          ) : (
            <RunDepreciationForm
              organizationId={organization.id}
              periods={periodOptions}
              locale={locale}
            />
          )}
        </section>
      )}

      {canManage && (
        <section aria-label={isAr ? "تسجيل أصل" : "Register asset"} className="space-y-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium">{isAr ? "تسجيل أصل ثابت" : "Register a fixed asset"}</h2>
          {assetAccounts.length === 0 || expenseAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "يلزم وجود حساب أصل وحساب مصروف في دليل الحسابات قبل تسجيل أصل."
                : "An asset account and an expense account must exist in the chart of accounts first."}
            </p>
          ) : (
            <RegisterAssetForm
              organizationId={organization.id}
              assetAccounts={assetAccounts}
              accumulatedAccounts={accumulatedAccounts}
              expenseAccounts={expenseAccounts}
              locale={locale}
            />
          )}
        </section>
      )}

      <section aria-label={isAr ? "السجل" : "Register"} className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{isAr ? "سجل الأصول" : "Asset register"}</h2>
          <Badge variant="outline">{assets.length}</Badge>
        </div>

        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا أصول مسجّلة بعد." : "No assets registered yet."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2.5 text-start">{isAr ? "الكود" : "Code"}</th>
                  <th className="p-2.5 text-start">{isAr ? "الأصل" : "Asset"}</th>
                  <th className="p-2.5 text-end">{isAr ? "التكلفة" : "Cost"}</th>
                  <th className="p-2.5 text-end">{isAr ? "مجمع الإهلاك" : "Accumulated"}</th>
                  <th className="p-2.5 text-end">{isAr ? "القيمة الدفترية" : "Net book value"}</th>
                  <th className="p-2.5 text-end">{isAr ? "أقساط" : "Instalments"}</th>
                  <th className="p-2.5 text-start">{isAr ? "الحالة" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    data-asset={a.code}
                    data-status={a.status}
                    data-nbv={n(a.net_book_value)}
                  >
                    <td className="p-2.5 font-mono">{a.code}</td>
                    <td className="p-2.5">{isAr ? a.name_ar : a.name_en}</td>
                    <td className="p-2.5 text-end font-mono" dir="ltr">{money(n(a.acquisition_cost))}</td>
                    <td className="p-2.5 text-end font-mono" dir="ltr">{money(n(a.accumulated))}</td>
                    <td className="p-2.5 text-end font-mono font-semibold" dir="ltr">
                      {money(n(a.net_book_value))} <span className="text-xs font-normal text-muted-foreground">{currencyLabel}</span>
                    </td>
                    <td className="p-2.5 text-end font-mono" dir="ltr">
                      {n(a.periods_posted)}/{a.useful_life_months}
                    </td>
                    <td className="p-2.5">
                      <Badge variant={a.status === "ACTIVE" ? "secondary" : "outline"}>
                        {a.status === "ACTIVE"
                          ? isAr ? "نشط" : "Active"
                          : a.status === "FULLY_DEPRECIATED"
                            ? isAr ? "مُستنفَد" : "Fully depreciated"
                            : isAr ? "مُستبعَد" : "Disposed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
