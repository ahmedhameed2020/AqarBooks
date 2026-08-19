import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import type { Jurisdiction } from "@/lib/einvoice/types";
import { supportedJurisdictions } from "@/lib/einvoice/registry";
import { getCurrencyLabel } from "@/lib/currency";
import {
  FileCheck2,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Landmark,
  Percent,
  Receipt,
  Scale,
} from "lucide-react";
import {
  EInvoiceClient,
  type EInvoiceProfileData,
  type TaxDecisionItem,
  type RevenueNatureItem,
} from "./einvoice-client";

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
      .select("id, amount, units(unit_number)")
      .eq("organization_id", organization.id),
    supabase
      .from("revenue_natures")
      .select("code, name_ar, name_en, is_derived")
      .order("sort_order"),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const dueUnitMap = new Map<string, { unitNumber?: string; amount?: number }>();
  for (const d of duesRaw ?? []) {
    const u = d.units as { unit_number?: string } | null;
    dueUnitMap.set(d.id, {
      unitNumber: u?.unit_number,
      amount: Number(d.amount),
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
    jurisdiction: p.jurisdiction as Jurisdiction,
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

  // KPI calculations
  const totalTaxableBase = taxDecisions.reduce((sum, d) => sum + d.taxable_base, 0);
  const totalOutputVat = taxDecisions.reduce((sum, d) => sum + d.vat_amount, 0);
  const activeProfilesCount = profiles.filter((p) => p.status === "ACTIVE" || p.enabled).length;

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
                {isAr ? "الفوترة والإقرارات الضريبية الإلكترونية" : "E-Invoicing & Statutory Tax Compliance"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "إدارة منظومات الفوترة والربط مع مصلحة الضرائب (ETA / ZATCA / PEPPOL) وقرارات الوعاء الضريبي."
                  : "Tax authority integration profiles, statutory compliance, and revenue tax decision stamps."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE TAX COMPLIANCE KPIS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Stamped Tax Decisions */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "القرارات الضريبية المعتمدة" : "Stamped Tax Decisions"}
            </span>
            <div className="rounded-xl p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <FileCheck2 className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {taxDecisions.length}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{isAr ? "قرار مختوم" : "records"}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "تخضع للرقابة والامتثال الضريبي" : "Legally stamped & frozen"}</span>
          </div>
        </div>

        {/* KPI 2: Total Taxable Base */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "الوعاء الضريبي الخاضع" : "Taxable Base Volume"}
            </span>
            <div className="rounded-xl p-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {totalTaxableBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currencyLabel}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "إجمالي صافي الإيرادات المسجلة" : "Net revenue before VAT"}</span>
          </div>
        </div>

        {/* KPI 3: Output VAT */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "ضريبة القيمة المضافة المحتسبة" : "Output VAT (Generated)"}
            </span>
            <div className="rounded-xl p-2 bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <Percent className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-purple-600 dark:text-purple-400">
              {totalOutputVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currencyLabel}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-600 font-bold">
            <span>{isAr ? "ضريبة المخرجات المستحقة لمصلحة الضرائب" : "Payable output VAT"}</span>
          </div>
        </div>

        {/* KPI 4: Integration Readiness */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "حالة الربط الضريبي" : "Tax Authority Status"}
            </span>
            <div className="rounded-xl p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {activeProfilesCount > 0 ? (isAr ? "جاهز ومفعل" : "Live & Active") : (isAr ? "بيئة تجريبية" : "Sandbox")}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{OFFERED.length} {isAr ? "منظومات ضريبية مدعومة" : "tax jurisdictions"}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT HUB (TABS & REGISTERS)
          ────────────────────────────────────────────────────────────────────────── */}
      <EInvoiceClient
        offeredJurisdictions={OFFERED}
        profiles={profiles}
        taxDecisions={taxDecisions}
        revenueNatures={revenueNatures}
        organizationId={organization.id}
        canManage={canManage}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
