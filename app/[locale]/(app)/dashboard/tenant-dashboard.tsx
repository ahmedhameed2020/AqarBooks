import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { buildPermissionChecker } from "@/lib/auth/nav-permissions";
import { isAiAvailable } from "@/lib/ai/availability";
import { ALL_DASHBOARD_KEYS, resolveDashboardAccess, sectionState, type SectionState } from "@/lib/dashboard/finance-visibility";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard, MiniStat } from "./kpi-card";
import { CountUp } from "./count-up";
import { RevenueExpenseTrend, AgingChart, CollectionTargetGauge, type MonthPoint, type AgingPoint } from "./charts";
import { InsightsCard } from "./insights-card";
import { ExecutiveFinancialInsightsCard } from "@/components/ai/executive-financial-insights-card";
import { DashboardActions } from "./dashboard-actions";
import { OccupancyWidget } from "./occupancy-widget";
import { TenantDashboardTabs } from "./tenant-dashboard-tabs";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Receipt,
  FileText,
  ArrowUpRight,
  ShieldAlert,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  Briefcase,
  Layers,
  ShieldCheck,
} from "lucide-react";

const AGING_BUCKETS = [
  { key: "current", labelAr: "غير مستحقة", labelEn: "Current" },
  { key: "d1_30", labelAr: "1-30 يوم", labelEn: "1-30 days" },
  { key: "d31_60", labelAr: "31-60 يوم", labelEn: "31-60 days" },
  { key: "d61_90", labelAr: "61-90 يوم", labelEn: "61-90 days" },
  { key: "d90plus", labelAr: "+90 يوم", labelEn: "90+ days" },
] as const;

function bucketFor(daysOverdue: number): (typeof AGING_BUCKETS)[number]["key"] {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90plus";
}

/**
 * Shown instead of a number when the viewer may not read a section, or when reading it failed.
 * A denied or failed query must never render as 0: zero reads as a real financial result.
 */
function StatePanel({ state, isAr, ar, en }: { state: Exclude<SectionState, "ok">; isAr: boolean; ar: string; en: string }) {
  const denied = state === "denied";
  return (
    <div
      data-state={state}
      role={denied ? "note" : "alert"}
      className="flex h-full min-h-24 items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
    >
      <ShieldAlert className={denied ? "size-5 shrink-0 text-slate-400" : "size-5 shrink-0 text-rose-600"} />
      <span>
        {denied
          ? isAr ? `${ar}: غير متاح لصلاحياتك` : `${en}: not available for your permissions`
          : isAr ? `تعذّر تحميل ${ar}` : `Could not load ${en}`}
      </span>
    </div>
  );
}

export async function TenantDashboard({
  organization,
  locale,
}: {
  organization: { id: string; name: string; default_currency: string };
  locale: Locale;
}) {
  const isAr = locale === "ar";
  const collectionTarget = 90;
  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  // Last 6 calendar months, oldest first, for the trend chart.
  const monthRanges = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return {
      label: new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", { month: "short", timeZone: "UTC" }).format(d),
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const has = await buildPermissionChecker(organization.id, ALL_DASHBOARD_KEYS, user?.id);
  const access = resolveDashboardAccess(has);
  // Receivables need dues AND payments: outstanding = dues minus allocations of POSTED payments, and the
  // payment tables are permission-gated separately. With only one of them the figure would be wrong.
  const wantReceivables = access.dues && access.payments;
  const skipped = { data: null, count: null, error: null } as const;

  const currentPeriodRes = access.periods
    ? await supabase
        .from("fiscal_periods")
        .select("id, name, start_date, end_date")
        .eq("organization_id", organization.id)
        .eq("status", "OPEN")
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null };
  const currentPeriod = currentPeriodRes.data;

  const [
    periodRes,
    duesRes,
    allocRes,
    paymentsRes,
    sessionsRes,
    entriesRes,
    chequesRes,
    unitsRes,
    ownedRes,
    membersRes,
    monthlyRes,
  ] = await Promise.all([
    access.reports && currentPeriod
      ? supabase.rpc("get_trial_balance", {
          p_organization_id: organization.id,
          p_start_date: currentPeriod.start_date,
          p_end_date: currentPeriod.end_date,
        })
      : Promise.resolve(skipped),
    wantReceivables
      ? supabase.from("dues").select("id, amount, due_date, status, unit_id").eq("organization_id", organization.id)
      : Promise.resolve(skipped),
    access.payments
      ? supabase.from("effective_payment_allocations").select("due_id, amount, payment_id")
      : Promise.resolve(skipped),
    access.payments
      ? supabase
          .from("payments")
          .select("id, receipt_number, amount, method, payment_date, status, created_at")
          .eq("organization_id", organization.id)
          .eq("status", "POSTED")
          .order("created_at", { ascending: false })
      : Promise.resolve(skipped),
    access.cashier
      ? supabase
          .from("cashier_sessions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .eq("status", "OPEN")
      : Promise.resolve(skipped),
    access.entries
      ? supabase
          .from("journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .in("status", ["DRAFT", "UNDER_REVIEW"])
      : Promise.resolve(skipped),
    access.cheques
      ? supabase
          .from("cheques")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .in("status", ["RECEIVED", "DEPOSITED"])
      : Promise.resolve(skipped),
    // Units are counted the same way everywhere (property page, dashboard): ACTIVE units, i.e. not archived.
    access.property
      ? supabase
          .from("units_with_financials")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .is("archived_at", null)
      : Promise.resolve(skipped),
    access.property
      ? supabase
          .from("units_with_financials")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organization.id)
          .is("archived_at", null)
          .eq("occupancy_status", "OCCUPIED")
      : Promise.resolve(skipped),
    access.property
      ? supabase.from("members").select("id", { count: "exact", head: true }).eq("organization_id", organization.id)
      : Promise.resolve(skipped),
    access.reports
      ? Promise.all(
          monthRanges.map((m) =>
            supabase.rpc("get_trial_balance", {
              p_organization_id: organization.id,
              p_start_date: m.start,
              p_end_date: m.end,
            }),
          ),
        )
      : Promise.resolve([] as (typeof skipped)[]),
  ]);

  const periodBalance = periodRes.data;
  const dues = duesRes.data;
  const allocations = allocRes.data;
  const payments = paymentsRes.data;
  const openSessions = sessionsRes.count;
  const unpostedEntries = entriesRes.count;
  const outstandingCheques = chequesRes.count;
  const unitsCount = unitsRes.count;
  const ownedCount = ownedRes.count;
  const membersCount = membersRes.count;
  const monthlyBalances = monthlyRes;

  // One state per section: denied (not queried), error (a query failed), or ok. Only "ok" renders figures.
  const reportsState = sectionState(access.reports, [currentPeriodRes, periodRes, ...monthlyRes]);
  const receivablesState = sectionState(wantReceivables, [duesRes, allocRes, paymentsRes]);
  const collectionsState = sectionState(access.payments, [paymentsRes]);
  const entriesState = sectionState(access.entries, [entriesRes]);
  const cashierState = sectionState(access.cashier, [sessionsRes]);
  const chequesState = sectionState(access.cheques, [chequesRes]);
  const propertyState = sectionState(access.property, [unitsRes, ownedRes, membersRes]);

  const revenue = (periodBalance ?? []).filter((r) => r.category === "REVENUE").reduce((s, r) => s + r.balance, 0);
  const expenses = (periodBalance ?? []).filter((r) => r.category === "EXPENSE").reduce((s, r) => s + r.balance, 0);
  const surplus = revenue - expenses;

  const trend: MonthPoint[] = monthRanges.map((m, i) => {
    const rows = monthlyBalances[i]?.data ?? [];
    return {
      month: m.label,
      revenue: rows.filter((r) => r.category === "REVENUE").reduce((s, r) => s + r.balance, 0),
      expenses: rows.filter((r) => r.category === "EXPENSE").reduce((s, r) => s + r.balance, 0),
    };
  });

  const postedIds = new Set((payments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (!postedIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }

  const openDues = (dues ?? []).filter((d) => d.status !== "PAID" && d.status !== "VOID" && d.status !== "DRAFT");
  const outstanding = openDues.reduce((s, d) => s + (d.amount - (paidByDue.get(d.id) ?? 0)), 0);
  const overdue = openDues.filter((d) => d.due_date < today);
  const overdueAmount = overdue.reduce((s, d) => s + (d.amount - (paidByDue.get(d.id) ?? 0)), 0);

  const totalIssued = (dues ?? []).filter((d) => d.status !== "VOID" && d.status !== "DRAFT").reduce((s, d) => s + d.amount, 0);
  const totalCollected = totalIssued - outstanding;
  const collectionRate = totalIssued > 0 ? Math.round((totalCollected / totalIssued) * 100) : null;

  const collectionsToday = (payments ?? []).filter((p) => p.payment_date === today).reduce((s, p) => s + p.amount, 0);
  const collectionsMonth = (payments ?? [])
    .filter((p) => p.payment_date >= monthStart)
    .reduce((s, p) => s + p.amount, 0);

  const recentPayments = (payments ?? []).slice(0, 5);

  const agingData: AgingPoint[] = AGING_BUCKETS.map((b) => ({
    bucket: isAr ? b.labelAr : b.labelEn,
    amount: 0,
  }));
  for (const d of openDues) {
    const remaining = d.amount - (paidByDue.get(d.id) ?? 0);
    if (remaining <= 0) continue;
    const daysOverdue = Math.floor((now.getTime() - new Date(d.due_date).getTime()) / 86400000);
    const idx = AGING_BUCKETS.findIndex((b) => b.key === bucketFor(daysOverdue));
    agingData[idx].amount += remaining;
  }

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currency = organization.default_currency;

  const greeting = new Date().getHours() < 12 ? (isAr ? "صباح الخير" : "Good morning") : isAr ? "مساء الخير" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
    CASH: { ar: "نقدًا", en: "Cash" },
    BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
    CHEQUE: { ar: "شيك", en: "Cheque" },
    OTHER: { ar: "أخرى", en: "Other" },
    ONLINE: { ar: "دفع إلكتروني", en: "Online Payment" },
  };

  // Content 1: Overview Tab
  const overviewContent = (
    <>
      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {reportsState === "ok" ? (
          <>
            <div>
              <KpiCard
                label={isAr ? `إجمالي الإيرادات الاستحقاقية (${currency})` : `Total Revenue — accrual (${currency})`}
                value={currentPeriod ? <CountUp value={revenue} locale={locale} /> : "—"}
                hint={currentPeriod ? currentPeriod.name : isAr ? "لا توجد فترة مفتوحة تشمل تاريخ اليوم" : "No open period contains today"}
                icon={<TrendingUp className="size-5.5" />}
                tone="positive"
              />
            </div>
            <div>
              <KpiCard
                label={isAr ? `إجمالي المصروفات الاستحقاقية (${currency})` : `Total Expenses — accrual (${currency})`}
                value={currentPeriod ? <CountUp value={expenses} locale={locale} /> : "—"}
                hint={currentPeriod ? currentPeriod.name : undefined}
                icon={<TrendingDown className="size-5.5" />}
                tone="warning"
              />
            </div>
            <div>
              <KpiCard
                label={isAr ? "صافي الفائض / العجز المالي" : "Net Surplus / Deficit"}
                value={currentPeriod ? <CountUp value={surplus} locale={locale} /> : "—"}
                icon={<Scale className="size-5.5" />}
                tone={currentPeriod ? (surplus >= 0 ? "positive" : "negative") : "info"}
                changeLabel={
                  currentPeriod
                    ? isAr ? (surplus >= 0 ? "فائض تشغيلي إيجابي" : "عجز مالي") : surplus >= 0 ? "Healthy Margin" : "Deficit Alert"
                    : undefined
                }
              />
            </div>
          </>
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            <StatePanel state={reportsState} isAr={isAr} ar="الإيرادات والمصروفات" en="Revenue and expenses" />
          </div>
        )}
        <div>
          {receivablesState === "ok" ? (
            <KpiCard
              label={isAr ? "الذمم والاستحقاقات القائمة" : "Outstanding Receivables"}
              value={<CountUp value={outstanding} locale={locale} />}
              hint={
                collectionRate !== null
                  ? isAr
                    ? `نسبة التحصيل ${collectionRate}%`
                    : `Collection rate ${collectionRate}%`
                  : undefined
              }
              icon={<Receipt className="size-5.5" />}
              tone={overdueAmount > 0 ? "negative" : "info"}
            />
          ) : (
            <StatePanel state={receivablesState} isAr={isAr} ar="الذمم والاستحقاقات" en="Receivables" />
          )}
        </div>
      </div>

      {reportsState === "ok" && receivablesState === "ok" && (
        <>
        {/* Offered only when an AI provider is configured. Only figures computed above are passed: the card used to
            receive an invented 88.5% occupancy and a 78% "previous month" collection rate. */}
        {isAiAvailable() && (
          <ExecutiveFinancialInsightsCard
            metrics={{
              currency,
              totalDues: totalIssued,
              totalCollected: totalCollected,
              totalArrears: outstanding,
              collectionRatePct: collectionRate ?? 0,
              totalUnits: unitsCount ?? 0,
              topOverdueBucket: overdueAmount > 0 ? { label: isAr ? "+30 يوم" : "+30 days", amount: overdueAmount } : undefined,
              periodLabel: currentPeriod?.name || (isAr ? "الفترة المالية الحالية" : "Current Fiscal Period"),
            }}
            locale={locale}
          />
        )}

        {/* AI Smart Financial Insights Card */}
        <InsightsCard
          collectionRate={collectionRate}
          target={collectionTarget}
          overdueCount={overdue.length}
          overdueAmount={overdueAmount}
          unpostedCount={unpostedEntries}
          outstandingCheques={outstandingCheques}
          surplus={surplus}
          currency={currency}
          locale={locale}
        />
        </>
      )}

      {/* Trend + Aging charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {reportsState === "ok" ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? "الاتجاه الاستحقاقي — إيرادات ومصروفات آخر 6 أشهر" : "Accrual Trend — Revenue vs. Expenses"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? "مقارنة شهرية للإيرادات والمصروفات الاستحقاقية" : "Monthly accrual revenue and expense comparison"}
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              <Layers className="size-3.5 text-purple-600" />
              <span>{isAr ? "مخطط مساحي" : "Area View"}</span>
            </span>
          </div>
          <div className="p-4">
            <RevenueExpenseTrend data={trend} isAr={isAr} currency={currency} />
          </div>
        </section>
        ) : (
          <div className="lg:col-span-2">
            <StatePanel state={reportsState} isAr={isAr} ar="الاتجاه المالي" en="Financial trend" />
          </div>
        )}

        {receivablesState === "ok" ? (
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-800">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {isAr ? "مؤشر التحصيل الإجمالي" : "Cumulative Collection Target"}
            </h2>
          </div>
          <div className="p-4">
            <CollectionTargetGauge rate={collectionRate} target={collectionTarget} isAr={isAr} />
          </div>
          <div className="border-t border-slate-200/80 p-4 dark:border-slate-800">
            <h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "توزيع أعمار الذمم والديون" : "Receivables Aging"}
            </h3>
            <AgingChart data={agingData} isAr={isAr} currency={currency} />
          </div>
        </section>
        ) : (
          <StatePanel state={receivablesState} isAr={isAr} ar="مؤشر التحصيل وأعمار الذمم" en="Collection and receivables aging" />
        )}
      </div>

      {/* Secondary Stats Grid */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4 xl:grid-cols-6">
        {collectionsState === "ok" && (
          <>
            <div>
              <MiniStat label={isAr ? "تحصيلات اليوم" : "Collected today"} value={fmt(collectionsToday)} />
            </div>
            <div>
              <MiniStat label={isAr ? "تحصيلات الشهر" : "Collected this month"} value={fmt(collectionsMonth)} />
            </div>
          </>
        )}
        {receivablesState === "ok" && (
          <div>
            <MiniStat
              label={isAr ? "مستحقات متأخرة" : "Overdue dues"}
              value={String(overdue.length)}
              tone={overdue.length > 0 ? "negative" : undefined}
            />
          </div>
        )}
        {entriesState === "ok" && (
          <div>
            <MiniStat
              label={isAr ? "قيود غير مرحّلة" : "Unposted entries"}
              value={String(unpostedEntries ?? 0)}
              tone={(unpostedEntries ?? 0) > 0 ? "warning" : undefined}
            />
          </div>
        )}
        {cashierState === "ok" && (
          <div>
            <MiniStat label={isAr ? "جلسات كاشير مفتوحة" : "Open sessions"} value={String(openSessions ?? 0)} />
          </div>
        )}
        {chequesState === "ok" && (
          <div>
            <MiniStat label={isAr ? "شيكات قيد التحصيل" : "Pending cheques"} value={String(outstandingCheques ?? 0)} />
          </div>
        )}
        {([collectionsState, receivablesState, entriesState, cashierState, chequesState] as SectionState[]).some((st) => st === "error") && (
          <div className="col-span-2 lg:col-span-4 xl:col-span-6">
            <StatePanel state="error" isAr={isAr} ar="بعض المؤشرات" en="some indicators" />
          </div>
        )}
      </div>

      {/* Tables Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {collectionsState === "ok" ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? "آخر المقبوضات وسندات التحصيل" : "Recent Collections"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? "أحدث الإيصالات التي تم سدادها وترحيلها" : "Latest posted receipts"}
              </p>
            </div>
            <Link
              href="/finance/payments"
              locale={locale}
              className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              {isAr ? "عرض سجل المقبوضات" : "View all payments"}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 dark:border-slate-800">
                <TableHead className="text-xs font-extrabold">{isAr ? "رقم الإيصال" : "Receipt #"}</TableHead>
                <TableHead className="text-xs font-extrabold">{isAr ? "المبلغ" : "Amount"}</TableHead>
                <TableHead className="text-xs font-extrabold">{isAr ? "طريقة الدفع" : "Method"}</TableHead>
                <TableHead className="text-xs font-extrabold">{isAr ? "التاريخ" : "Date"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayments.length ? (
                recentPayments.map((p) => (
                  <TableRow key={p.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 dark:border-slate-800">
                    <TableCell className="font-mono font-extrabold text-purple-600 dark:text-purple-400">#{p.receipt_number}</TableCell>
                    <TableCell className="tabular-nums font-black text-slate-900 dark:text-white">{fmt(p.amount)} {currency}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-bold bg-slate-50 text-slate-700 border-slate-200">
                        {isAr ? METHOD_LABELS[p.method]?.ar : METHOD_LABELS[p.method]?.en}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-medium">{p.payment_date}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-xs font-medium text-slate-500">
                    {isAr ? "لا توجد تحصيلات مسجلة بعد" : "No collections recorded yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        ) : (
          <StatePanel state={collectionsState} isAr={isAr} ar="آخر المقبوضات" en="Recent collections" />
        )}

        {receivablesState === "ok" ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-800">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? "مستحقات متأخرة السداد" : "Overdue Dues"}
                {overdue.length > 0 && (
                  <span className="rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-xs font-extrabold text-rose-700">
                    {fmt(overdueAmount)} {currency}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? "الذمم والمطالبات التي تجاوزت موعد الاستحقاق" : "Dues exceeding due dates"}
              </p>
            </div>
            <Link
              href="/finance/dues"
              locale={locale}
              className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              {isAr ? "تقرير الاستحقاقات" : "Dues report"}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 dark:border-slate-800">
                <TableHead className="text-xs font-extrabold">{isAr ? "المبلغ المتبقي" : "Remaining"}</TableHead>
                <TableHead className="text-xs font-extrabold">{isAr ? "تاريخ الاستحقاق" : "Due date"}</TableHead>
                <TableHead className="text-xs font-extrabold">{isAr ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdue.length ? (
                overdue.slice(0, 5).map((d) => (
                  <TableRow key={d.id} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 dark:border-slate-800">
                    <TableCell className="tabular-nums font-black text-rose-600 dark:text-rose-400">
                      {fmt(d.amount - (paidByDue.get(d.id) ?? 0))} {currency}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-medium">{d.due_date}</TableCell>
                    <TableCell>
                      <Badge variant="destructive" className="text-xs font-extrabold">
                        {isAr ? "متأخر" : "Overdue"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-xs font-bold text-emerald-600">
                    {isAr ? "لا توجد مستحقات متأخرة 🎉" : "No overdue dues 🎉"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        ) : (
          <StatePanel state={receivablesState} isAr={isAr} ar="المستحقات المتأخرة" en="Overdue dues" />
        )}
      </div>
    </>
  );

  // Content 2: Tasks & Approvals Queue Tab
  const tasksContent = (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-5 dark:border-amber-800 dark:bg-amber-950/30">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-amber-900 dark:text-amber-300">
          <ShieldAlert className="size-5 text-amber-600" />
          {isAr ? "قائمة المهام والاعتمادات العاجلة" : "Approvals & Tasks Queue"}
        </h3>
        <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-400">
          {isAr
            ? "هذه العناصر تتطلب اتخاذ إجراء مباشر لضمان دقة القوائم المالية وانضباط الدفاتر المحاسبية."
            : "Actionable priority items requiring executive attention for ledger compliance."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Unposted Journal Entries */}
        {entriesState === "ok" ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="size-4.5 text-blue-600" />
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? "القيود المحاسبية المعلقة" : "Unposted Journal Entries"}
              </h4>
            </div>
            <Badge className="font-black bg-blue-100 text-blue-800 border-blue-200">{unpostedEntries ?? 0}</Badge>
          </div>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            {isAr
              ? "القيود المسودة أو التي تحت المراجعة لا تدخل في القوائم المالية حتى يتم ترحيلها رسمياً."
              : "Draft or review entries do not reflect in general ledger until officially posted."}
          </p>
          <div className="mt-4 flex justify-end">
            <Link
              href="/finance/journals"
              locale={locale}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-bold shadow-xs cursor-pointer"
            >
              {isAr ? "مراجعة وترحيل القيود" : "Review & Post Entries"}
            </Link>
          </div>
        </div>
        ) : (
          <StatePanel state={entriesState} isAr={isAr} ar="القيود المحاسبية المعلقة" en="Unposted journal entries" />
        )}

        {/* Pending Cheques Portfolio */}
        {chequesState === "ok" ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Briefcase className="size-4.5 text-purple-600" />
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? "الشيكات قيد الإيداع والتحصيل" : "Pending Cheques Clearance"}
              </h4>
            </div>
            <Badge className="font-black bg-purple-100 text-purple-800 border-purple-200">{outstandingCheques ?? 0}</Badge>
          </div>
          <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
            {isAr
              ? "شيكات مستلمة من الأعضاء جاهزة للتظهير أو الإيداع في الحساب البنكي."
              : "Received member cheques ready for deposit into primary bank accounts."}
          </p>
          <div className="mt-4 flex justify-end">
            <Link
              href="/finance/cashier"
              locale={locale}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 px-4 py-2 text-xs font-bold shadow-xs cursor-pointer dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {isAr ? "إدارة محافظ الشيكات" : "Manage Cheques"}
            </Link>
          </div>
        </div>
        ) : (
          <StatePanel state={chequesState} isAr={isAr} ar="الشيكات قيد التحصيل" en="Pending cheques" />
        )}
      </div>
    </div>
  );

  // Content 3: Operations & Units Tab
  const operationsContent = (
    <div className="space-y-6">
      {propertyState === "ok" ? (
        <OccupancyWidget
          unitsCount={unitsCount ?? 0}
          ownedCount={ownedCount ?? 0}
          membersCount={membersCount ?? 0}
          locale={locale}
        />
      ) : (
        <StatePanel state={propertyState} isAr={isAr} ar="الوحدات والأعضاء" en="Units and members" />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Executive Hero Banner Header */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Calendar className="size-3.5 text-primary" />
              <span>{greeting}</span>
              <span>·</span>
              <span>{dateLabel}</span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              {organization.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
              {currentPeriod && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-bold text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                  <span>{isAr ? "الفترة المالية الفعالة" : "Active Period"}: {currentPeriod.name}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 font-bold text-foreground border border-border">
                <Scale className="size-3.5 text-muted-foreground" />
                <span>{isAr ? `العملة: ${currency}` : `Currency: ${currency}`}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 font-bold text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300">
                <ShieldCheck className="size-3.5 text-sky-600" />
                <span>{isAr ? "عزل مشفر (RLS 100%)" : "Tenant Isolated"}</span>
              </span>
            </div>
          </div>

          <DashboardActions locale={locale} />
        </div>
      </div>

      {access.periods && (currentPeriodRes.error || !currentPeriod) && (
        <div
          role={currentPeriodRes.error ? "alert" : undefined}
          className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
        >
          <Clock className="size-5 shrink-0 text-amber-600" />
          <span>
            {currentPeriodRes.error
              ? isAr
                ? "تعذر تحميل الفترة المالية"
                : "Unable to load fiscal period"
              : isAr
                ? "تنبيه: لا توجد فترة مالية مفتوحة تشمل تاريخ اليوم. راجع السنة والفترات المالية من (المحاسبة ← الفترات المالية)."
                : "No open fiscal period contains today. Review the calendar from (Finance → Fiscal Periods)."}
          </span>
        </div>
      )}

      {/* Command Center Main Interactive Tabbed Interface */}
      <TenantDashboardTabs
        overviewContent={overviewContent}
        tasksContent={tasksContent}
        operationsContent={operationsContent}
        isAr={isAr}
        unpostedCount={entriesState === "ok" ? (unpostedEntries ?? 0) : 0}
        overdueCount={receivablesState === "ok" ? overdue.length : 0}
      />
    </div>
  );
}
