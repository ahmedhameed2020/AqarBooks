"use client";

import { useMemo, useState } from "react";
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
  kind: "CHARGE" | "PAYMENT";
  description: string;
  unitCode: string | null;
  reference: string | null;
  amount: number;
}

type KindFilter = "ALL" | "CHARGE" | "PAYMENT";

export function PortalStatementClient({
  organizationName,
  currency,
  memberName,
  movements,
  unitCodes,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  /** Ascending by date -- the running balance depends on that order. */
  movements: PortalStatementMovement[];
  unitCodes: string[];
  locale: string;
}) {
  const isAr = locale === "ar";

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [unit, setUnit] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  // Everything the account owed before the period opens. Filtering a statement
  // by date without carrying this forward would produce a closing balance that
  // is arithmetically wrong -- the single most damaging thing a statement can
  // get wrong, so it is computed from the unfiltered series.
  const openingBalance = useMemo(() => {
    if (!from) return 0;
    return movements
      .filter((m) => m.date < from)
      .reduce((sum, m) => sum + (m.kind === "CHARGE" ? m.amount : -m.amount), 0);
  }, [movements, from]);

  // The date window alone, before the descriptive filters. The running balance
  // has to accumulate over this series: hiding payments (a "charges only"
  // view) must not silently rewrite the balance column.
  const inPeriod = useMemo(
    () => movements.filter((m) => (!from || m.date >= from) && (!to || m.date <= to)),
    [movements, from, to],
  );

  const withBalance = useMemo(() => {
    let running = openingBalance;
    return inPeriod.map((m) => {
      running += m.kind === "CHARGE" ? m.amount : -m.amount;
      return { ...m, balanceAfter: running };
    });
  }, [inPeriod, openingBalance]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = withBalance.filter((m) => {
      if (kind !== "ALL" && m.kind !== kind) return false;
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

  const totalCharges = inPeriod.filter((m) => m.kind === "CHARGE").reduce((s, m) => s + m.amount, 0);
  const totalPaid = inPeriod.filter((m) => m.kind === "PAYMENT").reduce((s, m) => s + m.amount, 0);
  const closingBalance = openingBalance + totalCharges - totalPaid;

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
              m.kind === "CHARGE" ? (isAr ? "مطالبة" : "Charge") : isAr ? "سداد" : "Payment",
            description: m.description,
            unitCode: m.unitCode || "—",
            reference: m.reference || "—",
            debit: m.kind === "CHARGE" ? m.amount : null,
            credit: m.kind === "PAYMENT" ? m.amount : null,
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
    const lines: StatementLine[] = inPeriod.map((m) => ({
      date: m.date,
      kind: m.kind,
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
          hint={isAr ? "سندات معتمدة خلال المدة" : "Posted receipts in the period"}
        />
        <StatCard
          label={isAr ? "الرصيد آخر المدة" : "Closing balance"}
          icon={<Wallet className="size-4 text-indigo-500" />}
          tone={closingBalance > 0 ? "negative" : "positive"}
          value={
            <Money
              amount={closingBalance}
              locale={locale}
              tone={closingBalance > 0 ? "negative" : "positive"}
            />
          }
          hint={
            closingBalance > 0
              ? isAr
                ? "رصيد مستحق بذمتكم"
                : "Outstanding balance due"
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
                count: inPeriod.filter((m) => m.kind === "PAYMENT").length,
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
                const isCharge = m.kind === "CHARGE";
                return (
                  <tr key={m.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap p-3 font-mono text-slate-500">{m.date}</td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-[10px] font-semibold ${
                          isCharge
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {isCharge ? (isAr ? "مطالبة" : "Charge") : isAr ? "سداد" : "Payment"}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                      {m.description}
                    </td>
                    <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {m.unitCode || "—"}
                    </td>
                    <td className="p-3 font-mono text-slate-400">{m.reference || "—"}</td>
                    <td className="p-3 text-end font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                      {isCharge ? <Money amount={m.amount} locale={locale} /> : "—"}
                    </td>
                    <td className="p-3 text-end font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {isCharge ? "—" : <Money amount={m.amount} locale={locale} />}
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
                  <Money amount={totalCharges} locale={locale} />
                </td>
                <td className="p-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400">
                  <Money amount={totalPaid} locale={locale} />
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
