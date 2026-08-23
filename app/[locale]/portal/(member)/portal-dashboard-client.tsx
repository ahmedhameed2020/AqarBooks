"use client";

import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  FileText,
  Receipt,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { generatePortalReportPdf } from "@/lib/reports/portal-report-pdf";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  AGING_BUCKET_TONE,
  formatAmount,
  type AgingBucket,
} from "@/lib/portal/portal-finance";
import { AgingBar, EmptyState, ExportButtons, PortalPageHeader, StatCard } from "./portal-ui";

export interface DashboardDue {
  id: string;
  description: string;
  unitCode: string | null;
  dueDate: string;
  outstanding: number;
  bucket: AgingBucket;
}

export interface DashboardUnit {
  id: string;
  code: string;
  typeLabel: string;
  balance: number;
}

export interface MonthPoint {
  /** YYYY-MM */
  month: string;
  amount: number;
}

export function PortalDashboardClient({
  memberName,
  organizationName,
  currency,
  unitsCount,
  totalBalance,
  lastPaymentAmount,
  lastPaymentDate,
  dues,
  units,
  trend,
  locale,
}: {
  memberName: string;
  organizationName: string;
  currency: string;
  unitsCount: number;
  totalBalance: number;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  dues: DashboardDue[];
  units: DashboardUnit[];
  trend: MonthPoint[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const settled = totalBalance <= 0;

  const totalOutstanding = dues.reduce((s, d) => s + d.outstanding, 0);
  const overdueOutstanding = dues
    .filter((d) => d.bucket !== "CURRENT")
    .reduce((s, d) => s + d.outstanding, 0);
  const overdueCount = dues.filter((d) => d.bucket !== "CURRENT").length;
  const unitsWithArrears = units.filter((u) => u.balance > 0).length;

  const agingSegments = AGING_BUCKETS.map((b) => ({
    key: b,
    label: isAr ? AGING_BUCKET_LABELS[b].ar : AGING_BUCKET_LABELS[b].en,
    amount: dues.filter((d) => d.bucket === b).reduce((s, d) => s + d.outstanding, 0),
    tone: AGING_BUCKET_TONE[b],
  }));

  const trendMax = Math.max(...trend.map((t) => t.amount), 0);
  const trendTotal = trend.reduce((s, t) => s + t.amount, 0);
  const monthShort = (key: string) =>
    new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", { month: "short" }).format(
      new Date(`${key}-01T00:00:00Z`),
    );

  const summaryRows = units.map((u) => ({
    code: u.code,
    typeLabel: u.typeLabel,
    status: u.balance > 0 ? (isAr ? "عليها مستحقات" : "Arrears") : isAr ? "مسوّاة" : "Settled",
    balance: u.balance,
  }));

  async function handleExportExcel() {
    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Position_${memberName.replace(/\s+/g, "_") || "Owner"}`,
        title: isAr ? `الموقف المالي الشامل: ${memberName}` : `Overall Financial Position: ${memberName}`,
        organizationName,
        currencyLabel: currency,
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "code", width: 14 },
          { header: isAr ? "النوع" : "Type", key: "typeLabel", width: 18 },
          { header: isAr ? "الموقف" : "Status", key: "status", width: 16 },
          {
            header: isAr ? `الرصيد (${currency})` : `Balance (${currency})`,
            key: "balance",
            width: 18,
            isNumber: true,
          },
        ],
        rows: summaryRows,
        summaries: [
          {
            label: isAr ? "الرصيد الإجمالي" : "Total balance",
            value: `${formatAmount(totalBalance, locale)} ${currency}`,
          },
          {
            label: isAr ? "المستحق المفتوح" : "Open outstanding",
            value: `${formatAmount(totalOutstanding, locale)} ${currency}`,
          },
          {
            label: isAr ? "منه متأخر" : "Of which overdue",
            value: `${formatAmount(overdueOutstanding, locale)} ${currency}`,
          },
          { label: isAr ? "عدد الوحدات" : "Units", value: unitsCount },
        ],
      },
      locale,
    );
  }

  function handleExportPdf() {
    generatePortalReportPdf(
      {
        organizationName,
        documentTitle: isAr ? "الموقف المالي الشامل" : "Overall Financial Position",
        documentSubtitle: isAr
          ? "ملخص رصيدك ووحداتك ومستحقاتك القائمة"
          : "A summary of your balance, your units, and your open charges",
        accountName: memberName,
        currency,
        periodLabel: isAr ? "الموقف حتى تاريخه" : "Position as of today",
        kpis: [
          {
            label: isAr ? "الرصيد الإجمالي" : "Total balance",
            value: formatAmount(totalBalance, locale),
            tone: settled ? "settled" : "owing",
            emphasis: true,
          },
          {
            label: isAr ? "المستحق المفتوح" : "Open outstanding",
            value: formatAmount(totalOutstanding, locale),
            tone: totalOutstanding > 0 ? "owing" : "settled",
          },
          {
            label: isAr ? "منه متأخر" : "Of which overdue",
            value: formatAmount(overdueOutstanding, locale),
            tone: overdueOutstanding > 0 ? "owing" : "settled",
          },
          { label: isAr ? "عدد الوحدات" : "Units", value: String(unitsCount) },
        ],
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "code", strong: true },
          { header: isAr ? "النوع" : "Type", key: "typeLabel" },
          { header: isAr ? "الموقف" : "Status", key: "status" },
          { header: isAr ? "الرصيد" : "Balance", key: "balance", numeric: true, strong: true },
        ],
        rows: summaryRows.map((r) => ({ ...r, balance: formatAmount(r.balance, locale) })),
        totalRow: {
          code: isAr ? "الإجمالي" : "Total",
          balance: formatAmount(
            units.reduce((s, u) => s + u.balance, 0),
            locale,
          ),
        },
        emptyMessage: isAr ? "لا توجد وحدات مسجلة باسمك." : "No units registered in your name.",
      },
      locale,
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? `مرحبًا، ${memberName}` : `Welcome, ${memberName}`}
        description={
          isAr
            ? "موقفك المالي الكامل لدى الكيان: ما عليك، ما سددته، وحداتك، وما يستحق السداد قريبًا."
            : "Your complete financial position: what you owe, what you have paid, your units, and what falls due next."
        }
      >
        <ExportButtons
          locale={locale}
          disabled={units.length === 0 && dues.length === 0}
          onExcel={handleExportExcel}
          onPdf={handleExportPdf}
          pdfLabel={isAr ? "طباعة الموقف" : "Print position"}
        />
        <Link
          href="/portal/dues"
          locale={locale}
          className={buttonVariants({
            size: "sm",
            className: "h-9 gap-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700",
          })}
        >
          <CreditCard className="size-4" />
          <span>{isAr ? "سداد المستحقات" : "Pay dues"}</span>
        </Link>
      </PortalPageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={isAr ? "رصيدك الحالي" : "Current balance"}
          icon={<Wallet className="size-4 text-indigo-500" />}
          tone={settled ? "positive" : "negative"}
          value={
            <Money amount={totalBalance} locale={locale} tone={settled ? "positive" : "negative"} />
          }
          hint={
            settled
              ? isAr
                ? "لا توجد مطالبات معلقة"
                : "Nothing outstanding"
              : isAr
                ? "مستحق السداد لصالح الكيان"
                : "Payable to the entity"
          }
          action={
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold ${
                settled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
              }`}
            >
              {settled ? (isAr ? "مسوّى" : "Settled") : isAr ? "مستحق" : "Due"}
            </Badge>
          }
        />

        <StatCard
          label={isAr ? "متأخر السداد" : "Overdue"}
          icon={<TriangleAlert className="size-4 text-rose-500" />}
          tone={overdueOutstanding > 0 ? "negative" : "neutral"}
          value={<Money amount={overdueOutstanding} locale={locale} tone={overdueOutstanding > 0 ? "negative" : undefined} />}
          hint={
            overdueCount > 0
              ? isAr
                ? `${overdueCount} مطالبة تجاوزت تاريخ استحقاقها`
                : `${overdueCount} charge(s) past their due date`
              : isAr
                ? "لا توجد مطالبات متأخرة"
                : "Nothing past due"
          }
        />

        <StatCard
          label={isAr ? "وحداتك" : "Your units"}
          icon={<Building2 className="size-4 text-indigo-500" />}
          value={
            <>
              {unitsCount}{" "}
              <span className="text-xs font-semibold text-slate-400">
                {isAr ? "وحدة" : unitsCount === 1 ? "unit" : "units"}
              </span>
            </>
          }
          hint={
            unitsWithArrears > 0
              ? isAr
                ? `${unitsWithArrears} منها عليها مستحقات`
                : `${unitsWithArrears} with arrears`
              : isAr
                ? "كل الوحدات مسوّاة"
                : "All units settled"
          }
          action={
            <Link
              href="/portal/units"
              locale={locale}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <span>{isAr ? "عرض" : "View"}</span>
              <ChevronLeft className="size-3 rotate-180 rtl:rotate-0" />
            </Link>
          }
        />

        <StatCard
          label={isAr ? "آخر دفعة سُدِّدت" : "Last payment"}
          icon={<Receipt className="size-4 text-emerald-500" />}
          value={
            lastPaymentAmount === null ? (
              "—"
            ) : (
              <Money amount={lastPaymentAmount} locale={locale} tone="positive" />
            )
          }
          hint={lastPaymentDate ?? (isAr ? "لا توجد دفعات سابقة" : "No payments yet")}
          action={
            <Link
              href="/portal/payments"
              locale={locale}
              className="flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <span>{isAr ? "السندات" : "Receipts"}</span>
              <ChevronLeft className="size-3 rotate-180 rtl:rotate-0" />
            </Link>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Aging: the single question a receivables view has to answer -- how
            old is what I owe, and therefore what should I settle first. */}
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? "أعمار المستحقات القائمة" : "Aging of open dues"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "توزيع ما عليك حسب المدة التي مضت على استحقاقه."
                : "What you owe, split by how long it has been due."}
            </p>
          </div>

          {totalOutstanding > 0 ? (
            <>
              <AgingBar segments={agingSegments} total={totalOutstanding} />
              <dl className="space-y-1.5">
                {agingSegments
                  .filter((s) => s.amount > 0)
                  .map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between rounded-xl border border-border/50 bg-slate-50/60 px-3 py-2 dark:bg-slate-900/40"
                    >
                      <dt className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {s.label}
                      </dt>
                      <dd className="text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                        <Money amount={s.amount} locale={locale} />
                      </dd>
                    </div>
                  ))}
              </dl>
            </>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="size-5 text-emerald-500" />}
              title={isAr ? "لا توجد مستحقات قائمة" : "Nothing outstanding"}
              description={
                isAr
                  ? "كل المطالبات الصادرة على وحداتك مسددة بالكامل."
                  : "Every charge issued on your units is fully settled."
              }
            />
          )}
        </section>

        {/* Collections over twelve rolling months: whether payment behaviour is
            regular, and where the gaps fell. */}
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "مدفوعاتك خلال ١٢ شهرًا" : "Your payments over 12 months"}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? "إجمالي ما سُدِّد في كل شهر." : "Total settled in each month."}
              </p>
            </div>
            <div className="text-end">
              <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                <Money amount={trendTotal} locale={locale} tone="positive" />
              </p>
              <p className="text-[10px] text-slate-400">{isAr ? "إجمالي الفترة" : "Period total"}</p>
            </div>
          </div>

          {trendMax > 0 ? (
            <div className="flex h-40 items-end justify-between gap-1.5" role="img"
              aria-label={
                isAr
                  ? `رسم بياني لمدفوعاتك الشهرية خلال آخر ١٢ شهرًا، بإجمالي ${formatAmount(trendTotal, locale)} ${currency}`
                  : `Bar chart of your monthly payments over the last 12 months, totalling ${formatAmount(trendTotal, locale)} ${currency}`
              }
            >
              {trend.map((t) => (
                <div key={t.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className={`w-full rounded-t-sm transition-colors ${
                      t.amount > 0 ? "bg-emerald-500/80 hover:bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                    }`}
                    style={{
                      height: t.amount > 0 ? `${Math.max((t.amount / trendMax) * 100, 4)}%` : "2px",
                    }}
                    title={`${t.month}: ${formatAmount(t.amount, locale)} ${currency}`}
                  />
                  <span className="text-[9px] font-medium text-slate-400">{monthShort(t.month)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Receipt className="size-5" />}
              title={isAr ? "لا توجد مدفوعات في آخر ١٢ شهرًا" : "No payments in the last 12 months"}
              description={
                isAr
                  ? "سيظهر هنا توزيع مدفوعاتك الشهرية فور تسجيل أول سند سداد."
                  : "Your monthly payment pattern appears here once the first receipt is posted."
              }
            />
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "أقرب المستحقات" : "Next charges due"}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? "مرتبة بحسب تاريخ الاستحقاق." : "Ordered by due date."}
              </p>
            </div>
            {dues.length > 0 ? (
              <Link
                href="/portal/dues"
                locale={locale}
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {isAr ? `عرض الكل (${dues.length})` : `View all (${dues.length})`}
              </Link>
            ) : null}
          </div>

          {dues.length > 0 ? (
            <div className="space-y-2.5">
              {dues.slice(0, 4).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-slate-50/60 p-3 dark:bg-slate-900/40"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {d.description}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {d.unitCode ? `${d.unitCode} · ` : ""}
                      {isAr ? "الاستحقاق:" : "Due:"} {d.dueDate}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <span className="block text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      <Money amount={d.outstanding} locale={locale} />
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-semibold ${
                        d.bucket === "CURRENT"
                          ? "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isAr ? AGING_BUCKET_LABELS[d.bucket].ar : AGING_BUCKET_LABELS[d.bucket].en}
                    </Badge>
                  </div>
                </div>
              ))}

              <Link
                href="/portal/dues"
                locale={locale}
                className={buttonVariants({
                  size: "sm",
                  className:
                    "h-10 w-full gap-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700",
                })}
              >
                <CreditCard className="size-4" />
                <span>{isAr ? "الانتقال للسداد الإلكتروني" : "Go to online payment"}</span>
              </Link>
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="size-5 text-emerald-500" />}
              title={isAr ? "حسابك مسدد بالكامل" : "Your account is fully settled"}
              description={
                isAr
                  ? "لا توجد فواتير أو مطالبات معلقة. سيظهر هنا أي استحقاق جديد فور إصداره."
                  : "There are no pending invoices or charges. Any new charge appears here as soon as it is issued."
              }
            />
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "محفظتك العقارية" : "Your portfolio"}
              </h2>
              <p className="text-xs text-slate-500">
                {isAr ? "الوحدات المسجلة وموقفها المالي." : "Registered units and their position."}
              </p>
            </div>
            {units.length > 0 ? (
              <Link
                href="/portal/units"
                locale={locale}
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {isAr ? "التفاصيل الكاملة" : "Full details"}
              </Link>
            ) : null}
          </div>

          {units.length > 0 ? (
            <div className="space-y-2.5">
              {units.slice(0, 4).map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-slate-50/60 p-3 dark:bg-slate-900/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200/60 bg-indigo-50 font-mono text-xs font-bold text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400">
                      {u.code.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {u.code}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{u.typeLabel}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <span className="block text-xs font-bold tabular-nums">
                      <Money
                        amount={u.balance}
                        locale={locale}
                        tone={u.balance > 0 ? "negative" : "positive"}
                      />
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      {u.balance > 0 ? (isAr ? "مستحقات" : "Arrears") : isAr ? "مسوّاة" : "Settled"}
                    </span>
                  </div>
                </div>
              ))}

              {units.length > 4 ? (
                <Link
                  href="/portal/units"
                  locale={locale}
                  className={buttonVariants({
                    variant: "outline",
                    size: "sm",
                    className: "h-10 w-full gap-2 rounded-xl text-xs font-semibold",
                  })}
                >
                  <Building2 className="size-4 text-indigo-500" />
                  <span>
                    {isAr
                      ? `عرض باقي الوحدات (${units.length - 4})`
                      : `Show ${units.length - 4} more units`}
                  </span>
                </Link>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={<Building2 className="size-5" />}
              title={isAr ? "لا توجد وحدات مسجلة" : "No units on record"}
              description={
                isAr
                  ? "لم يتم ربط أي وحدة بحسابك بعد. تواصل مع إدارة الكيان لمراجعة بيانات الملكية."
                  : "No unit has been linked to your account yet. Contact management to review your ownership records."
              }
            />
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/portal/statement"
          locale={locale}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-indigo-500/40"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-slate-50 dark:bg-slate-900">
            <FileText className="size-4 text-indigo-500" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
              {isAr ? "كشف الحساب المالي" : "Account statement"}
            </span>
            <span className="block text-[11px] text-slate-500">
              {isAr ? "الحركات والرصيد الجاري" : "Movements & running balance"}
            </span>
          </span>
        </Link>

        <Link
          href="/portal/payments"
          locale={locale}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-indigo-500/40"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-slate-50 dark:bg-slate-900">
            <Receipt className="size-4 text-emerald-500" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
              {isAr ? "سندات السداد" : "Payment receipts"}
            </span>
            <span className="block text-[11px] text-slate-500">
              {isAr ? "إيصالات رسمية قابلة للطباعة" : "Printable official receipts"}
            </span>
          </span>
        </Link>

        <Link
          href="/portal/documents"
          locale={locale}
          className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 transition-colors hover:border-indigo-500/40"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-slate-50 dark:bg-slate-900">
            <FileText className="size-4 text-purple-500" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
              {isAr ? "المستندات" : "Documents"}
            </span>
            <span className="block text-[11px] text-slate-500">
              {isAr ? "المرفقات والتقارير الرسمية" : "Files & official reports"}
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
