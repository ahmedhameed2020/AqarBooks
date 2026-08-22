import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  Wallet,
  Building2,
  Receipt,
  FileText,
  CreditCard,
  CheckCircle2,
  Clock3,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type MemberSummaryRow = {
  units_count: number;
  total_balance: number;
  has_arrears: boolean;
  last_payment_amount: number | null;
  last_payment_date: string | null;
};

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  const [
    { data: summaryData },
    { data: openDuesData },
    { data: unitsData },
  ] = await Promise.all([
    supabase
      .from("members_with_financials")
      .select("units_count, total_balance, has_arrears, last_payment_amount, last_payment_date")
      .eq("id", member.id)
      .maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .order("due_date", { ascending: true })
      .limit(3),
    supabase
      .from("units_with_financials")
      .select("id, code, unit_type, custom_type_label, balance, has_arrears")
      .order("code", { ascending: true })
      .limit(4),
  ]);

  const summary = summaryData as MemberSummaryRow | null;
  const openDues = openDuesData ?? [];
  const units = unitsData ?? [];
  const totalBalance = Number(summary?.total_balance ?? 0);
  const settled = totalBalance <= 0;

  return (
    <div className="space-y-6">
      {/* Executive Welcome Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-indigo-950/20 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
              <Sparkles className="size-3.5" />
              <span>{isAr ? "لوحة تحكم المالك والمستثمر" : "Investor Portfolio Dashboard"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {isAr ? `مرحبًا، ${member.full_name}` : `Welcome, ${member.full_name}`}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl leading-relaxed">
              {isAr
                ? "متابعة الموقف المالي الشامل لوحداتك العقارية، كشوف الحسابات المعتمدة، وسداد المستحقات مباشرة بأمان وسرعة."
                : "Real-time visibility over your real estate assets, certified statements, and instant dues settlement."}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/portal/dues"
              locale={locale as Locale}
              className={buttonVariants({
                variant: "default",
                size: "sm",
                className:
                  "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold h-10 px-4 rounded-xl shadow-xs gap-2",
              })}
            >
              <CreditCard className="size-4" />
              <span>{isAr ? "سداد المستحقات" : "Pay Dues Online"}</span>
            </Link>

            <Link
              href="/portal/statement"
              locale={locale as Locale}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "h-10 px-4 rounded-xl font-bold gap-2 text-xs",
              })}
            >
              <FileText className="size-4 text-indigo-500" />
              <span>{isAr ? "كشف الحساب الرسمي" : "Account Statement"}</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Bento Financial KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Balance Card */}
        <div
          className={`rounded-3xl border p-5 shadow-2xs space-y-3 ${
            settled
              ? "border-emerald-500/30 bg-emerald-500/[0.04]"
              : "border-rose-500/30 bg-rose-500/[0.04]"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet className="size-4 text-indigo-500" />
              <span>{isAr ? "الرصيد القائم للذمة" : "Current Balance"}</span>
            </p>
            <Badge
              variant="outline"
              className={`text-[10px] font-bold ${
                settled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
              }`}
            >
              {settled ? (isAr ? "مسوى بالكامل" : "Settled") : (isAr ? "مستحق السداد" : "Arrears")}
            </Badge>
          </div>
          <p className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight">
            <Money amount={totalBalance} locale={locale} tone={settled ? "positive" : "negative"} />
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {settled
              ? isAr
                ? "لا توجد أي فواتير معلقة"
                : "All accounts up to date"
              : isAr
              ? "يرجى تسوية المستحقات المفتوحة"
              : "Open dues pending payment"}
          </p>
        </div>

        {/* Units Count Card */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Building2 className="size-4 text-purple-500" />
              <span>{isAr ? "العقارات والوحدات" : "Registered Units"}</span>
            </p>
            <Link
              href="/portal/units"
              locale={locale as Locale}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
            >
              <span>{isAr ? "عرض الكل" : "View all"}</span>
              <ChevronLeft className="size-3 rtl:rotate-0 rotate-180" />
            </Link>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tabular-nums">
            {summary?.units_count ?? 0}{" "}
            <span className="text-xs font-semibold text-slate-400">{isAr ? "وحدة" : "units"}</span>
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {isAr ? "مسجلة باسمك وموثقة بالنظام" : "Registered in portfolio"}
          </p>
        </div>

        {/* Last Payment Card */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock3 className="size-4 text-emerald-500" />
              <span>{isAr ? "آخر دفعة مسددة" : "Last Payment"}</span>
            </p>
            <Link
              href="/portal/payments"
              locale={locale as Locale}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
            >
              <span>{isAr ? "السجلات" : "Receipts"}</span>
              <ChevronLeft className="size-3 rtl:rotate-0 rotate-180" />
            </Link>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            {summary?.last_payment_amount != null ? (
              <Money amount={Number(summary.last_payment_amount)} locale={locale} />
            ) : (
              "—"
            )}
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {summary?.last_payment_date || (isAr ? "لا توجد دفعات سابقة" : "No recent payment")}
          </p>
        </div>

        {/* Account Status Card */}
        <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-blue-500" />
              <span>{isAr ? "حالة الحساب والمصادقة" : "Security & Verification"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="size-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "حساب موثق بالكامل" : "Fully Verified"}
              </p>
              <p className="text-[10px] text-slate-400">
                {isAr ? "اتصال مشفر 256-bit" : "256-bit TLS Encrypted"}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            {isAr ? "متصل بقاعدة البيانات المحاسبية" : "Connected to GL Engine"}
          </p>
        </div>
      </div>

      {/* Two Column Section: Open Dues & Units Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open Dues Box */}
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "المستحقات والفواتير المفتوحة" : "Open Invoices & Dues"}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? "الفواتير المطلوب سدادها حاليًا" : "Invoices due for settlement"}
              </p>
            </div>
            <Link
              href="/portal/dues"
              locale={locale as Locale}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isAr ? "عرض كل المستحقات" : "View all dues"}
            </Link>
          </div>

          {openDues.length > 0 ? (
            <div className="space-y-2.5">
              {openDues.map((d: any) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-slate-50/50 dark:bg-slate-900/50"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {d.description || (isAr ? "مطالبة دورية" : "Periodic Due")}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {d.units?.code ? `${d.units.code} • ` : ""}
                      {isAr ? "تاريخ الاستحقاق:" : "Due Date:"} {d.due_date}
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums block">
                      <Money amount={Number(d.amount)} locale={locale} />
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/30 font-semibold"
                    >
                      {d.status === "OVERDUE" ? (isAr ? "متأخر" : "Overdue") : (isAr ? "مستحق" : "Due")}
                    </Badge>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <Link
                  href="/portal/dues"
                  locale={locale as Locale}
                  className={buttonVariants({
                    size: "sm",
                    className:
                      "w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl h-10 shadow-xs",
                  })}
                >
                  <CreditCard className="size-4 me-2" />
                  <span>{isAr ? "الانتقال لبوابة الدفع الإلكتروني" : "Proceed to Payment Gateway"}</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl border border-dashed border-border/60 bg-slate-50/40 dark:bg-slate-900/40 space-y-2">
              <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "حسابك مسدد بالكامل" : "No Pending Dues"}
              </p>
              <p className="text-xs text-slate-500">
                {isAr ? "شكراً لالتزامكم المستمر بالسداد في المواعيد المحددة." : "Thank you for settling all your invoices on time."}
              </p>
            </div>
          )}
        </section>

        {/* Real Estate Units Portfolio Box */}
        <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "العقارات والوحدات المسجلة" : "My Real Estate Portfolio"}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? "نظرة سريعة على وحداتك وحالتها" : "Quick overview of your assets"}
              </p>
            </div>
            <Link
              href="/portal/units"
              locale={locale as Locale}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isAr ? "تفاصيل المحفظة" : "Full portfolio"}
            </Link>
          </div>

          {units.length > 0 ? (
            <div className="space-y-2.5">
              {units.map((u: any) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl border border-border/60 bg-slate-50/50 dark:bg-slate-900/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-bold text-xs">
                      {u.code.slice(0, 3)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{u.code}</p>
                      <p className="text-[11px] text-slate-500">
                        {u.custom_type_label || u.unit_type}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="text-xs font-bold block">
                      <Money
                        amount={Number(u.balance)}
                        locale={locale}
                        tone={Number(u.balance) > 0 ? "negative" : "positive"}
                      />
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        Number(u.balance) > 0
                          ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      }`}
                    >
                      {Number(u.balance) > 0 ? (isAr ? "مستحقات" : "Due") : (isAr ? "مسوى" : "Settled")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl border border-dashed border-border/60 bg-slate-50/40 dark:bg-slate-900/40 space-y-2">
              <Building2 className="size-8 text-slate-400 mx-auto opacity-40" />
              <p className="text-xs font-semibold text-slate-500">
                {isAr ? "لا توجد وحدات مسجلة حاليًا" : "No units on file"}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
