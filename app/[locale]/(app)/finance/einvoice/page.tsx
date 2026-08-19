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
      .select("id, amount, description, unit_id, units(id, unit_number, property_id, owner_name)")
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
      .select("id, code, property_id, owner_name")
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
      .select("name, tax_id, tax_jurisdiction, default_currency, address, phone")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || organization.default_currency || "EGP";

  const dueUnitMap = new Map<string, { unitNumber?: string; amount?: number; description?: string; ownerName?: string }>();
  for (const d of duesRaw ?? []) {
    const u = d.units as { id?: string; unit_number?: string; owner_name?: string } | null;
    dueUnitMap.set(d.id, {
      unitNumber: u?.unit_number,
      amount: Number(d.amount),
      description: d.description || undefined,
      ownerName: u?.owner_name || undefined,
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
      owner_name: dueInfo?.ownerName,
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
    ownerName: u.owner_name,
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

  return (
    <div className="space-y-6">
      <EInvoiceClient
        taxDecisions={taxDecisions}
        revenueNatures={revenueNatures}
        profiles={profiles}
        organizationId={organization.id}
        organizationName={orgData?.name || organization.name}
        organizationJurisdiction={(orgData?.tax_jurisdiction as string) || (organization.tax_jurisdiction as string) || "EG"}
        organizationTaxId={orgData?.tax_id || organization.tax_id}
        organizationAddress={orgData?.address}
        organizationPhone={orgData?.phone}
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
