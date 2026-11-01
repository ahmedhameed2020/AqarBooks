import { sortDepositAccounts } from "@/lib/finance/deposit-accounts";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { getCurrencyLabel } from "@/lib/currency";
import { PaymentsClient, type PaymentItem } from "./payments-client";
import type { CreditApplication } from "./payment-credit-dialog";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { hasPermission } from "@/lib/auth/authorize";
import {
  CreditCard,
  CheckCircle2,
  Receipt,
  Landmark,
  Layers,
  DollarSign,
  TrendingUp,
  Building2,
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
    title: isAr ? "سندات القبض والدفعات المحصلة | AqarBooks" : "Payment Receipts | AqarBooks",
    description: isAr
      ? "إدارة وتسجيل سندات القبض، تحصيل مستحقات الوحدات، وطباعة إيصالات السداد الرسمية."
      : "Manage and record customer payment receipts, dues allocations, and vouchers.",
  };
}

export default async function PaymentsPage({
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

  const denied = await denyIfMissingPermission(organization.id, "finance.payments.read", locale);
  if (denied) return denied;

  // Reading the receipts register says nothing about being allowed to cut a new
  // one, so the record-payment control asks for the create key on its own.
  // record_payment enforces `receivables.payments.create`, NOT
  // `finance.payments.create`. Both keys exist and are currently granted to the
  // same six role templates, so today the two are behaviourally identical --
  // but gating the button on the key the RPC does not check would silently
  // become wrong the moment those grants diverge. Match the enforcement point.
  const [canRecordPayment, canVoidPayment, canApplyCredit, canManageAdvanceAccount] = await Promise.all([
    hasPermission(organization.id, "receivables.payments.create"),
    hasPermission(organization.id, "finance.payments.void"),
    hasPermission(organization.id, "receivables.allocations.manage"),
    hasPermission(organization.id, "finance.accounts.manage"),
  ]);

  const supabase = await createClient();
  const { data: resort } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [
    { data: members },
    { data: units },
    { data: openDues },
    { data: depositRows },
    { data: periods },
    { data: paymentsRaw },
    { data: allocationsRaw },
    { data: duesRaw },
    { data: orgData },
    { data: creditRows },
    { data: advanceSetting },
    { data: liabilityAccounts },
    { data: ownerships },
  ] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("organization_id", organization.id).order("full_name"),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
    supabase
      .from("dues")
      .select("id, unit_id, amount, status")
      .eq("organization_id", organization.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
    // Only accounts the server will accept as a deposit account: the GL account of an active cash box or bank account of this organization
    // (the same rule record_payment / record_advance_payment enforce; the screen list is a convenience, the server is the guard).
    supabase.rpc("list_deposit_accounts", { p_organization_id: organization.id, p_resort_id: resort?.id ?? null }),
    supabase
      .from("fiscal_periods")
      .select("id, name, start_date, end_date")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase
      .from("payments")
      .select("id, receipt_number, amount, unallocated_amount, advance_amount, unit_id, method, payment_date, status, member_id, receipt_no, memo")
      .eq("organization_id", organization.id)
      .order("payment_date", { ascending: false })
      .limit(300),
    supabase.from("effective_payment_allocations").select("id, due_id, amount, payment_id, kind, applied_on"),
    supabase.from("dues").select("id, unit_id, description, due_date").eq("organization_id", organization.id),
    supabase
      .from("organizations")
      .select("default_currency")
      .eq("id", organization.id)
      .maybeSingle(),
    supabase.from("payment_credit_balances").select("payment_id, remaining_amount, is_stranded").eq("organization_id", organization.id),
    resort
      ? supabase.rpc("customer_advance_account_configured", { p_organization_id: organization.id, p_property_id: resort.id })
      : Promise.resolve({ data: false }),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .eq("category", "LIABILITY")
      .order("code"),
    supabase.from("unit_ownerships").select("unit_id, member_id, start_date, end_date").eq("organization_id", organization.id),
  ]);

  const currency = orgData?.default_currency || "EGP";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const memberMap = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const unitMap = new Map((units ?? []).map((u) => [u.id, u.code]));
  const dueMap = new Map((duesRaw ?? []).map((d) => [d.id, d]));

  const creditByPayment = new Map((creditRows ?? []).map((c) => [c.payment_id, c]));
  const applicationsByPayment = new Map<string, CreditApplication[]>();
  (allocationsRaw ?? []).filter((a) => a.kind === "CREDIT_APPLICATION").forEach((a) => {
    const due = dueMap.get(a.due_id);
    const list = applicationsByPayment.get(a.payment_id) ?? [];
    list.push({
      allocationId: a.id,
      dueLabel: `${due ? unitMap.get(due.unit_id) ?? "—" : "—"} — ${due?.description ?? (isAr ? "مطالبة" : "Due")}`,
      amount: Number(a.amount),
      appliedOn: a.applied_on,
    });
    applicationsByPayment.set(a.payment_id, list);
  });

  // Build allocations map per payment
  const allocationsByPayment = new Map<string, { unitCode: string; description: string; dueDate: string; allocatedAmount: number }[]>();
  (allocationsRaw ?? []).forEach((a) => {
    const due = dueMap.get(a.due_id);
    const unitCode = due ? unitMap.get(due.unit_id) || "—" : "—";
    const existing = allocationsByPayment.get(a.payment_id) || [];
    existing.push({
      unitCode,
      description: due?.description || (isAr ? "سداد مطالبة" : "Due Payment"),
      dueDate: due?.due_date || "—",
      allocatedAmount: Number(a.amount),
    });
    allocationsByPayment.set(a.payment_id, existing);
  });

  // Calculate paid amounts by due for select options
  const postedPaymentIds = new Set((paymentsRaw ?? []).filter((p) => p.status === "POSTED").map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocationsRaw ?? []) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }

  const dueOptions = (openDues ?? []).map((d) => ({
    id: d.id,
    unitId: d.unit_id,
    label: `${unitMap.get(d.unit_id) ?? d.unit_id} — ${Number(d.amount).toLocaleString()} ${currencyLabel}`,
    remaining: Math.max(0, Number(d.amount) - (paidByDue.get(d.id) ?? 0)),
  }));

  // Map Payments
  const payments: PaymentItem[] = (paymentsRaw ?? []).map((p) => ({
    id: p.id,
    receipt_number: p.receipt_number != null ? String(p.receipt_number) : "",
    amount: Number(p.amount),
    unallocated_amount: Number(p.unallocated_amount ?? 0),
    method: p.method,
    payment_date: p.payment_date,
    status: p.status,
    member_name: p.member_id ? memberMap.get(p.member_id) : undefined,
    reference: p.receipt_no,
    memo: p.memo,
    allocations: allocationsByPayment.get(p.id) || [],
    unit_id: p.unit_id,
    unit_code: p.unit_id ? unitMap.get(p.unit_id) : undefined,
    advance_amount: Number(p.advance_amount ?? 0),
    credit_remaining: creditByPayment.has(p.id) ? Number(creditByPayment.get(p.id)!.remaining_amount) : 0,
    credit_stranded: creditByPayment.get(p.id)?.is_stranded ?? false,
    applications: applicationsByPayment.get(p.id) ?? [],
  }));

  // KPI Calculations
  const postedPaymentsList = payments.filter((p) => p.status === "POSTED");
  const totalCollections = postedPaymentsList.reduce((sum, p) => sum + p.amount, 0);

  const cashCollections = postedPaymentsList
    .filter((p) => p.method === "CASH")
    .reduce((sum, p) => sum + p.amount, 0);

  const bankCollections = postedPaymentsList
    .filter((p) => p.method === "BANK_TRANSFER" || p.method === "CHEQUE" || p.method === "ONLINE")
    .reduce((sum, p) => sum + p.amount, 0);

  const memberOptions = (members ?? []).map((m) => ({ id: m.id, label: m.full_name }));
  const depositAccountOptions = sortDepositAccounts((depositRows ?? []).map((r) => ({ id: r.account_id, code: r.code, name_ar: r.name_ar, name_en: r.name_en }))).map((a) => ({
    id: a.id,
    label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
  }));
  const periodOptions = (periods ?? []).map((p) => ({ id: p.id, label: p.name, start: p.start_date, end: p.end_date }));
  const today = new Date().toISOString().slice(0, 10);
  const unitOptions = (units ?? []).map((u) => {
    const owners = (ownerships ?? []).filter((o) => o.unit_id === u.id).filter((o) => (!o.start_date || o.start_date <= today) && (!o.end_date || o.end_date >= today));
    return { id: u.id, code: u.code, ownerId: owners.length === 1 ? owners[0].member_id : null };
  });
  const liabilityOptions = (liabilityAccounts ?? []).map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }));
  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;

  return (
    <div className="space-y-6 pb-12">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "سندات القبض والمقبوضات (Payment Receipts)" : "Payment Receipts & Collections"}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {isAr
              ? "إثبات سداد العملاء والملاك، إسقاط الدفعات على المطالبات، وطباعة إيصالات وسندات القبض الرسمية."
              : "Record receipts, allocate collections to dues, and generate official customer receipts."}
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE KPI SUMMARY GRID
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Collections */}
        <KpiCard
          label={isAr ? "إجمالي المقبوضات المحصلة" : "Total Collections"}
          value={
            <>
              {totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? `إجمالي ${postedPaymentsList.length} سند قبض مرحل بالدفاتر`
              : `${postedPaymentsList.length} posted receipts`
          }
          icon={<CheckCircle2 className="size-5" />}
          tone="positive"
        />

        {/* 2. Cash Collections */}
        <KpiCard
          label={isAr ? "مقبوضات نقدية" : "Cash Receipts"}
          value={
            <>
              {cashCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "سيولة محصلة نقدًا بالخزينة"
              : "Cash receipts recorded in the drawer"
          }
          icon={<CreditCard className="size-5" />}
          tone="info"
        />

        {/* 3. Bank & Wire Collections */}
        <KpiCard
          label={isAr ? "تحويلات وشيكات بنكية" : "Bank & Cheque Receipts"}
          value={
            <>
              {bankCollections.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
              <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
            </>
          }
          hint={
            isAr
              ? "مقبوضات مودعة بالحسابات البنكية"
              : "Deposited to bank accounts"
          }
          icon={<Landmark className="size-5" />}
        />

        {/* 4. Total Receipts */}
        <KpiCard
          label={isAr ? "عدد عمليات التحصيل" : "Total Receipts"}
          value={payments.length.toString()}
          hint={
            isAr
              ? "إجمالي سندات القبض المسجلة بالمنظومة"
              : "Total payment transactions"
          }
          icon={<Receipt className="size-5" />}
          tone="positive"
        />
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN CLIENT INTERACTIVE HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {resort ? (
        <PaymentsClient
          payments={payments}
          members={memberOptions}
          dues={dueOptions}
          depositAccounts={depositAccountOptions}
          periods={periodOptions}
          organizationId={organization.id}
          organizationName={organization.name}
          resortId={resort.id}
          resortName={resort.name}
          canRecordPayment={canRecordPayment}
           canVoidPayment={canVoidPayment}
          canApplyCredit={canApplyCredit}
          canManageAdvanceAccount={canManageAdvanceAccount}
          units={unitOptions}
          liabilityAccounts={liabilityOptions}
          advanceAccountConfigured={advanceSetting === true}
          currency={currency}
          locale={locale}
          preselectedUnitId={preselectedUnitId}
        />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="text-sm font-bold">
            {isAr
              ? "يرجى تعريف مشروع / منتجع أولاً لتسجيل سندات القبض."
              : "Please define a property/resort before recording payments."}
          </p>
        </div>
      )}
    </div>
  );
}
