import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { Jurisdiction } from "@/lib/einvoice/types";
import { supportedJurisdictions } from "@/lib/einvoice/registry";
import { getCurrencyLabel } from "@/lib/currency";
import { AlertCircle } from "lucide-react";
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

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────
          FILING PROFILES -- the ONLY place an operator can set the taxpayer id,
          choose the environment, or switch filing on. `einvoice-forms.tsx` and
          its two server actions exist but nothing imported them, so the whole
          surface was unreachable in the product while the page still displayed
          the values as read-only text. This has now been lost twice; the
          regression spec that covers it is restored alongside this.
          ────────────────────────────────────────────────────────────────────── */}
      <section aria-label={isAr ? "ملفات الربط الضريبي" : "Filing profiles"} className="space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? "ملفات الربط بالمصالح الضريبية" : "Tax Authority Filing Profiles"}
        </h2>

        <div className="grid gap-3 lg:grid-cols-2">
          {OFFERED.map((jur) => {
            const profile = profiles.find((p) => p.jurisdiction === jur) ?? null;

            // Four derived states. ACTIVE is never claimed from configuration
            // alone: it needs a real verification write, which only a genuine
            // authority round-trip performs.
            const label = !profile
              ? isAr ? "غير مُعد" : "Not configured"
              : profile.enabled
                ? isAr ? "مفعّل — الإرسال يعمل" : "Active — filing on"
                : profile.verified_at
                  ? isAr ? "مُتحقق منه — الإرسال متوقف" : "Verified — filing off"
                  : isAr ? "مُعد — لم يُتحقق منه" : "Configured — not verified";

            return (
              <div
                key={jur}
                data-jurisdiction={jur}
                // Mirrors the ProfileForm remount key below so a test can wait
                // for a save to have actually landed. The remount resets the
                // uncontrolled inputs, so anything typed before it arrives is
                // silently discarded.
                data-profile-updated={profile?.updated_at ?? "new"}
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{jur}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{label}</span>
                </div>

                {profile?.last_verification_error && (
                  <p role="alert" className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    {profile.last_verification_error}
                  </p>
                )}

                {canManage ? (
                  <>
                    <ProfileForm
                      // Remount on every save. The inputs are uncontrolled, so
                      // `defaultValue` applies only at mount: without this key a
                      // save-and-revalidate leaves stale values in the DOM and
                      // the NEXT save posts what the previous render put there
                      // rather than what the operator typed. Here that means a
                      // save can carry the PREVIOUS taxpayer id, which the ADR
                      // 0002 identity guard then has nothing to object to -- so
                      // it succeeds silently. Not cosmetic.
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
                        // Only a recorded verification unlocks filing.
                        canEnable={Boolean(profile.verified_at)}
                        locale={locale}
                      />
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {isAr ? "للاطلاع فقط." : "View only."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

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
      />
    </div>
  );
}
