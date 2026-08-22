import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { Jurisdiction } from "@/lib/einvoice/types";
import { supportedJurisdictions } from "@/lib/einvoice/registry";
import { getCurrencyLabel } from "@/lib/currency";
import { AlertCircle, Shield } from "lucide-react";
import {
  EInvoiceClient,
  type EInvoiceProfileData,
  type TaxDecisionItem,
  type RevenueNatureItem,
  type FormOption,
} from "./einvoice-client";
import { ProfileForm, FilingToggle } from "./einvoice-forms";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OFFERED: Jurisdiction[] = supportedJurisdictions();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "الفوترة والإقرارات الضريبية الإلكترونية — عقار بوكس"
      : "E-Invoicing & Statutory Tax Compliance — AqarBooks",
    description: isAr
      ? "إدارة الربط مع مصلحة الضرائب وهيئات الزكاة والضريبة، وسجل القرارات الضريبية لجميع الإيرادات والمطالبات."
      : "Manage tax authority integrations, statutory profiles, and revenue tax decision stamps.",
  };
}

export default async function EInvoicePage({
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
    hasPermission(organization.id, "finance.einvoice.manage"),
    hasPermission(organization.id, "finance.einvoice.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "الفوترة والإقرارات الضريبية" : "E-Invoicing & Tax Compliance"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية الاطلاع على إعدادات الفوترة والامتثال الضريبي."
            : "You don't have permission to view e-invoicing and tax settings."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [
    { data: profilesRaw },
    { data: decisionsRaw },
    { data: duesRaw },
    { data: naturesRaw },
    { data: resortsRaw },
    { data: unitsRaw },
    { data: dueTypesRaw },
    { data: accountsRaw },
    { data: periodsRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("einvoice_profiles")
      .select("id, jurisdiction, environment, taxpayer_id, branch_code, activity_code, status, enabled, verified_at, last_verification_error, updated_at")
      .eq("organization_id", organization.id),
    supabase
      .from("tax_decisions")
      .select("id, source_type, source_id, revenue_nature, transaction_date, tax_decision_snapshot, decided_at, taxable_base, vat_amount, gross_amount")
      .eq("organization_id", organization.id)
      .order("decided_at", { ascending: false })
      .limit(100),
    supabase
      .from("dues")
      .select("id, amount, description, unit_id, units(id, code, property_id)")
      .eq("organization_id", organization.id),
    supabase
      .from("revenue_natures")
      .select("code, name_ar, name_en, is_derived")
      .order("sort_order"),
    supabase
      .from("resorts")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name"),
    supabase
      .from("units")
      .select("id, code, property_id")
      .eq("organization_id", organization.id)
      .order("code"),
    supabase
      .from("due_types")
      .select("id, name_ar, name_en, default_revenue_account_id")
      .eq("organization_id", organization.id)
      .order("name_ar"),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("fiscal_periods")
      .select("id, name, status")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, name, slug, default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || organization.default_currency || "EGP";

  const dueUnitMap = new Map<string, { unitNumber?: string; amount?: number; description?: string }>();
  for (const d of duesRaw ?? []) {
    const u = d.units as { id?: string; code?: string } | null;
    dueUnitMap.set(d.id, {
      unitNumber: u?.code,
      amount: Number(d.amount),
      description: d.description || undefined,
    });
  }

  const natureMap = new Map((naturesRaw ?? []).map((n) => [n.code, isAr ? n.name_ar : n.name_en]));

  // Map Decisions
  const taxDecisions: TaxDecisionItem[] = (decisionsRaw ?? []).map((td) => {
    const snap = (td.tax_decision_snapshot as any) || {};
    const dueInfo = dueUnitMap.get(td.source_id);
    const base = td.taxable_base !== null ? Number(td.taxable_base) : (dueInfo?.amount ?? 0);
    const rate = Number(snap.vat_rate ?? 0);
    const vat = td.vat_amount !== null ? Number(td.vat_amount) : (base * rate) / 100;
    const gross = td.gross_amount !== null ? Number(td.gross_amount) : base + vat;

    return {
      id: td.id,
      source_type: td.source_type,
      source_id: td.source_id,
      unit_code: dueInfo?.unitNumber ? (isAr ? `الوحدة ${dueInfo.unitNumber}` : `Unit ${dueInfo.unitNumber}`) : undefined,
      description: dueInfo?.description,
      nature_name: natureMap.get(td.revenue_nature) || td.revenue_nature,
      taxable_base: base,
      vat_rate: rate,
      vat_amount: vat,
      gross_amount: gross,
      decided_at: td.transaction_date || td.decided_at.slice(0, 10),
      is_exempt: snap.tax_treatment === "EXEMPT" || rate === 0,
    };
  });

  const profiles: EInvoiceProfileData[] = (profilesRaw ?? []).map((p) => ({
    id: p.id,
    jurisdiction: p.jurisdiction,
    environment: p.environment,
    taxpayer_id: p.taxpayer_id,
    branch_code: p.branch_code,
    activity_code: p.activity_code,
    status: p.status,
    enabled: p.enabled,
    verified_at: p.verified_at,
    last_verification_error: p.last_verification_error,
    updated_at: p.updated_at,
  }));

  const revenueNatures: RevenueNatureItem[] = (naturesRaw ?? []).map((n) => ({
    code: n.code,
    name_ar: n.name_ar,
    name_en: n.name_en,
    is_derived: n.is_derived,
  }));

  const resorts: FormOption[] = (resortsRaw ?? []).map((r) => ({
    id: r.id,
    label: r.name,
  }));

  const units = (unitsRaw ?? []).map((u) => ({
    id: u.id,
    label: u.code,
    propertyId: u.property_id,
  }));

  const dueTypes: FormOption[] = (dueTypesRaw ?? []).map((d) => ({
    id: d.id,
    label: isAr ? d.name_ar : d.name_en,
  }));

  const receivableAccounts: FormOption[] = (accountsRaw ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({
      id: a.id,
      label: `${a.code} - ${isAr ? a.name_ar : a.name_en}`,
    }));

  const periods: FormOption[] = (periodsRaw ?? []).map((p) => ({
    id: p.id,
    label: p.name,
  }));

  const primaryProfile = profiles[0];
  const jurisdiction = primaryProfile?.jurisdiction || "EG";
  const taxId = primaryProfile?.taxpayer_id || null;

  const filingProfilesSection = (
    <details
      open
      key="filing-profiles-section"
      className="group rounded-3xl border border-slate-200/80 bg-white/95 dark:border-slate-800/80 dark:bg-slate-900/95 shadow-sm transition-all overflow-hidden backdrop-blur-md"
    >
      <summary className="flex items-center justify-between p-4 sm:px-6 cursor-pointer select-none bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-900/70 dark:hover:bg-slate-800/60 transition-colors list-none">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20">
            <Shield className="size-4.5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isAr ? "بوابات الربط والامتثال بالمصالح وهيئات الضرائب" : "Tax Authority Gateways & Compliance Profiles"}</span>
              <span className="rounded-md bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[9px] font-mono font-black px-1.5 py-0.2">
                ETA / ZATCA
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? "إعدادات الربط المباشر، المفاتيح المشفرة، وبيانات الاعتماد الرسمية لكل ولاية ضريبية" : "Direct API credentials, encrypted keys, and statutory parameters"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-3 py-1.5 rounded-xl border border-purple-200/60 dark:border-purple-800/60">
          <span className="group-open:hidden">{isAr ? "إظهار بوابات الربط ▾" : "Show Gateways ▾"}</span>
          <span className="hidden group-open:inline">{isAr ? "طي بوابات الربط ▴" : "Collapse ▴"}</span>
        </div>
      </summary>

      <section
        aria-label={isAr ? "ملفات الربط الضريبي" : "Filing profiles"}
        className="p-4 sm:p-6 pt-3 space-y-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-950/30"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {OFFERED.map((jur) => {
            const profile = profiles.find((p) => p.jurisdiction === jur) ?? null;

            const label = !profile
              ? isAr ? "غير مُعد" : "Not configured"
              : profile.enabled
                ? isAr ? "مفعّل — الإرسال اللحظي يعمل" : "Active — auto-filing"
                : profile.verified_at
                  ? isAr ? "مُتحقق منه — بانتظار التفعيل" : "Verified — ready"
                  : isAr ? "مُعد — بانتظار التحقق" : "Configured — unverified";

            const isEg = jur.startsWith("EG");
            const isSa = jur.startsWith("SA");
            const flag = isEg ? "🇪🇬" : isSa ? "🇸🇦" : "🇦🇪";
            const title = isEg
              ? isAr ? "مصلحة الضرائب المصرية (ETA - الفاتورة والإيصال)" : "Egyptian Tax Authority (ETA E-Invoice & Receipt)"
              : isSa
              ? isAr ? "هيئة الزكاة والضريبة والجمارك (ZATCA - فاتورة)" : "Zakat, Tax & Customs Authority (ZATCA Fatoora)"
              : isAr ? "الهيئة الاتحادية للضرائب" : "Federal Tax Authority";

            return (
              <div
                key={jur}
                data-jurisdiction={jur}
                data-profile-updated={profile?.updated_at ?? "new"}
                className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900/90 transition-all hover:border-purple-300 dark:hover:border-purple-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl shrink-0">{flag}</span>
                    <div>
                      <span className="font-mono text-xs font-black text-slate-900 dark:text-white block">
                        {jur}
                      </span>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {title}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                        !profile
                          ? "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                          : profile.enabled
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800"
                          : profile.verified_at
                          ? "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800"
                          : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          profile?.enabled
                            ? "bg-emerald-500 animate-pulse"
                            : profile?.verified_at
                            ? "bg-blue-500"
                            : "bg-slate-400"
                        }`}
                      />
                      <span>{label}</span>
                    </span>
                  </div>
                </div>

                {profile?.last_verification_error && (
                  <p role="alert" className="text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2 rounded-xl border border-rose-200 dark:border-rose-900/50">
                    {profile.last_verification_error}
                  </p>
                )}

                {canManage ? (
                  <div className="space-y-3 pt-1">
                    <ProfileForm
                      key={`${jur}-${profile?.updated_at ?? "new"}`}
                      organizationId={organization.id}
                      jurisdiction={jur}
                      environment={(profile?.environment as "SANDBOX" | "PRODUCTION") ?? "SANDBOX"}
                      taxpayerId={profile?.taxpayer_id ?? null}
                      branchCode={profile?.branch_code ?? null}
                      activityCode={profile?.activity_code ?? null}
                      locale={locale}
                    />
                    {profile && (
                      <FilingToggle
                        profileId={profile.id}
                        enabled={profile.enabled}
                        canEnable={Boolean(profile.verified_at)}
                        locale={locale}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {isAr ? "للاطلاع فقط (غير مصرح بالتعديل)." : "View only."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </details>
  );

  return (
    <div className="space-y-6">
      <EInvoiceClient
        taxDecisions={taxDecisions}
        revenueNatures={revenueNatures}
        profiles={profiles}
        organizationId={organization.id}
        organizationName={orgData?.name || organization.name}
        organizationJurisdiction={jurisdiction}
        organizationTaxId={taxId}
        currency={currency}
        locale={locale}
        resorts={resorts}
        units={units}
        dueTypes={dueTypes}
        receivableAccounts={receivableAccounts}
        periods={periods}
        profilesSlot={filingProfilesSection}
      />
    </div>
  );
}
