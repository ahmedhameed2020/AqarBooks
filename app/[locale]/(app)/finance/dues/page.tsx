import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import { DuesClient, type DueItem } from "./dues-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Building2,
  DollarSign,
  Layers,
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
    title: isAr ? "المستحقات ومطالبات الوحدات | AqarBooks" : "Receivable Dues & Demands | AqarBooks",
    description: isAr
      ? "إدارة وإصدار مستحقات الوحدات العقارية، متابعة التحصيل، وتوليد قيود الاستحقاق."
      : "Manage unit receivable dues, payment allocations, and lease billing.",
  };
}

export default async function DuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { locale } = await params;
  const { unit: unitParam } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.dues.read", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const adminClient = createAdminClient();

  const [
    { error: sweepError },
    { data: units },
    { data: dueTypes },
    { data: accounts },
    { data: periods },
    { data: duesRaw },
    { data: allocations },
    { data: postedPayments },
    { data: orgData },
  ] = await Promise.all([
    adminClient.rpc("run_lease_rent_generation"),
    supabase.from("units").select("id, code").eq("organization_id", organization.id).order("code"),
    supabase.from("due_types").select("id, name_ar, name_en").eq("organization_id", organization.id),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase
      .from("dues")
      .select("id, unit_id, due_type_id, amount, due_date, status, description, created_at")
      .eq("organization_id", organization.id)
      .order("due_date", { ascending: false })
      .limit(300),
    supabase
      .from("payment_allocations")
      .select("due_id, amount, payment_id"),
    supabase
      .from("payments")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "POSTED"),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  if (sweepError) {
    console.error("[DuesPage] run_lease_rent_generation failed:", sweepError.message);
  }

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Maps
  const postedPaymentIds = new Set((postedPayments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }

  const unitMap = new Map((units ?? []).map((u) => [u.id, u.code]));
  const dueTypeMap = new Map((dueTypes ?? []).map((d) => [d.id, isAr ? d.name_ar : d.name_en]));

  // Map Dues
  const dues: DueItem[] = (duesRaw ?? []).map((d) => {
    const amount = Number(d.amount);
    const paid = paidByDue.get(d.id) ?? 0;
    const remaining = Math.max(0, amount - paid);

    return {
      id: d.id,
      unit_id: d.unit_id,
      unit_code: unitMap.get(d.unit_id) || "—",
      due_type_name: d.due_type_id ? dueTypeMap.get(d.due_type_id) : undefined,
      amount,
      paid_amount: paid,
      remaining_amount: remaining,
      due_date: d.due_date,
      status: d.status,
      description: d.description,
    };
  });

  // KPI Calculations
  const totalIssued = dues.reduce((sum, d) => sum + d.amount, 0);
  const totalPaid = dues.reduce((sum, d) => sum + d.paid_amount, 0);
  const totalRemaining = dues.reduce((sum, d) => sum + d.remaining_amount, 0);
  const overdueList = dues.filter((d) => d.status === "OVERDUE" || (d.remaining_amount > 0 && new Date(d.due_date) < new Date()));
  const totalOverdue = overdueList.reduce((sum, d) => sum + d.remaining_amount, 0);

  const revenueAccounts = (accounts ?? []).filter((a) => a.category === "REVENUE");
  const assetAccounts = (accounts ?? []).filter((a) => a.category === "ASSET");
  const unitOptions = (units ?? []).map((u) => ({ id: u.id, label: u.code }));
  const dueTypeOptions = (dueTypes ?? []).map((d) => ({ id: d.id, label: isAr ? d.name_ar : d.name_en }));
  const periodOptions = (periods ?? []).map((p) => ({ id: p.id, label: p.name }));
  const receivableAccountOptions = assetAccounts.map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));

  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "المستحقات ومطالبات الوحدات (Dues & Demands)" : "Receivable Dues & Demands"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "إصدار وإدارة مستحقات الصيانة والإيجارات على الوحدات، متابعة التحصيل، والترحيل لدفتر الأستاذ."
              : "Track maintenance, rental and utility demands, collect payments, and manage balances."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Issued */}
        <KpiCard
          label={isAr ? "إجمالي المستحقات الصادرة" : "Total Issued Dues"}
          value={
            <>
              {totalIssued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي ${dues.length} مطالبة مسجلة بالدفاتر`
              : `${dues.length} total demands recorded`
          }
          icon={<FileText className="size-5" />}
          tone="info"
        />

        {/* 2. Total Collected */}
        <KpiCard
          label={isAr ? "إجمالي المحصل والمقبوض" : "Total Collected"}
          value={
            <>
              {totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `نسبة تحصيل ${totalIssued > 0 ? Math.round((totalPaid / totalIssued) * 100) : 0}% من إجمالي المطالبات`
              : `${totalIssued > 0 ? Math.round((totalPaid / totalIssued) * 100) : 0}% collection rate`
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 3. Outstanding Balance */}
        <KpiCard
          label={isAr ? "الرصيد المتبقي قيد التحصيل" : "Outstanding Balance"}
          value={
            <>
              {totalRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "مبالغ مستحقة جارية بانتظار السداد"
              : "Pending receivables under collection"
          }
          icon={<Clock className="size-5" />}
          tone={totalRemaining > 0 ? "warning" : "positive"}
        />

        {/* 4. Overdue Demands */}
        <KpiCard
          label={isAr ? "مستحقات متأخرة تجاوزت موعدها" : "Overdue Receivables"}
          value={
            <>
              {totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? overdueList.length > 0 ? `${overdueList.length} مطالبة متأخرة بحاجة للتحصيل الفوري` : "لا توجد متأخرات"
              : `${overdueList.length} overdue demands`
          }
          icon={<AlertTriangle className="size-5" />}
          tone={overdueList.length > 0 ? "negative" : "positive"}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {resort ? (
        <DuesClient
          dues={dues}
          units={unitOptions}
          dueTypes={dueTypeOptions}
          revenueAccounts={revenueAccounts}
          receivableAccounts={receivableAccountOptions}
          periods={periodOptions}
          organizationId={organization.id}
          resortId={resort.id}
          currency={currency}
          locale={locale}
          preselectedUnitId={preselectedUnitId}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="text-sm font-bold">
            {isAr
              ? "يرجى تعريف مشروع / منتجع أولاً لإصدار ومتابعة المستحقات."
              : "Please define a property/resort before managing dues."}
          </p>
        </div>
      )}
    </div>
  );
}
