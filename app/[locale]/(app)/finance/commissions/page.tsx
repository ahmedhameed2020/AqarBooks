import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const revalidate = 0;
import {
  CommissionsClient,
  type CommissionRow,
} from "./commissions-client";
import {
  type Option,
  type BrokerItem,
} from "./commission-dialogs";
import {
  UserCheck,
  CreditCard,
  Clock,
  CheckCircle2,
  Percent,
  TrendingDown,
  Building2,
  DollarSign,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "عمولات الوسطاء العقاريين | AqarBooks" : "Broker Commissions | AqarBooks",
    description: isAr
      ? "إدارة واستحقاق وسداد عمولات الوسطاء ومسوقي العقارات مع حساب ضريبة الخصم من المنبع."
      : "Manage broker commission accruals, payouts, withholding tax liabilities, and ledger postings.",
  };
}

export default async function CommissionsPage({
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
    hasPermission(organization.id, "finance.commissions.manage"),
    hasPermission(organization.id, "finance.commissions.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {isAr ? "عمولات الوسطاء" : "Broker Commissions"}
        </h1>
        <p className="text-sm text-slate-500">
          {isAr
            ? "لا تملك صلاحية الاطلاع على عمولات الوسطاء."
            : "You do not have permission to view broker commissions."}
        </p>
      </div>
    );
  }

  const currency = organization.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const supabase = await createClient();
  const [
    { data: brokersRaw },
    { data: commissionsRaw },
    { data: propertiesRaw },
    { data: accountsRaw },
    { data: financeSettingsRaw },
  ] = await Promise.all([
    supabase
      .from("brokers")
      .select("id, name, broker_type, default_wht_rate, tax_id, phone, email, is_active")
      .eq("organization_id", organization.id)
      .order("name"),
    supabase
      .from("commissions")
      .select(
        "id, broker_id, property_id, gross_amount, wht_amount, net_amount, wht_rate, rate_percent, basis_amount, earned_date, paid_date, status, note, cash_account_id, payment_journal_entry_id, accrual_journal_entry_id"
      )
      .eq("organization_id", organization.id)
      .order("earned_date", { ascending: false }),
    supabase
      .from("properties")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("name"),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET", "LIABILITY", "EXPENSE"])
      .order("code"),
    supabase
      .from("organization_finance_settings")
      .select("id, commission_expense_account_id, commission_payable_account_id")
      .eq("organization_id", organization.id)
      .limit(1),
  ]);

  const financeSetting = financeSettingsRaw?.[0] || null;
  const isAccountsConfigured = Boolean(
    financeSetting?.commission_expense_account_id &&
    financeSetting?.commission_payable_account_id
  );

  const commissions: CommissionRow[] = (commissionsRaw ?? []).map((c) => ({
    id: c.id,
    broker_id: c.broker_id,
    property_id: c.property_id,
    gross_amount: Number(c.gross_amount),
    wht_amount: Number(c.wht_amount),
    net_amount: Number(c.net_amount),
    wht_rate: c.wht_rate !== null ? Number(c.wht_rate) : null,
    rate_percent: c.rate_percent !== null ? Number(c.rate_percent) : null,
    basis_amount: c.basis_amount !== null ? Number(c.basis_amount) : null,
    earned_date: c.earned_date,
    paid_date: c.paid_date,
    status: c.status,
    note: c.note,
    cash_account_id: c.cash_account_id,
    payment_journal_entry_id: c.payment_journal_entry_id,
    accrual_journal_entry_id: c.accrual_journal_entry_id,
  }));

  // Calculate totals per broker
  const brokerStats = new Map<string, { total: number; count: number }>();
  for (const c of commissions) {
    const prev = brokerStats.get(c.broker_id) || { total: 0, count: 0 };
    brokerStats.set(c.broker_id, {
      total: prev.total + c.net_amount,
      count: prev.count + 1,
    });
  }

  const brokerList: BrokerItem[] = (brokersRaw ?? []).map((b) => {
    const stats = brokerStats.get(b.id);
    return {
      id: b.id,
      name: b.name,
      broker_type: b.broker_type,
      default_wht_rate: Number(b.default_wht_rate || 0),
      tax_id: b.tax_id,
      phone: b.phone,
      email: b.email,
      is_active: b.is_active,
      totalCommissions: stats?.total ?? 0,
      accruedCount: stats?.count ?? 0,
    };
  });

  const activeBrokers: Option[] = brokerList
    .filter((b) => b.is_active)
    .map((b) => ({ id: b.id, label: b.name }));

  const propertyOptions: Option[] = (propertiesRaw ?? []).map((p) => ({
    id: p.id,
    label: p.name,
  }));

  const label = (a: { code: string; name_ar: string; name_en: string }) =>
    `${a.code} — ${isAr ? a.name_ar : a.name_en}`;

  const cashAccounts: Option[] = (accountsRaw ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({ id: a.id, label: label(a) }));

  const liabilityAccounts: Option[] = (accountsRaw ?? [])
    .filter((a) => a.category === "LIABILITY")
    .map((a) => ({ id: a.id, label: label(a) }));

  const expenseAccounts: Option[] = (accountsRaw ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({ id: a.id, label: label(a) }));

  // ── Executive KPI Financial Summary Calculations ──────────────────
  const outstandingAccrued = commissions
    .filter((c) => c.status === "ACCRUED")
    .reduce((s, c) => s + c.net_amount, 0);

  const totalSettledPaid = commissions
    .filter((c) => c.status === "PAID")
    .reduce((s, c) => s + c.net_amount, 0);

  const totalWithheldTax = commissions.reduce((s, c) => s + c.wht_amount, 0);

  const accruedCount = commissions.filter((c) => c.status === "ACCRUED").length;
  const paidCount = commissions.filter((c) => c.status === "PAID").length;

  return (
    <div className="space-y-8">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {isAr ? "عمولات الوسطاء العقاريين" : "Broker Commissions Management"}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {isAr
            ? "حوكمة استحقاقات وسداد عمولات الوسطاء مع استقطاع ضريبة الخصم من المنبع وترحيل القيود المحاسبية."
            : "Track broker commission accruals, tax withholding obligations, and settlement payouts."}
        </p>
      </div>

      {/* ── Executive KPI Summary Grid ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Outstanding Unpaid Commissions */}
        <KpiCard
          label={isAr ? "مستحق للوسطاء (معلق)" : "Owed to Brokers (Accrued)"}
          value={
            <>
              {outstandingAccrued.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          icon={<Clock className="size-5" />}
          tone={outstandingAccrued > 0 ? "warning" : "positive"}
          hint={isAr ? `${accruedCount} عمولة مستحقة بانتظار السداد` : `${accruedCount} pending payouts`}
        />

        {/* Settled / Paid Commissions */}
        <KpiCard
          label={isAr ? "عمولات مسددة ومصروفة" : "Settled Commissions"}
          value={
            <>
              {totalSettledPaid.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
          hint={isAr ? `تم صرفها عبر ${paidCount} حركة سداد` : `Settled across ${paidCount} records`}
        />

        {/* Withheld Tax (WHT) */}
        <KpiCard
          label={isAr ? "ضريبة منبع محتجزة (التزام)" : "Withheld Tax Liability"}
          value={
            <>
              {totalWithheldTax.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          icon={<Percent className="size-5" />}
          tone="info"
          hint={isAr ? "محتجزة للتوريد لمصلحة الضرائب" : "To be remitted to tax authority"}
        />

        {/* Active Brokers Count */}
        <KpiCard
          label={isAr ? "الوسطاء المعتمدون" : "Active Brokers"}
          value={activeBrokers.length.toLocaleString()}
          icon={<UserCheck className="size-5" />}
          tone="info"
          hint={isAr ? `من إجمالي ${brokerList.length} وسيط مسجل` : `Out of ${brokerList.length} registered`}
        />
      </div>

      {/* ── Main Interactive Table & Client Controls ────────────────── */}
      <CommissionsClient
        commissions={commissions}
        brokers={activeBrokers}
        brokerList={brokerList}
        properties={propertyOptions}
        cashAccounts={cashAccounts}
        liabilityAccounts={liabilityAccounts}
        expenseAccounts={expenseAccounts}
        isAccountsConfigured={isAccountsConfigured}
        initialExpenseAccountId={financeSetting?.commission_expense_account_id}
        initialPayableAccountId={financeSetting?.commission_payable_account_id}
        organizationId={organization.id}
        organizationName={organization.name}
        currency={currency}
        canManage={canManage}
        locale={locale}
      />
    </div>
  );
}
