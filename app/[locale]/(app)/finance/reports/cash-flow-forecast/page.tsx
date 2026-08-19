import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { TrendingUp, AlertCircle } from "lucide-react";
import { CashFlowForecastClient, type ForecastPeriodRow } from "./cash-flow-forecast-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير توقعات التدفق النقدي والسيولة المستقبلية (Cash Forecast) — عقار بوكس"
      : "Cash Flow Forecast & Liquidity Projection — AqarBooks",
    description: isAr
      ? "تخطيط استباقي للسيولة المالية لـ 30 و 60 و 90 يوماً القادمة عبر نمذجة الشيكات، الإيجارات، وفواتير الموردين."
      : "Forward-looking 30/60/90-day cash flow projection modeling expected inflows, supplier obligations, and net cash runway.",
  };
}

export default async function CashFlowForecastPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.treasury.read"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "توقعات التدفق النقدي" : "Cash Flow Forecast"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير توقعات التدفق النقدي."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Opening cash comes from the general ledger — `banks` holds no balance.
  const today = new Date().toISOString().slice(0, 10);
  const { data: cashPosition } = await supabase.rpc("get_cash_position", {
    p_organization_id: organization.id,
    p_as_of_date: today,
  });

  const initialCash = Number(cashPosition ?? 0);

  // 2. Fetch Incoming and Outgoing Cheques
  const { data: chequesData } = await supabase
    .from("cheques")
    .select("id, amount, direction, due_date, status")
    .eq("organization_id", organization.id)
    .in("status", ["RECEIVED", "DEPOSITED"]);

  // 3. Fetch Due Receivables (Inflows)
  const { data: duesData } = await supabase
    .from("dues")
    .select("id, amount, due_date, status")
    .eq("organization_id", organization.id)
    .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

  // 4. Fetch Unpaid Supplier Invoices (Outflows)
  const { data: invoicesData } = await supabase
    .from("supplier_invoices")
    .select("id, amount, due_date, status")
    .eq("organization_id", organization.id)
    .in("status", ["POSTED", "PARTIALLY_PAID"]);

  // Neither dues nor supplier_invoices store a paid amount; both are settled
  // through their allocation tables.
  const [{ data: dueAllocations }, { data: postedPayments }, { data: supplierAllocations }] =
    await Promise.all([
      supabase
        .from("payment_allocations")
        .select("due_id, amount, payment_id")
        .in("due_id", (duesData ?? []).map((d) => d.id)),
      supabase
        .from("payments")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("status", "POSTED"),
      supabase
        .from("supplier_payment_allocations")
        .select("invoice_id, amount, reversed_at")
        .in("invoice_id", (invoicesData ?? []).map((i) => i.id)),
    ]);

  const postedPaymentIds = new Set((postedPayments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of dueAllocations ?? []) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }

  const paidByInvoice = new Map<string, number>();
  for (const a of supplierAllocations ?? []) {
    if (a.reversed_at) continue;
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + Number(a.amount));
  }

  const now = Date.now();
  const getDaysDiff = (dStr?: string | null) => {
    if (!dStr) return 0;
    return Math.floor((new Date(dStr).getTime() - now) / (1000 * 60 * 60 * 24));
  };

  const buckets = [
    { periodLabelAr: "الأسبوع الحالي (1-7 أيام)", periodLabelEn: "Week 1 (1-7 Days)", maxDays: 7 },
    { periodLabelAr: "الأسبوعين القادمين (8-14 يوماً)", periodLabelEn: "Week 2 (8-14 Days)", maxDays: 14 },
    { periodLabelAr: "خلال شهر (15-30 يوماً)", periodLabelEn: "Month 1 (15-30 Days)", maxDays: 30 },
    { periodLabelAr: "خلال شهرين (31-60 يوماً)", periodLabelEn: "Month 2 (31-60 Days)", maxDays: 60 },
    { periodLabelAr: "خلال 3 أشهر (61-90 يوماً)", periodLabelEn: "Month 3 (61-90 Days)", maxDays: 90 },
  ];

  let runningBalance = initialCash;
  const rows: ForecastPeriodRow[] = buckets.map((b, idx) => {
    const prevDays = idx === 0 ? 0 : buckets[idx - 1].maxDays;

    // Inflows from Cheques + Dues
    const incomingCheques = (chequesData || [])
      .filter((c) => c.direction === "INCOMING" && getDaysDiff(c.due_date) >= prevDays && getDaysDiff(c.due_date) <= b.maxDays)
      .reduce((s, c) => s + Number(c.amount || 0), 0);

    const rentInflows = (duesData || [])
      .filter((d) => getDaysDiff(d.due_date) >= prevDays && getDaysDiff(d.due_date) <= b.maxDays)
      .reduce((s, d) => s + Math.max(0, Number(d.amount || 0) - (paidByDue.get(d.id) ?? 0)), 0);

    // Only committed, recorded inflows -- no assumed "other income".
    const totalInflow = incomingCheques + rentInflows;

    // Outflows from Outgoing Cheques + Supplier Invoices + Fixed OpEx
    const outgoingCheques = (chequesData || [])
      .filter((c) => c.direction === "OUTGOING" && getDaysDiff(c.due_date) >= prevDays && getDaysDiff(c.due_date) <= b.maxDays)
      .reduce((s, c) => s + Number(c.amount || 0), 0);

    const supplierOutflow = (invoicesData || [])
      .filter((inv) => getDaysDiff(inv.due_date) >= prevDays && getDaysDiff(inv.due_date) <= b.maxDays)
      .reduce((s, inv) => s + Math.max(0, Number(inv.amount || 0) - (paidByInvoice.get(inv.id) ?? 0)), 0);

    // Likewise no assumed fixed operating cost -- an outflow has to exist as a
    // cheque or a supplier invoice to appear here.
    const totalOutflow = outgoingCheques + supplierOutflow;

    const netChange = totalInflow - totalOutflow;
    const startBal = runningBalance;
    runningBalance += netChange;

    return {
      periodKey: `P-${b.maxDays}`,
      periodName: isAr ? b.periodLabelAr : b.periodLabelEn,
      startingCash: startBal,
      incomingCheques,
      receivablesInflow: rentInflows,
      totalInflow,
      supplierPayables: supplierOutflow,
      outgoingCheques,
      totalOutflow,
      netChange,
      projectedEndingCash: runningBalance,
      isDeficit: runningBalance < 0,
    };
  });

  return (
    <CashFlowForecastClient
      rows={rows}
      initialCash={initialCash}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
