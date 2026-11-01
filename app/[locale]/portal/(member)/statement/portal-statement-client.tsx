"use client";

import { useEffect, useMemo, useState } from "react";
import { getOwnPositionAsOfAction } from "@/lib/actions/member-portal-receipts";
import type { OwnPosition } from "@/lib/portal/statement-position";
import { buildLedger, isDebitKind, isInfoKind } from "@/lib/portal/statement-ledger";
import { FileText, TrendingDown, TrendingUp, Wallet, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { generateAccountStatementPdf, type StatementLine } from "@/lib/reports/account-statement-pdf";
import { formatAmount, periodLabel } from "@/lib/portal/portal-finance";
import {
  DateRangeFilter,
  EmptyState,
  ExportButtons,
  PortalPageHeader,
  SearchBox,
  Segmented,
  StatCard,
} from "../portal-ui";

export interface PortalStatementMovement {
  id: string;
  date: string;
  /** APPLICATION / REVERSAL are informational lines of a customer-advance credit: dated, with a net effect of zero. */
  kind: "CHARGE" | "PAYMENT" | "PAYMENT_REVERSAL" | "SETTLEMENT" | "SETTLEMENT_REVERSAL" | "APPLICATION" | "REVERSAL";
  description: string;
  unitCode: string | null;
  reference: string | null;
  amount: number;
}

type KindFilter = "ALL" | "CHARGE" | "PAYMENT";

const isInfo = (m: { kind: PortalStatementMovement["kind"] }) => isInfoKind(m.kind);
const isDebit = (m: { kind: PortalStatementMovement["kind"] }) => isDebitKind(m.kind);
/** the payments side of the ledger: receipts, settlements by another payer, and the reversal of either */
const isCreditSide = (k: PortalStatementMovement["kind"]) => k === "PAYMENT" || k === "PAYMENT_REVERSAL" || k === "SETTLEMENT" || k === "SETTLEMENT_REVERSAL";

export function PortalStatementClient({
  organizationName,
  currency,
  memberName,
  movements,
  unitCodes,
  position: positionToday = null,
  creditStranded = false,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  /** Ascending by date -- the running balance depends on that order. */
  movements: PortalStatementMovement[];
  unitCodes: string[];
  /** Arrears, available credit and net as of today (server value); the client refetches it as of the end of the filter. */
  position?: OwnPosition | null;
  /** the member still holds credit on a receipt of a unit they no longer own (shown as on hold) */
  creditStranded?: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [unit, setUnit] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  // The position cards are as of the END of the window: the filter's "to" date, today when it is empty.
  const [asOf, setAsOf] = useState<OwnPosition | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!to) return;
    let cancelled = false;
    getOwnPositionAsOfAction(to)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setAsOf(r.position);
          setFailedFor(null);
        } else setFailedFor(to);
      })
      .catch(() => {
        if (!cancelled) setFailedFor(to);
      });
    return () => {
      cancelled = true;
    };
  }, [to, attempt]);
  const position = !to ? positionToday : asOf?.asOf === to ? asOf : null;
  const positionFailed = Boolean(to) && position === null && failedFor === to;
  const positionLoading = Boolean(to) && position === null && !positionFailed;

  // One ledger for the screen, the PDF and the Excel export (lib/portal/statement-ledger.ts): opening balance carried from the whole
  // unfiltered series, running balance over the date window, and the totals that make closing = opening + debits - credits.
  const ledger = useMemo(() => buildLedger(movements, from, to), [movements, from, to]);
  const { openingBalance, inPeriod, totalCharges, totalReceipts, totalReversals, totalPaid, closingBalance } = ledger;
  const withBalance = ledger.rows;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = withBalance.filter((m) => {
      if (kind !== "ALL" && !(kind === "CHARGE" ? m.kind === "CHARGE" : isCreditSide(m.kind))) return false;
      if (unit !== "ALL" && m.unitCode !== unit) return false;
      if (!q) return true;
      return (
        m.description.toLowerCase().includes(q) ||
        (m.unitCode ?? "").toLowerCase().includes(q) ||
        (m.reference ?? "").toLowerCase().includes(q) ||
        m.date.includes(q)
      );
    });
    return newestFirst ? [...filtered].reverse() : filtered;
  }, [withBalance, kind, unit, query, newestFirst]);

  const label = periodLabel(from || null, to || null, isAr);
  const hasFilters = Boolean(from || to || query || kind !== "ALL" || unit !== "ALL");

  async function handleExportExcel() {
    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Statement_${memberName.replace(/\s+/g, "_") || "Owner"}`,
        title: isAr ? `كشف حساب المالك: ${memberName}` : `Owner Account Statement: ${memberName}`,
        organizationName,
        currencyLabel: currency,
        dateRangeLabel: label,
        columns: [
          { header: isAr ? "التاريخ" : "Date", key: "date", width: 14 },
          { header: isAr ? "نوع الحركة" : "Type", key: "typeLabel", width: 16 },
          { header: isAr ? "البيان" : "Description", key: "description", width: 32 },
          { header: isAr ? "الوحدة" : "Unit", key: "unitCode", width: 14 },
          { header: isAr ? "المرجع" : "Reference", key: "reference", width: 18 },
          {
            header: isAr ? `مدين (${currency})` : `Debit (${currency})`,
            key: "debit",
            width: 16,
            isNumber: true,
          },
          {
            header: isAr ? `دائن (${currency})` : `Credit (${currency})`,
            key: "credit",
            width: 16,
            isNumber: true,
          },
          {
            header: isAr ? `الرصيد الجاري (${currency})` : `Running balance (${currency})`,
            key: "balance",
            width: 20,
            isNumber: true,
          },
        ],
        // Chronological regardless of the on-screen sort: a running balance
        // column read newest-first is nonsense on paper.
        rows: [
          {
            date: from || "",
            typeLabel: isAr ? "رصيد أول المدة" : "Opening balance",
            description: "",
            unitCode: "",
            reference: "",
            debit: null,
            credit: null,
            balance: openingBalance,
          },
          ...withBalance.map((m) => ({
            date: m.date,
            typeLabel:
              m.kind === "CHARGE" ? (isAr ? "مطالبة" : "Charge") : m.kind === "PAYMENT" ? (isAr ? "سداد" : "Payment") : m.kind === "SETTLEMENT" ? (isAr ? "تسوية" : "Settlement") : m.kind === "SETTLEMENT_REVERSAL" ? (isAr ? "عكس تسوية" : "Settlement reversed") : m.kind === "PAYMENT_REVERSAL" ? (isAr ? "عكس سداد" : "Receipt reversed") : m.kind === "APPLICATION" ? (isAr ? "تطبيق رصيد (معلومة)" : "Credit applied (info)") : isAr ? "عكس تطبيق (معلومة)" : "Credit reversed (info)",
            description: m.description,
            unitCode: m.unitCode || "—",
            reference: m.reference || "—",
            debit: m.debit,
            credit: m.credit,
            balance: m.balanceAfter,
          })),
        ],
        summaries: [
          {
            label: isAr ? "رصيد أول المدة" : "Opening balance",
            value: `${formatAmount(openingBalance, locale)} ${currency}`,
          },
          {
            label: isAr ? "إجمالي المطالبات" : "Total charges",
            value: `${formatAmount(totalCharges, locale)} ${currency}`,
          },
          {
            label: isAr ? "إجمالي المسدد" : "Total paid",
            value: `${formatAmount(totalPaid, locale)} ${currency}`,
          },
          {
            label: isAr ? "الرصيد آخر المدة" : "Closing balance",
            value: `${formatAmount(closingBalance, locale)} ${currency}`,
          },
        ],
      },
      locale,
    );
  }

  function handleExportPdf() {
    const lines: StatementLine[] = inPeriod.filter((m) => !isInfo(m)).map((m) => ({
      date: m.date,
      // the PDF has two sides only: a settlement by another payer is a payment line, its reversal a reversal line (the description says which)
      kind: (m.kind === "SETTLEMENT" ? "PAYMENT" : m.kind === "SETTLEMENT_REVERSAL" ? "PAYMENT_REVERSAL" : m.kind) as "CHARGE" | "PAYMENT" | "PAYMENT_REVERSAL",
      description: m.description,
      unitCode: m.unitCode,
      reference: m.reference,
      amount: m.amount,
    }));

    generateAccountStatementPdf(
      {
        organizationName,
        propertyName: isAr ? "بوابة الملاك والمستثمرين" : "Owner & Investor Portal",
        currency,
        accountName: memberName,
        periodStart: from || (inPeriod[0]?.date ?? null),
        periodEnd: to || (inPeriod[inPeriod.length - 1]?.date ?? null),
        openingBalance,
        lines,
      },
      locale,
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "كشف الحساب المالي" : "Account Statement"}
        description={
          isAr
            ? "كل مطالبة صدرت عليك وكل سند سُدِّد منك، مرتبة زمنيًا مع الرصيد الجاري بعد كل حركة."
            : "Every charge raised against you and every receipt posted from you, in chronological order with the running balance after each movement."
        }
      >
        <ExportButtons
          locale={locale}
          disabled={inPeriod.length === 0}
          onExcel={handleExportExcel}
          onPdf={handleExportPdf}
          pdfLabel={isAr ? "طباعة كشف الحساب" : "Print statement"}
        />
      </PortalPageHeader>

      {positionFailed && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200" data-testid="portal-position-error">
          <span>{isAr ? "تعذّر تحميل المركز المالي في التاريخ المحدد." : "The position at the selected date could not be loaded."}</span>
          <button
            type="button"
            onClick={() => {
              setFailedFor(null);
              setAttempt((n) => n + 1);
            }}
            className="rounded-lg border border-rose-300 px-3 py-1 font-bold hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900/40"
            data-testid="portal-position-retry"
          >
            {isAr ? "إعادة المحاولة" : "Retry"}
          </button>
        </div>
      )}

      {(position || positionLoading) && (
        <div className="space-y-2" data-testid="portal-position">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            {isAr ? (
              <>المركز المالي {to ? <>حتى <bdi>{to}</bdi></> : "حتى اليوم"}: الصافي = المتأخرات والمستحقات المفتوحة ناقص الرصيد الدائن المتاح. تطبيق الرصيد على مطالبة أو عكسه لا يغيّر الصافي.</>
            ) : (
              `Position ${to ? `as of ${to}` : "to date"}: net = open dues minus the available credit. Applying credit to a charge, or reversing it, does not change the net.`
            )}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy={positionLoading}>
            <StatCard
              label={isAr ? "المتأخرات" : "Arrears"}
              icon={<TrendingDown className="size-4 text-rose-500" />}
              tone={position && position.arrears > 0 ? "negative" : undefined}
              value={<span data-testid="pos-arrears">{position ? <Money amount={position.arrears} locale={locale} tone={position.arrears > 0 ? "negative" : undefined} /> : "…"}</span>}
              hint={isAr ? "مطالبات حلّ موعدها ولم تُسدَّد" : "Past due and not yet settled"}
            />
            <StatCard
              label={isAr ? "الرصيد الدائن المتاح" : "Available credit"}
              icon={<Wallet className="size-4 text-indigo-500" />}
              tone="positive"
              value={<span data-testid="pos-credit">{position ? <Money amount={position.credit.remaining} locale={locale} tone="positive" /> : "…"}</span>}
              hint={isAr ? "دفعات مقدمة لم تُطبَّق بعد" : "Advances not applied yet"}
            />
            <StatCard
              label={isAr ? "الصافي" : "Net"}
              icon={<Scale className="size-4 text-slate-400" />}
              tone={position && position.net > 0 ? "negative" : "positive"}
              value={<span data-testid="pos-net">{position ? <Money amount={position.net} locale={locale} tone={position.net > 0 ? "negative" : "positive"} /> : "…"}</span>}
              hint={position && position.net < 0 ? (isAr ? "لصالحكم" : "In your favour") : isAr ? "المطلوب منكم" : "Owed by you"}
            />
          </div>
          {creditStranded && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200" data-testid="portal-stranded">
              {isAr
                ? "معلّق — لم تعد مرتبطًا بوحدة هذا الرصيد الدائن. لا يمكن تطبيقه على مطالبات وحدة أخرى؛ تواصل مع الإدارة."
                : "On hold — you are no longer linked to the unit this credit was received for. It cannot be applied to another unit's charges; please contact the management."}
            </p>
          )}
          {position && position.legacyUnallocated > 0 && (
            <p className="text-[11px] text-slate-500" data-testid="pos-legacy">
              {isAr ? (
                <>منها <bdi>{formatAmount(position.legacyUnallocated, locale)}</bdi> دفعات قديمة غير مخصّصة على الحساب (ليست رصيدًا مقدمًا ولا يمكن تطبيقها).</>
              ) : (
                `Includes ${formatAmount(position.legacyUnallocated, locale)} of older unallocated payments on account (not advance credit; they cannot be applied).`
              )}
            </p>
          )}
          {position && position.credit.received > 0 && (
            <p className="text-[11px] text-slate-500" data-testid="pos-detail">
              {isAr ? (
                <>تفصيل الرصيد الدائن: مستلم <bdi>{formatAmount(position.credit.received, locale)}</bdi> — مطبَّق <bdi>{formatAmount(position.credit.applied, locale)}</bdi> — متبقٍ <bdi>{formatAmount(position.credit.remaining, locale)}</bdi></>
              ) : (
                `Credit detail: received ${formatAmount(position.credit.received, locale)} — applied ${formatAmount(position.credit.applied, locale)} — left ${formatAmount(position.credit.remaining, locale)}`
              )}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={isAr ? "رصيد أول المدة" : "Opening balance"}
          icon={<Scale className="size-4 text-slate-400" />}
          value={<Money amount={openingBalance} locale={locale} />}
          hint={from ? `${isAr ? "قبل" : "Before"} ${from}` : isAr ? "من بداية التعامل" : "From inception"}
        />
        <StatCard
          label={isAr ? "إجمالي المطالبات" : "Total charges"}
          icon={<TrendingDown className="size-4 text-rose-500" />}
          value={<Money amount={totalCharges} locale={locale} />}
          hint={isAr ? "مبالغ قُيّدت عليك خلال المدة" : "Debited during the period"}
        />
        <StatCard
          label={isAr ? "إجمالي المسدد" : "Total paid"}
          icon={<TrendingUp className="size-4 text-emerald-500" />}
          value={<Money amount={totalPaid} locale={locale} tone="positive" />}
          hint={totalReversals > 0 ? (isAr ? "صافٍ بعد خصم الإيصالات الملغاة" : "Net of voided receipts") : isAr ? "سندات معتمدة خلال المدة" : "Posted receipts in the period"}
        />
        <StatCard
          label={isAr ? "الرصيد آخر المدة" : "Closing balance"}
          icon={<Wallet className="size-4 text-indigo-500" />}
          tone={closingBalance > 0 ? "negative" : "positive"}
          value={
            <span data-testid="ledger-closing">
              <Money
                amount={closingBalance}
                locale={locale}
                tone={closingBalance > 0 ? "negative" : "positive"}
              />
            </span>
          }
          hint={
            closingBalance > 0
              ? isAr
                ? "رصيد مستحق بذمتكم"
                : "Outstanding balance due"
              : closingBalance < 0
                ? isAr
                  ? "رصيد دائن لصالحكم (دفعات مقدمة)"
                  : "Credit in your favour (advances)"
                : isAr
                ? "الحساب مسوّى بالكامل"
                : "Account fully settled"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter
          locale={locale}
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          onReset={() => {
            setFrom("");
            setTo("");
          }}
        />
        <SearchBox
          locale={locale}
          value={query}
          onChange={setQuery}
          placeholder={isAr ? "ابحث بالبيان أو المرجع أو الوحدة" : "Search description, reference, or unit"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented<KindFilter>
            ariaLabel={isAr ? "تصفية نوع الحركة" : "Filter movement type"}
            value={kind}
            onChange={setKind}
            options={[
              { value: "ALL", label: isAr ? "كل الحركات" : "All", count: inPeriod.length },
              {
                value: "CHARGE",
                label: isAr ? "المطالبات" : "Charges",
                tone: "negative",
                count: inPeriod.filter((m) => m.kind === "CHARGE").length,
              },
              {
                value: "PAYMENT",
                label: isAr ? "المدفوعات" : "Payments",
                tone: "positive",
                count: inPeriod.filter((m) => isCreditSide(m.kind)).length,
              },
            ]}
          />

          {unitCodes.length > 1 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="statement-unit" className="text-[11px] font-semibold text-slate-500">
                {isAr ? "الوحدة" : "Unit"}
              </label>
              <select
                id="statement-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-9 rounded-xl border border-border/70 bg-card px-3 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="ALL">{isAr ? "كل الوحدات" : "All units"}</option>
                {unitCodes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="rounded-lg border border-border/70 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {newestFirst
              ? isAr
                ? "الأحدث أولًا"
                : "Newest first"
              : isAr
                ? "الأقدم أولًا"
                : "Oldest first"}
          </button>
          <span className="text-xs font-medium text-slate-400">
            {isAr ? `عرض ${visible.length} حركة` : `Showing ${visible.length} movements`}
          </span>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title={
            hasFilters
              ? isAr
                ? "لا توجد حركات مطابقة"
                : "No matching movements"
              : isAr
                ? "لم تُسجَّل أي حركة مالية بعد"
                : "No financial activity yet"
          }
          description={
            hasFilters
              ? isAr
                ? "لا توجد حركات ضمن الفترة أو الفلاتر المحددة. جرّب توسيع نطاق التاريخ أو إلغاء الفلاتر."
                : "No movements fall within the selected period or filters. Try widening the date range or clearing the filters."
              : isAr
                ? "سيظهر هنا كشف حسابك الكامل فور صدور أول مطالبة أو تسجيل أول سداد على وحداتك."
                : "Your full statement appears here as soon as the first charge is issued or the first payment is posted on your units."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              {isAr ? `كشف حساب ${memberName} — ${label}` : `Account statement for ${memberName} — ${label}`}
            </caption>
            <thead>
              <tr className="border-b border-border/70 bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "التاريخ" : "Date"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "النوع" : "Type"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "البيان" : "Description"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "الوحدة" : "Unit"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "المرجع" : "Reference"}
                </th>
                <th scope="col" className="p-3 text-end font-semibold">
                  {isAr ? "مدين" : "Debit"}
                </th>
                <th scope="col" className="p-3 text-end font-semibold">
                  {isAr ? "دائن" : "Credit"}
                </th>
                <th scope="col" className="p-3 text-end font-semibold">
                  {isAr ? "الرصيد" : "Balance"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visible.map((m) => {
                const isCharge = isDebit(m);
                const info = isInfo(m);
                return (
                  <tr key={m.id} data-kind={m.kind} className={`transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${info ? "bg-sky-50/40 dark:bg-sky-950/10" : ""}`}>
                    <td className="whitespace-nowrap p-3 font-mono text-slate-500">{m.date}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-[10px] font-semibold ${
                          info
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                            : isCharge
                              ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {m.kind === "SETTLEMENT" ? (isAr ? "تسوية" : "Settlement") : m.kind === "SETTLEMENT_REVERSAL" ? (isAr ? "عكس تسوية" : "Settlement reversed") : m.kind === "PAYMENT_REVERSAL" ? (isAr ? "عكس سداد" : "Receipt reversed") : m.kind === "APPLICATION" ? (isAr ? "تطبيق رصيد" : "Credit applied") : m.kind === "REVERSAL" ? (isAr ? "عكس تطبيق" : "Reversed") : isCharge ? (isAr ? "مطالبة" : "Charge") : isAr ? "سداد" : "Payment"}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                      {m.description}
                      {info && (
                        <span className="mt-0.5 block text-[11px] font-medium text-sky-700 dark:text-sky-300" data-testid="portal-info-line">
                          {isAr ? "معلومة — بلا أثر على الرصيد" : "Information — no effect on the balance"}: <bdi>{formatAmount(m.amount, locale)}</bdi>
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {m.unitCode || "—"}
                    </td>
                    <td className="p-3 font-mono text-slate-400">{m.reference || "—"}</td>
                    <td className="p-3 text-end font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {isCharge ? <Money amount={m.amount} locale={locale} /> : "—"}
                    </td>
                    <td className="p-3 text-end font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {isCharge || info ? "—" : <Money amount={m.amount} locale={locale} />}
                    </td>
                    <td className="p-3 text-end font-bold tabular-nums text-slate-900 dark:text-white">
                      <Money amount={m.balanceAfter} locale={locale} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 bg-slate-50 font-bold dark:bg-slate-900/60">
                <td className="p-3 text-slate-600 dark:text-slate-300" colSpan={5}>
                  {isAr ? "إجمالي المدة" : "Period total"}
                </td>
                <td className="p-3 text-end tabular-nums text-rose-600 dark:text-rose-400">
                  <Money amount={totalCharges + totalReversals} locale={locale} />
                </td>
                <td className="p-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400">
                  <Money amount={totalReceipts} locale={locale} />
                </td>
                <td className="p-3 text-end tabular-nums text-slate-900 dark:text-white">
                  <Money amount={closingBalance} locale={locale} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {kind !== "ALL" || unit !== "ALL" || query ? (
        <p className="text-[11px] leading-relaxed text-slate-400">
          {isAr
            ? "ملاحظة: عمود الرصيد الجاري يُحتسب على كل حركات الفترة، ولا يتأثر بفلاتر النوع أو الوحدة أو البحث — حتى يظل الرصيد صحيحًا حسابيًا. الإجماليات أسفل الجدول تخص كامل الفترة كذلك."
            : "Note: the running balance is computed over every movement in the period and is unaffected by the type, unit, or search filters, so it stays arithmetically correct. The totals below the table likewise cover the full period."}
        </p>
      ) : null}
    </div>
  );
}
