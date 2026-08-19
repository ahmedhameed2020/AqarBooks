import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import {
  BarChart3,
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  FileSpreadsheet,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Calendar,
  Layers,
  FileText,
  PieChart,
  DollarSign,
  Receipt,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "مركز التقارير والقوائم المالية — عقار بوكس"
      : "Financial Reports & Statements Hub — AqarBooks",
    description: isAr
      ? "القوائم المالية الختامية المعتمدة، موازين المراجعة، دفاتر الأستاذ، والتحليلات المحاسبية مع التصدير المباشر."
      : "Statutory financial statements, trial balances, general ledgers, and cash flow reports with instant PDF/Excel exports.",
  };
}

const FINANCIAL_STATEMENTS = [
  {
    href: "/finance/reports/trial-balance",
    titleAr: "ميزان المراجعة بالمجاميع والأرصدة",
    titleEn: "Trial Balance",
    descAr: "كشف شامل لأرصدة وحركات كافة الحسابات المدينة والدائنة مع فحص التوازن الفوري.",
    descEn: "Comprehensive summary of debit and credit balances with automated balance integrity check.",
    icon: Scale,
    badgeAr: "أساسي",
    badgeEn: "Core",
    color: "from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    href: "/finance/reports/income-statement",
    titleAr: "قائمة الدخل والأرباح والخسائر",
    titleEn: "Income Statement (P&L)",
    descAr: "بيان شامل للإيرادات المحققة والمصروفات التشغيلية وصافي الفائض أو العجز المالي.",
    descEn: "Full report of revenues, operating expenditures, and net period surplus or deficit.",
    icon: TrendingUp,
    badgeAr: "قائمة ختامية",
    badgeEn: "Statutory",
    color: "from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    href: "/finance/reports/balance-sheet",
    titleAr: "الميزانية العمومية والمركز المالي",
    titleEn: "Balance Sheet",
    descAr: "بيان الأصول المتداولة والثابتة، الخصوم والالتزامات، وحقوق الملكية وفحص المعادلة المحاسبية.",
    descEn: "Statement of financial position: assets, liabilities, and equity balances.",
    icon: Landmark,
    badgeAr: "قائمة ختامية",
    badgeEn: "Statutory",
    color: "from-purple-500/10 to-pink-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    href: "/finance/reports/cash-flow",
    titleAr: "قائمة التدفقات النقدية",
    titleEn: "Cash Flow Statement",
    descAr: "حركة السيولة والتدفقات النقدية من الأنشطة التشغيلية والاستثمارية والتمويلية.",
    descEn: "Inflows and outflows across operational, investing, and financing activities.",
    icon: Wallet,
    badgeAr: "سيولة",
    badgeEn: "Liquidity",
    color: "from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400",
  },
  {
    href: "/finance/reports/general-ledger",
    titleAr: "دفتر الأستاذ العام التفصيلي",
    titleEn: "General Ledger",
    descAr: "كشف حساب تفصيلي لأي حساب بالدليل المحاسبي بالحركات والقيود والرصيد التراكمي.",
    descEn: "Itemized transaction statement with journal references and running balance.",
    icon: BookOpen,
    badgeAr: "تفصيلي",
    badgeEn: "Itemized",
    color: "from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:text-cyan-400",
  },
] as const;

const OPERATIONAL_REPORTS = [
  {
    href: "/finance/reports/aging",
    titleAr: "تقرير أعمار الديون والتحصيل",
    titleEn: "Receivables Aging Report",
    descAr: "تحليل الذمم المدينة وتصنيف فترات الاستحقاق المتأخرة حسب الوحدات والأعضاء.",
    descEn: "Analysis of aged receivables and delinquency periods across units and members.",
    icon: Clock,
    badgeAr: "تحصيل",
    badgeEn: "Collections",
    color: "from-rose-500/10 to-red-500/10 text-rose-600 dark:text-rose-400",
  },
  {
    href: "/finance/reports/budget-vs-actual",
    titleAr: "الموازنة التقديرية مقابل الفعلي",
    titleEn: "Budget vs Actual Analysis",
    descAr: "مقارنة الصرف والإيراد الفعلي بالموازنات المعتمدة واحتساب نسبة الانحراف.",
    descEn: "Variance analysis comparing approved fiscal budget targets to actual financial activity.",
    icon: PieChart,
    badgeAr: "موازنات",
    badgeEn: "Budgeting",
    color: "from-violet-500/10 to-purple-500/10 text-violet-600 dark:text-violet-400",
  },
] as const;

export default async function ReportsIndexPage({
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

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: currentPeriod } = await supabase
    .from("fiscal_periods")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .eq("status", "OPEN")
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [{ data: periodTrialBalance }, { data: dues }, { data: allocations }, { data: postedPayments }] =
    await Promise.all([
      currentPeriod
        ? supabase.rpc("get_trial_balance", {
            p_organization_id: organization.id,
            p_start_date: currentPeriod.start_date,
            p_end_date: currentPeriod.end_date,
          })
        : Promise.resolve({ data: null }),
      supabase.from("dues").select("id, amount, due_date, status").eq("organization_id", organization.id),
      supabase.from("payment_allocations").select("due_id, amount, payment_id"),
      supabase.from("payments").select("id").eq("organization_id", organization.id).eq("status", "POSTED"),
    ]);

  const postedIds = new Set((postedPayments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (!postedIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }
  const openDues = (dues ?? []).filter((d) => d.status !== "PAID" && d.status !== "VOID");
  const outstandingReceivables = openDues.reduce((s, d) => s + (d.amount - (paidByDue.get(d.id) ?? 0)), 0);
  const overdueDuesCount = openDues.filter((d) => d.due_date < today).length;

  const revenueTotal = (periodTrialBalance ?? [])
    .filter((r) => r.category === "REVENUE")
    .reduce((s, r) => s + r.balance, 0);
  const expenseTotal = (periodTrialBalance ?? [])
    .filter((r) => r.category === "EXPENSE")
    .reduce((s, r) => s + r.balance, 0);
  const surplus = revenueTotal - expenseTotal;

  const [{ count: openSessionsCount }, { count: unpostedCount }] = await Promise.all([
    supabase
      .from("cashier_sessions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .in("status", ["DRAFT", "UNDER_REVIEW"]),
  ]);

  const currency = organization.default_currency || "EGP";
  const fmt = (n: number) =>
    n.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="space-y-7">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports & Statements Hub"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "القوائم المالية الختامية المعتمدة، موازين المراجعة، دفاتر الأستاذ، مع التصدير الرسمي للـ PDF والإكسل."
                  : "Statutory financial statements, trial balances, general ledgers, and operational reports with instant exports."}
              </p>
            </div>
          </div>
        </div>

        {currentPeriod && (
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
            <Calendar className="size-3.5 text-purple-600" />
            <span className="text-slate-500 font-semibold">{isAr ? "الفترة المالية المفتوحة:" : "Active Period:"}</span>
            <span className="font-bold text-slate-900 dark:text-white">{currentPeriod.name}</span>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          EXECUTIVE FINANCIAL SUMMARY KPIS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Revenue */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "إجمالي الإيرادات (الفترة)" : "Total Revenue"}
            </span>
            <div className="rounded-xl p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {fmt(revenueTotal)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "إجمالي الإيرادات المسجلة" : "Gross recorded revenue"}</span>
          </div>
        </div>

        {/* KPI 2: Expenses */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "المصروفات التشغيلية" : "Operating Expenses"}
            </span>
            <div className="rounded-xl p-2 bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <TrendingDown className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
              {fmt(expenseTotal)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{isAr ? "مصروفات الفترة الحالية" : "Period expenditures"}</span>
          </div>
        </div>

        {/* KPI 3: Net Surplus / Deficit */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "صافي الفائض / العجز" : "Net Surplus / Deficit"}
            </span>
            <div className={`rounded-xl p-2 ${surplus >= 0 ? "bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"}`}>
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className={`font-mono text-2xl font-black tracking-tight ${surplus >= 0 ? "text-purple-600 dark:text-purple-400" : "text-amber-600 dark:text-amber-400"}`}>
              {fmt(surplus)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-purple-600 font-bold">
            <span>{surplus >= 0 ? (isAr ? "فائض تشغيلي محقق" : "Net operational surplus") : (isAr ? "عجز تشغيلي مؤقت" : "Operational deficit")}</span>
          </div>
        </div>

        {/* KPI 4: Receivables & Risk */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:shadow-md">
          <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? "ذمم مدينة غير محصلة" : "Outstanding Receivables"}
            </span>
            <div className="rounded-xl p-2 bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Receipt className="size-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {fmt(outstandingReceivables)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{currency}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span>{overdueDuesCount} {isAr ? "مستحق متأخر" : "overdue items"}</span>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 1: STATUTORY FINANCIAL STATEMENTS (القوائم المالية الختامية)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-purple-600" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "القوائم المالية والحسابات الختامية" : "Statutory Financial Statements"}
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {isAr ? "معتمدة وفق معايير المحاسبة الدولية (IFRS)" : "IFRS Compliant"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FINANCIAL_STATEMENTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.href}
                href={r.href}
                locale={locale as Locale}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-purple-800/80"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${r.color} shadow-xs`}>
                      <Icon className="size-5" />
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      {isAr ? r.badgeAr : r.badgeEn}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {isAr ? r.titleAr : r.titleEn}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1 line-clamp-2">
                      {isAr ? r.descAr : r.descEn}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs font-bold text-purple-600 dark:text-purple-400">
                  <span>{isAr ? "استعراض وتصدير التقرير" : "View & Export"}</span>
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          SECTION 2: OPERATIONAL & BUDGETING REPORTS (التحليلات والموازنات)
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-blue-600" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "التحليلات التشغيلية وإدارة الموازنات" : "Operational Analysis & Budgeting"}
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {isAr ? "مؤشرات التحصيل والأداء" : "Performance & Collection"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {OPERATIONAL_REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <Link
                key={r.href}
                href={r.href}
                locale={locale as Locale}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800/80"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${r.color} shadow-xs`}>
                      <Icon className="size-5" />
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-bold">
                      {isAr ? r.badgeAr : r.badgeEn}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {isAr ? r.titleAr : r.titleEn}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">
                      {isAr ? r.descAr : r.descEn}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <span>{isAr ? "استعراض وتصدير التقرير" : "View & Export"}</span>
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
