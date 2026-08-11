import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StatTile } from "./stat-tile";

const REPORT_LINKS = [
  { href: "/finance/reports/trial-balance", labelAr: "ميزان المراجعة", labelEn: "Trial Balance" },
  { href: "/finance/reports/general-ledger", labelAr: "دفتر الأستاذ العام", labelEn: "General Ledger" },
  { href: "/finance/reports/income-statement", labelAr: "قائمة الدخل", labelEn: "Income Statement" },
  { href: "/finance/reports/balance-sheet", labelAr: "الميزانية العمومية", labelEn: "Balance Sheet" },
  { href: "/finance/reports/aging", labelAr: "أعمار الديون", labelEn: "Receivables Aging" },
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

  const [{ count: openSessionsCount }, { count: unpostedCount }, { count: outstandingChequesCount }] =
    await Promise.all([
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
      supabase
        .from("cheques")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .in("status", ["RECEIVED", "DEPOSITED"]),
    ]);

  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "لوحة التحكم المالية" : "Financial Overview"}</h1>
        {currentPeriod && (
          <p className="text-sm text-muted-foreground">
            {isAr ? "الفترة الحالية" : "Current period"}: {currentPeriod.name}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label={isAr ? "الإيراد (الفترة)" : "Revenue (period)"} value={fmt(revenueTotal)} tone="positive" />
        <StatTile label={isAr ? "المصروفات (الفترة)" : "Expenses (period)"} value={fmt(expenseTotal)} />
        <StatTile
          label={isAr ? "الفائض/العجز" : "Surplus/Deficit"}
          value={fmt(surplus)}
          tone={surplus >= 0 ? "positive" : "negative"}
        />
        <StatTile label={isAr ? "ذمم مستحقة" : "Outstanding receivables"} value={fmt(outstandingReceivables)} />
        <StatTile
          label={isAr ? "مستحقات متأخرة" : "Overdue dues"}
          value={String(overdueDuesCount)}
          tone={overdueDuesCount > 0 ? "warning" : undefined}
        />
        <StatTile label={isAr ? "جلسات كاشير مفتوحة" : "Open cashier sessions"} value={String(openSessionsCount ?? 0)} />
        <StatTile
          label={isAr ? "قيود غير مرحّلة" : "Unposted journal entries"}
          value={String(unpostedCount ?? 0)}
          tone={(unpostedCount ?? 0) > 0 ? "warning" : undefined}
        />
        <StatTile label={isAr ? "شيكات لم تُحصَّل" : "Outstanding cheques"} value={String(outstandingChequesCount ?? 0)} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium">{isAr ? "التقارير" : "Reports"}</h2>
        <div className="flex flex-wrap gap-2">
          {REPORT_LINKS.map((r) => (
            <Link key={r.href} href={r.href} locale={locale as Locale} className={buttonVariants({ variant: "outline" })}>
              {isAr ? r.labelAr : r.labelEn}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
