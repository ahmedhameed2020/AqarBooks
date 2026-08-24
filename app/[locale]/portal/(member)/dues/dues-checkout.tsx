"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Info,
  Landmark,
  Loader2,
  Lock,
  Square,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { generatePortalReportPdf } from "@/lib/reports/portal-report-pdf";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABELS,
  AGING_BUCKET_TONE,
  formatAmount,
  type AgingBucket,
  type OutstandingDue,
} from "@/lib/portal/portal-finance";
import { createOnlinePaymentCheckoutAction } from "@/lib/actions/online-payment-checkout";
import {
  AgingBar,
  EmptyState,
  ExportButtons,
  PortalPageHeader,
  SearchBox,
  Segmented,
  StatCard,
} from "../portal-ui";

const GENERIC_ERROR = {
  ar: "تعذر إتمام عملية الدفع، يرجى المحاولة مرة أخرى.",
  en: "Could not start the payment, please try again.",
};

type BucketFilter = "ALL" | AgingBucket;

export function DuesCheckout({
  dues,
  organizationName,
  currency,
  memberName,
  locale,
}: {
  dues: OutstandingDue[];
  organizationName: string;
  currency: string;
  memberName: string;
  locale: string;
}) {
  const isAr = locale === "ar";

  // The online checkout RPC bills a due at its gross `amount`, so a due that is
  // already part-settled would overcharge the owner by whatever they have
  // already paid. Until that is corrected in the database, partially settled
  // dues are shown in full (charge / paid / remaining) but are excluded from
  // online payment rather than silently overbilled.
  const payable = useMemo(() => dues.filter((d) => !d.isPartiallySettled), [dues]);
  const blocked = useMemo(() => dues.filter((d) => d.isPartiallySettled), [dues]);

  const [selected, setSelected] = useState<Set<string>>(new Set(payable.map((d) => d.id)));
  const [bucket, setBucket] = useState<BucketFilter>("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalOutstanding = dues.reduce((s, d) => s + d.outstanding, 0);
  const overdueOutstanding = dues
    .filter((d) => d.bucket !== "CURRENT")
    .reduce((s, d) => s + d.outstanding, 0);
  const blockedOutstanding = blocked.reduce((s, d) => s + d.outstanding, 0);

  const selectedTotal = payable
    .filter((d) => selected.has(d.id))
    .reduce((s, d) => s + d.outstanding, 0);

  const agingSegments = AGING_BUCKETS.map((b) => ({
    key: b,
    label: isAr ? AGING_BUCKET_LABELS[b].ar : AGING_BUCKET_LABELS[b].en,
    amount: dues.filter((d) => d.bucket === b).reduce((s, d) => s + d.outstanding, 0),
    tone: AGING_BUCKET_TONE[b],
  }));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dues.filter((d) => {
      if (bucket !== "ALL" && d.bucket !== bucket) return false;
      if (!q) return true;
      return (
        (d.description ?? "").toLowerCase().includes(q) ||
        (d.unitCode ?? "").toLowerCase().includes(q) ||
        d.due_date.includes(q)
      );
    });
  }, [dues, bucket, query]);

  const visiblePayableIds = visible.filter((d) => !d.isPartiallySettled).map((d) => d.id);
  const allVisibleSelected =
    visiblePayableIds.length > 0 && visiblePayableIds.every((id) => selected.has(id));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visiblePayableIds.forEach((id) => next.delete(id));
      else visiblePayableIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handlePay() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await createOnlinePaymentCheckoutAction({
        dueIds: Array.from(selected),
        provider: "FAWRY",
      });
      if ("redirectUrl" in result && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setError(
        ("message" in result && result.message) || (isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en),
      );
    });
  }

  const reportRows = visible.map((d) => ({
    unitCode: d.unitCode || "—",
    description: d.description || (isAr ? "مطالبة مالية دورية" : "Periodic due"),
    issueDate: d.issue_date,
    dueDate: d.due_date,
    aging: isAr ? AGING_BUCKET_LABELS[d.bucket].ar : AGING_BUCKET_LABELS[d.bucket].en,
    amount: d.amount,
    paid: d.paid,
    outstanding: d.outstanding,
  }));

  async function handleExportExcel() {
    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Open_Dues_${memberName.replace(/\s+/g, "_") || "Owner"}`,
        title: isAr ? `بيان المستحقات المفتوحة: ${memberName}` : `Open Dues Statement: ${memberName}`,
        organizationName,
        currencyLabel: currency,
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "unitCode", width: 14 },
          { header: isAr ? "البيان" : "Description", key: "description", width: 32 },
          { header: isAr ? "تاريخ الإصدار" : "Issue date", key: "issueDate", width: 14 },
          { header: isAr ? "تاريخ الاستحقاق" : "Due date", key: "dueDate", width: 14 },
          { header: isAr ? "عمر الدين" : "Aging", key: "aging", width: 18 },
          {
            header: isAr ? `قيمة المطالبة (${currency})` : `Charged (${currency})`,
            key: "amount",
            width: 16,
            isNumber: true,
          },
          {
            header: isAr ? `المسدد (${currency})` : `Paid (${currency})`,
            key: "paid",
            width: 16,
            isNumber: true,
          },
          {
            header: isAr ? `المتبقي (${currency})` : `Outstanding (${currency})`,
            key: "outstanding",
            width: 18,
            isNumber: true,
          },
        ],
        rows: reportRows,
        summaries: [
          {
            label: isAr ? "إجمالي المتبقي" : "Total outstanding",
            value: `${formatAmount(totalOutstanding, locale)} ${currency}`,
          },
          {
            label: isAr ? "منه متأخر السداد" : "Of which overdue",
            value: `${formatAmount(overdueOutstanding, locale)} ${currency}`,
          },
          { label: isAr ? "عدد المطالبات" : "Open charges", value: dues.length },
        ],
      },
      locale,
    );
  }

  function handleExportPdf() {
    generatePortalReportPdf(
      {
        organizationName,
        documentTitle: isAr ? "بيان المستحقات المفتوحة" : "Open Dues Statement",
        documentSubtitle: isAr
          ? "المطالبات المالية القائمة وأعمارها والمبالغ المتبقية منها"
          : "Outstanding charges, their aging, and what remains payable on each",
        accountName: memberName,
        currency,
        periodLabel: isAr ? "المطالبات القائمة حتى تاريخه" : "Open charges as of today",
        kpis: [
          {
            label: isAr ? "إجمالي المتبقي" : "Total outstanding",
            value: formatAmount(totalOutstanding, locale),
            tone: totalOutstanding > 0 ? "owing" : "settled",
            emphasis: true,
          },
          {
            label: isAr ? "متأخر السداد" : "Overdue",
            value: formatAmount(overdueOutstanding, locale),
            tone: overdueOutstanding > 0 ? "owing" : "settled",
          },
          { label: isAr ? "عدد المطالبات" : "Open charges", value: String(dues.length) },
          {
            label: isAr ? "إجمالي ما تم سداده" : "Already settled",
            value: formatAmount(
              dues.reduce((s, d) => s + d.paid, 0),
              locale,
            ),
            tone: "settled",
          },
        ],
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "unitCode" },
          { header: isAr ? "البيان" : "Description", key: "description" },
          { header: isAr ? "الاستحقاق" : "Due date", key: "dueDate" },
          { header: isAr ? "عمر الدين" : "Aging", key: "aging" },
          { header: isAr ? "المطالبة" : "Charged", key: "amount", numeric: true },
          { header: isAr ? "المسدد" : "Paid", key: "paid", numeric: true },
          { header: isAr ? "المتبقي" : "Outstanding", key: "outstanding", numeric: true, strong: true },
        ],
        rows: reportRows.map((r) => ({
          ...r,
          amount: formatAmount(r.amount, locale),
          paid: r.paid > 0 ? formatAmount(r.paid, locale) : "—",
          outstanding: formatAmount(r.outstanding, locale),
        })),
        totalRow: {
          unitCode: isAr ? "الإجمالي" : "Total",
          amount: formatAmount(
            visible.reduce((s, d) => s + d.amount, 0),
            locale,
          ),
          paid: formatAmount(
            visible.reduce((s, d) => s + d.paid, 0),
            locale,
          ),
          outstanding: formatAmount(
            visible.reduce((s, d) => s + d.outstanding, 0),
            locale,
          ),
        },
        notes: blocked.length
          ? [
              isAr
                ? "المطالبات المسددة جزئيًا موضّحة بقيمتها الأصلية والمسدد منها والمتبقي عليها، ولا يمكن سدادها عبر البوابة الإلكترونية حاليًا — يُرجى التواصل مع إدارة الكيان لسدادها."
                : "Partially settled charges are shown at their original value with the amount already paid and the remaining balance. They cannot currently be settled through the online gateway — please contact management to pay them.",
            ]
          : undefined,
        emptyMessage: isAr ? "لا توجد مطالبات مالية مفتوحة." : "No open charges.",
      },
      locale,
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "المستحقات والسداد" : "Dues & Payment"}
        description={
          isAr
            ? "المطالبات المالية القائمة على وحداتك، أعمارها، والمبالغ المتبقية منها — مع السداد الإلكتروني المباشر."
            : "Outstanding charges on your units, how long they have been due, what remains on each, and direct online settlement."
        }
      >
        <ExportButtons
          locale={locale}
          disabled={dues.length === 0}
          onExcel={handleExportExcel}
          onPdf={handleExportPdf}
          pdfLabel={isAr ? "طباعة البيان" : "Print statement"}
        />
      </PortalPageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={isAr ? "إجمالي المتبقي عليك" : "Total outstanding"}
          icon={<Landmark className="size-4 text-indigo-500" />}
          tone={totalOutstanding > 0 ? "negative" : "positive"}
          value={
            <Money
              amount={totalOutstanding}
              locale={locale}
              tone={totalOutstanding > 0 ? "negative" : "positive"}
            />
          }
          hint={
            isAr
              ? `موزّعة على ${dues.length} مطالبة قائمة`
              : `Across ${dues.length} open charges`
          }
        />
        <StatCard
          label={isAr ? "منه متأخر السداد" : "Of which overdue"}
          icon={<TriangleAlert className="size-4 text-rose-500" />}
          value={<Money amount={overdueOutstanding} locale={locale} tone="negative" />}
          hint={
            isAr
              ? "مطالبات تجاوزت تاريخ استحقاقها"
              : "Charges past their due date"
          }
        />
        <StatCard
          label={isAr ? "سبق سداده من المطالبات القائمة" : "Already settled on open charges"}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          value={
            <Money
              amount={dues.reduce((s, d) => s + d.paid, 0)}
              locale={locale}
              tone="positive"
            />
          }
          hint={
            isAr
              ? "دفعات جزئية مخصومة من القيم أدناه"
              : "Partial payments already deducted below"
          }
        />
      </div>

      {totalOutstanding > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? "توزيع المستحقات حسب عمر الدين" : "Outstanding by age"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "كلما تقادمت المطالبة زادت أولوية سدادها."
                : "The older a charge, the higher its settlement priority."}
            </p>
          </div>
          <AgingBar segments={agingSegments} total={totalOutstanding} />
          <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
            {agingSegments.map((s) => (
              <div key={s.key} className="rounded-xl border border-border/50 bg-slate-50 p-2.5 dark:bg-slate-900/50">
                <p className="truncate text-[10px] font-medium text-slate-500">{s.label}</p>
                <p className="text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                  <Money amount={s.amount} locale={locale} />
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {blocked.length > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              {isAr
                ? `${blocked.length} مطالبة مسددة جزئيًا لا يمكن سدادها إلكترونيًا`
                : `${blocked.length} partially settled charge(s) cannot be paid online`}
            </p>
            <p className="leading-relaxed text-amber-800/90 dark:text-amber-200/80">
              {isAr
                ? "بوابة الدفع الإلكتروني تُحصّل قيمة المطالبة كاملة ولا تخصم ما سبق سداده، لذلك تم استبعاد هذه المطالبات من السداد الإلكتروني لحمايتك من التحصيل الزائد. المتبقي الفعلي عليها موضّح أمام كل مطالبة، ويُسدَّد عبر إدارة الكيان."
                : "The online gateway bills a charge at its full original value and does not deduct what you have already paid, so these charges are excluded from online settlement to protect you from being overcharged. The true remaining balance is shown on each one, and can be settled through management."}
            </p>
            <p className="font-semibold tabular-nums text-amber-900 dark:text-amber-200">
              {isAr ? "إجمالي المتبقي عليها: " : "Remaining on these: "}
              <Money amount={blockedOutstanding} locale={locale} />{" "}
              {currency}
            </p>
          </div>
        </div>
      ) : null}

      {dues.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<BucketFilter>
            ariaLabel={isAr ? "تصفية حسب عمر الدين" : "Filter by age"}
            value={bucket}
            onChange={setBucket}
            options={[
              { value: "ALL", label: isAr ? "الكل" : "All", count: dues.length },
              ...AGING_BUCKETS.filter((b) => dues.some((d) => d.bucket === b)).map((b) => ({
                value: b as BucketFilter,
                label: isAr ? AGING_BUCKET_LABELS[b].ar : AGING_BUCKET_LABELS[b].en,
                count: dues.filter((d) => d.bucket === b).length,
                tone: b === "CURRENT" ? ("accent" as const) : ("negative" as const),
              })),
            ]}
          />
          <SearchBox
            locale={locale}
            value={query}
            onChange={setQuery}
            placeholder={isAr ? "ابحث بالبيان أو الوحدة أو التاريخ" : "Search description, unit, or date"}
          />
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {dues.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-5 text-emerald-500" />}
          title={isAr ? "لا توجد مستحقات مالية مفتوحة" : "No open dues"}
          description={
            isAr
              ? "كل المطالبات الصادرة على وحداتك مسددة بالكامل. سيظهر هنا أي استحقاق جديد فور إصداره."
              : "Every charge issued on your units is fully settled. Any new charge will appear here as soon as it is issued."
          }
        />
      ) : (
        <div className="space-y-3">
          {visiblePayableIds.length > 0 ? (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleAllVisible}
                className="h-9 gap-2 rounded-xl text-xs font-semibold"
              >
                {allVisibleSelected ? (
                  <CheckSquare className="size-4 text-indigo-600" />
                ) : (
                  <Square className="size-4" />
                )}
                <span>
                  {allVisibleSelected
                    ? isAr
                      ? "إلغاء تحديد الكل"
                      : "Deselect all"
                    : isAr
                      ? "تحديد الكل"
                      : "Select all"}
                </span>
              </Button>
              <span className="text-xs font-medium text-slate-500">
                {isAr
                  ? `محدد ${selected.size} من ${payable.length} مطالبة قابلة للسداد`
                  : `${selected.size} of ${payable.length} payable charges selected`}
              </span>
            </div>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={<Landmark className="size-5" />}
              title={isAr ? "لا توجد مطالبات مطابقة" : "No matching charges"}
              description={
                isAr
                  ? "لا توجد مطالبات تطابق الفلتر أو كلمة البحث الحالية. جرّب توسيع نطاق البحث."
                  : "No charges match the current filter or search term. Try widening your search."
              }
            />
          ) : (
            visible.map((d) => {
              const isChecked = selected.has(d.id);
              const isBlocked = d.isPartiallySettled;
              return (
                <div
                  key={d.id}
                  className={`rounded-2xl border p-4 transition-colors ${
                    isBlocked
                      ? "border-amber-500/40 bg-amber-500/[0.04]"
                      : isChecked
                        ? "border-indigo-500/60 bg-indigo-50/40 dark:bg-indigo-950/30"
                        : "border-border/70 bg-card"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <Checkbox
                        checked={isChecked && !isBlocked}
                        disabled={isBlocked}
                        onCheckedChange={(checked) => toggle(d.id, checked === true)}
                        className="mt-0.5 size-5 rounded-md data-[state=checked]:border-indigo-600 data-[state=checked]:bg-indigo-600"
                        aria-label={
                          isBlocked
                            ? isAr
                              ? "غير متاح للسداد الإلكتروني"
                              : "Not available for online payment"
                            : isAr
                              ? "تحديد المطالبة للسداد"
                              : "Select charge for payment"
                        }
                      />
                      <div className="min-w-0 space-y-1.5">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic due")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {d.unitCode ? (
                            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {d.unitCode}
                            </span>
                          ) : null}
                          <span>
                            {isAr ? "الاستحقاق:" : "Due:"} {d.due_date}
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
                    </div>

                    <div className="text-end">
                      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                        <Money amount={d.outstanding} locale={locale} />
                      </p>
                      <p className="text-[11px] font-medium text-slate-500">
                        {isAr ? "المتبقي" : "Outstanding"}
                      </p>
                    </div>
                  </div>

                  {isBlocked ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 border-t border-amber-500/30 pt-3 text-xs">
                      <div>
                        <p className="text-[10px] text-slate-500">
                          {isAr ? "قيمة المطالبة" : "Charged"}
                        </p>
                        <p className="font-semibold tabular-nums">
                          <Money amount={d.amount} locale={locale} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">{isAr ? "المسدد" : "Paid"}</p>
                        <p className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          <Money amount={d.paid} locale={locale} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">
                          {isAr ? "طريقة السداد" : "Settle via"}
                        </p>
                        <p className="font-semibold text-amber-700 dark:text-amber-300">
                          {isAr ? "إدارة الكيان" : "Management"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}

      {payable.length > 0 ? (
        <div className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? "إجمالي المحدد للسداد الآن" : "Total selected for payment"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-indigo-600 sm:text-3xl dark:text-indigo-400">
                <Money amount={selectedTotal} locale={locale} />
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {currency} · {selected.size} {isAr ? "مطالبة" : "charges"}
              </span>
            </div>
          </div>

          <Button
            type="button"
            disabled={selected.size === 0 || isPending}
            onClick={handlePay}
            className="h-12 w-full gap-2 rounded-xl bg-indigo-600 px-8 text-sm font-bold text-white hover:bg-indigo-700 sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ تجهيز بوابة الدفع…" : "Preparing gateway…"}
              </>
            ) : (
              <>
                <Lock className="size-4" />
                <span>{isAr ? "السداد الآن عبر بوابة آمنة" : "Pay now via secure gateway"}</span>
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
