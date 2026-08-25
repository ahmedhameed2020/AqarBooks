import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import {
  CashierClient,
  type CashboxRow,
  type CashierSessionRow,
  type CashTransactionRow,
} from "./cashier-client";
import { type Option, type DueItem } from "./cashier-dialogs";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { hasPermission } from "@/lib/auth/authorize";
import {
  CreditCard,
  Clock,
  Receipt,
  Building2,
  TrendingUp,
  Unlock,
  CheckCircle2,
  ShieldCheck,
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
    title: isAr ? "الخزينة ونقاط التحصيل | AqarBooks" : "Cashier & POS Treasury | AqarBooks",
    description: isAr
      ? "إدارة صناديق الخزينة، فتح وإقفال الورديات، إصدار سندات القبض النقدية، وتقارير التسوية Z-Report."
      : "Cash desk operations, opening/closing shifts, POS receipts, and Z-Reports.",
  };
}

export default async function CashierPage({
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

  // Viewing is gated on a read key, not a write key. Gating the page on
  // cashier.transactions.create meant no read-only role -- Auditor, Viewer --
  // could ever see reconciled cashier state, which is exactly the state an
  // auditor exists to inspect. Each mutation below keeps its own write gate.
  const denied = await denyIfMissingPermission(organization.id, "cashier.transactions.read", locale);
  if (denied) return denied;

  const [canCreateCashbox, canOpenSession, canCloseSession, canCollect] = await Promise.all([
    hasPermission(organization.id, "finance.accounts.manage"),
    hasPermission(organization.id, "cashier.sessions.open"),
    hasPermission(organization.id, "cashier.sessions.close"),
    hasPermission(organization.id, "cashier.transactions.create"),
  ]);

  const supabase = await createClient();

  // 1. Get Primary Resort / Property
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // 2. Fetch Cashboxes, Sessions, Accounts, Fiscal Periods, Transactions, Dues, Units
  const [
    { data: cashboxesRaw },
    { data: sessionsRaw },
    { data: transactionsRaw },
    { data: accountsRaw },
    { data: periodsRaw },
    { data: duesRaw },
    { data: unitsRaw },
    { data: allocationsRaw },
    { data: postedPaymentsRaw },
    { data: orgData },
    { data: ownershipsRaw },
  ] = await Promise.all([
    supabase
      .from("cashboxes")
      .select("id, name, gl_account_id, is_active")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("cashier_sessions")
      .select("id, cashbox_id, opened_by, opening_balance, status, expected_closing_balance, actual_closing_balance, variance, opened_at, closed_at")
      .eq("organization_id", organization.id)
      .order("opened_at", { ascending: false }),
    supabase
      .from("cash_transactions")
      .select("id, session_id, type, amount, payment_id, description, created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["ASSET"])
      .order("code"),
    supabase
      .from("fiscal_periods")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .limit(1),
    supabase
      .from("dues")
      .select("id, unit_id, description, due_date, amount, status")
      .eq("organization_id", organization.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .order("due_date", { ascending: true }),
    supabase
      .from("units")
      .select("id, code")
      .eq("organization_id", organization.id),
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
    // `dues` links to a unit, not a member; the payer is the unit's current owner.
    supabase
      .from("unit_ownerships")
      .select("unit_id, member_id, is_primary_contact")
      .eq("organization_id", organization.id)
      .is("end_date", null),
  ]);

  // Current owner per unit, preferring the primary contact when a unit is co-owned.
  const ownerByUnit = new Map<string, string>();
  for (const o of ownershipsRaw ?? []) {
    if (o.is_primary_contact || !ownerByUnit.has(o.unit_id)) {
      ownerByUnit.set(o.unit_id, o.member_id);
    }
  }

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Accounts mapping
  const accountMap = new Map((accountsRaw ?? []).map((a) => [a.id, a]));
  const assetAccountOptions: Option[] = (accountsRaw ?? []).map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));

  // Cashboxes mapped
  const cashboxMap = new Map((cashboxesRaw ?? []).map((b) => [b.id, b.name]));
  const cashboxes: CashboxRow[] = (cashboxesRaw ?? []).map((b) => {
    const acc = accountMap.get(b.gl_account_id);
    return {
      id: b.id,
      name: b.name,
      gl_account_id: b.gl_account_id,
      gl_account_code: acc?.code,
      gl_account_name: acc ? (isAr ? acc.name_ar : acc.name_en) : undefined,
      is_active: b.is_active,
    };
  });

  // Calculate transaction totals per session
  const receiptsBySession = new Map<string, number>();
  const paymentsBySession = new Map<string, number>();
  for (const t of transactionsRaw ?? []) {
    if (t.type === "RECEIPT") {
      receiptsBySession.set(t.session_id, (receiptsBySession.get(t.session_id) ?? 0) + Number(t.amount));
    } else if (t.type === "PAYMENT") {
      paymentsBySession.set(t.session_id, (paymentsBySession.get(t.session_id) ?? 0) + Number(t.amount));
    }
  }

  // Sessions mapped
  const sessions: CashierSessionRow[] = (sessionsRaw ?? []).map((s) => {
    const totalReceipts = receiptsBySession.get(s.id) ?? 0;
    const totalPayments = paymentsBySession.get(s.id) ?? 0;
    const opening = Number(s.opening_balance);
    const currentCash = opening + totalReceipts - totalPayments;
    const cashbox = cashboxes.find((b) => b.id === s.cashbox_id);

    return {
      id: s.id,
      cashbox_id: s.cashbox_id,
      cashbox_name: cashbox?.name || (isAr ? "خزينة" : "Cashbox"),
      gl_account_code: cashbox?.gl_account_code,
      opening_balance: opening,
      expected_closing_balance: s.expected_closing_balance !== null ? Number(s.expected_closing_balance) : null,
      actual_closing_balance: s.actual_closing_balance !== null ? Number(s.actual_closing_balance) : null,
      variance: s.variance !== null ? Number(s.variance) : null,
      status: s.status,
      opened_at: s.opened_at,
      closed_at: s.closed_at,
      total_receipts: totalReceipts,
      total_payments: totalPayments,
      current_cash: currentCash,
    };
  });

  // Calculate Unit remaining balances for dues
  const postedSet = new Set((postedPaymentsRaw ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocationsRaw ?? []) {
    if (postedSet.has(a.payment_id)) {
      paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
    }
  }

  const unitCodeMap = new Map((unitsRaw ?? []).map((u) => [u.id, u.code]));

  const dueItems: DueItem[] = (duesRaw ?? [])
    .map((d) => {
      const orig = Number(d.amount);
      const paid = paidByDue.get(d.id) ?? 0;
      const remaining = Math.max(0, orig - paid);
      return {
        id: d.id,
        unit_id: d.unit_id,
        unit_code: unitCodeMap.get(d.unit_id) || (isAr ? "وحدة" : "Unit"),
        member_id: ownerByUnit.get(d.unit_id) ?? null,
        title: d.description || (isAr ? "مستحق خدمات" : "Service Due"),
        due_date: d.due_date,
        original_amount: orig,
        remaining_amount: remaining,
      };
    })
    .filter((d) => d.remaining_amount > 0);

  // Cash Transactions mapped
  const transactions: CashTransactionRow[] = (transactionsRaw ?? []).map((t) => {
    const s = sessions.find((sess) => sess.id === t.session_id);
    return {
      id: t.id,
      session_id: t.session_id,
      cashbox_name: s?.cashbox_name,
      type: t.type,
      amount: Number(t.amount),
      payment_id: t.payment_id,
      description: t.description,
      created_at: t.created_at,
    };
  });

  // KPI Metrics
  const activeOpenSessions = sessions.filter((s) => s.status === "OPEN");
  const totalCashInDrawers = activeOpenSessions.reduce((sum, s) => sum + s.current_cash, 0);
  const totalLifetimeReceipts = (transactionsRaw ?? [])
    .filter((t) => t.type === "RECEIPT")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const fiscalPeriodId = periodsRaw?.[0]?.id;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "إدارة الخزينة ونقاط التحصيل (POS)" : "Cashier & POS Treasury"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "متابعة أرصدة صناديق الخزينة، الورديات المفتوحة، تحصيل المستحقات نقداً، وإصدار تقارير التسوية Z-Report."
              : "Control cashboxes, active cashier shifts, cash receipts, and shift Z-Reports."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI CARDS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Cash In Drawers */}
        <KpiCard
          label={isAr ? "النقدية في الورديات المفتوحة" : "Active Cash In Drawers"}
          value={
            <>
              {totalCashInDrawers.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي النقدية المتواجدة حالياً بالدرج عبر ${activeOpenSessions.length} وردية نشطة`
              : `Total cash float & receipts across ${activeOpenSessions.length} open shift(s)`
          }
          icon={<CreditCard className="size-5" />}
          tone="positive"
        />

        {/* 2. Open Shifts */}
        <KpiCard
          label={isAr ? "الورديات المفتوحة حالياً" : "Active Open Shifts"}
          value={`${activeOpenSessions.length} / ${cashboxes.length}`}
          hint={
            isAr
              ? "جلسات الخزينة قيد العمل والتحصيل الآن"
              : "Cashier shifts currently open & active"
          }
          icon={<Unlock className="size-5" />}
          tone="info"
        />

        {/* 3. Total Cash Receipts */}
        <KpiCard
          label={isAr ? "إجمالي المقبوضات النقدية" : "Total Cash Receipts"}
          value={
            <>
              {totalLifetimeReceipts.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "إجمالي المبالغ النقدية المحصلة بالخزائن"
              : "Total cash collected from dues & payments"
          }
          icon={<Receipt className="size-5" />}
          tone="info"
        />

        {/* 4. Total Cashboxes */}
        <KpiCard
          label={isAr ? "صناديق الخزينة المسجلة" : "Configured Cashboxes"}
          value={cashboxes.length.toString()}
          hint={
            isAr
              ? "صناديق الخزينة ونقاط التحصيل المعرفة بالمنشأة"
              : "Total physical and virtual cash drawers"
          }
          icon={<Building2 className="size-5" />}
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {resort ? (
        <CashierClient
          cashboxes={cashboxes}
          sessions={sessions}
          transactions={transactions}
          dues={dueItems}
          assetAccounts={assetAccountOptions}
          organizationId={organization.id}
          organizationName={organization.name}
          resortId={resort.id}
          resortName={resort.name}
          fiscalPeriodId={fiscalPeriodId}
          currency={currency}
          locale={locale}
          canCreateCashbox={canCreateCashbox}
          canOpenSession={canOpenSession}
          canCloseSession={canCloseSession}
          canCollect={canCollect}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="text-sm font-bold">
            {isAr
              ? "يرجى تعريف مشروع / منتجع أولاً لربط الخزائن به."
              : "Please define at least one resort/property before managing cashboxes."}
          </p>
        </div>
      )}
    </div>
  );
}
