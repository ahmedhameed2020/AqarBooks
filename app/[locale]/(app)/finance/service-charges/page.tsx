import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  ServiceChargesClient,
  type LevyItem,
} from "./service-charges-client";
import { type Option } from "./service-charges-dialog";
import {
  Layers,
  CheckCircle2,
  Clock,
  Building2,
  Scale,
  DollarSign,
  TrendingUp,
} from "lucide-react";

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
    title: isAr ? "رسوم ومطالبات الخدمة والصيانة | AqarBooks" : "Service Charges & Levies | AqarBooks",
    description: isAr
      ? "توزيع تكاليف تشغيل المناطق المشتركة على الوحدات، احتساب الأنصبة، وإصدار المطالبات."
      : "Calculate service charge shares, allocate maintenance costs, and issue unit demands.",
  };
}

export default async function ServiceChargesPage({
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
    hasPermission(organization.id, "finance.service_charges.manage"),
    hasPermission(organization.id, "finance.service_charges.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "رسوم الخدمة" : "Service Charges"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على رسوم الخدمة."
            : "You don't have permission to view service charges."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [
    { data: leviesRaw },
    { data: propertiesRaw },
    { data: dueTypesRaw },
    { data: accountsRaw },
    { data: orgData },
  ] = await Promise.all([
    supabase
      .from("service_charge_levies")
      .select("id, name, property_id, period_start, period_end, total_amount, allocation_basis, status")
      .eq("organization_id", organization.id)
      .order("period_end", { ascending: false }),
    supabase
      .from("resorts")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name"),
    supabase
      .from("due_types")
      .select("id, name_ar, name_en")
      .eq("organization_id", organization.id)
      .order("name_ar"),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en")
      .eq("organization_id", organization.id)
      .eq("category", "ASSET")
      .eq("is_group", false)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const propertyMap = new Map((propertiesRaw ?? []).map((p) => [p.id, p.name]));
  const propertyOptions: Option[] = (propertiesRaw ?? []).map((p) => ({ id: p.id, label: p.name }));
  const dueTypeOptions: Option[] = (dueTypesRaw ?? []).map((t) => ({
    id: t.id,
    label: isAr ? t.name_ar : t.name_en,
  }));
  const accountOptions: Option[] = (accountsRaw ?? []).map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));

  // Map Levies
  const levies: LevyItem[] = (leviesRaw ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    property_id: l.property_id,
    property_name: propertyMap.get(l.property_id),
    period_start: l.period_start,
    period_end: l.period_end,
    total_amount: Number(l.total_amount),
    allocation_basis: l.allocation_basis,
    status: l.status,
  }));

  // KPI Calculations
  const issuedLevies = levies.filter((l) => l.status === "ISSUED");
  const draftLevies = levies.filter((l) => l.status === "DRAFT");
  const totalLevyVolume = levies.reduce((sum, l) => sum + l.total_amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "رسوم ومطالبات الخدمة والصيانة (Service Charges)" : "Service Charges & Levies"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "توزيع تكاليف تشغيل وصيانة المناطق المشتركة على الوحدات المستفيدة بأساس محاسبي عادل وموثق."
              : "Recover operational costs of common areas from benefiting units on a defensible basis."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Levies Amount */}
        <KpiCard
          label={isAr ? "إجمالي رسوم الخدمات الموزعة" : "Total Levies Volume"}
          value={
            <>
              {totalLevyVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `عبر ${levies.length} تحصيلة تشغيلية`
              : `${levies.length} total levies`
          }
          icon={<Scale className="size-5" />}
          tone="info"
        />

        {/* 2. Issued Levies */}
        <KpiCard
          label={isAr ? "تحصيلات صادرة ومعتمدة" : "Issued Levies"}
          value={issuedLevies.length.toString()}
          hint={
            isAr
              ? "تم توزيعها وإصدار مطالبات للوحدات"
              : "Active & issued to unit accounts"
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 3. Draft Levies */}
        <KpiCard
          label={isAr ? "تحصيلات قيد الحساب والتوزيع" : "Draft Levies"}
          value={draftLevies.length.toString()}
          hint={
            isAr
              ? "مسودات بانتظار اعتماد الأوزان والأنصبة"
              : "Pending share validation & issue"
          }
          icon={<Clock className="size-5" />}
          tone={draftLevies.length > 0 ? "warning" : "positive"}
        />

        {/* 4. Properties Covered */}
        <KpiCard
          label={isAr ? "المشاريع والعقارات المعرفة" : "Properties Covered"}
          value={(propertiesRaw ?? []).length.toString()}
          hint={
            isAr
              ? "عقارات خاضعة لرسوم الخدمات والصيانة"
              : "Active properties under management"
          }
          icon={<Building2 className="size-5" />}
          tone="info"
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      <ServiceChargesClient
        levies={levies}
        properties={propertyOptions}
        dueTypes={dueTypeOptions}
        receivableAccounts={accountOptions}
        organizationId={organization.id}
        canManage={canManage}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
