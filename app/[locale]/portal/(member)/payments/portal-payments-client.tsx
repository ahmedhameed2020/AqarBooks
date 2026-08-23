"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Receipt, TriangleAlert, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { generatePortalReportPdf } from "@/lib/reports/portal-report-pdf";
import { formatAmount, periodLabel } from "@/lib/portal/portal-finance";
import { METHOD_LABELS } from "@/lib/portal/row-types";
import { PortalPrintReceiptButton } from "./portal-print-receipt-button";
import {
  DateRangeFilter,
  EmptyState,
  ExportButtons,
  PortalPageHeader,
  SearchBox,
  Segmented,
  StatCard,
} from "../portal-ui";

export interface PortalPaymentItem {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  receiptNo: string;
  memo: string | null;
  unallocated: number;
  unitCode: string | null;
}

export interface OnlineTxnItem {
  id: string;
  amount: number;
  provider: string;
  status: string;
  failure_message: string | null;
  created_at: string;
}

const TXN_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  PENDING: { ar: "قيد المعالجة", en: "Processing" },
  FAILED: { ar: "فشلت", en: "Failed" },
  EXPIRED: { ar: "انتهت صلاحيتها", en: "Expired" },
};

export function PortalPaymentsClient({
  organizationName,
  currency,
  memberName,
  payments,
  onlineTxns,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  payments: PortalPaymentItem[];
  onlineTxns: OnlineTxnItem[];
  locale: string;
}) {
  const isAr = locale === "ar";

  const [method, setMethod] = useState<string>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");

  const methodLabel = (m: string) =>
    isAr ? (METHOD_LABELS[m]?.ar ?? m) : (METHOD_LABELS[m]?.en ?? m);

  // Built from what the member actually has, not a hardcoded list -- the
  // previous ledger offered three of the five methods, so cheque and online
  // receipts were unreachable by filter.
  const availableMethods = useMemo(
    () => [...new Set(payments.map((p) => p.method))].sort(),
    [payments],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments.filter((p) => {
      if (method !== "ALL" && p.method !== method) return false;
      if (from && p.payment_date < from) return false;
      if (to && p.payment_date > to) return false;
      if (!q) return true;
      return (
        p.receiptNo.toLowerCase().includes(q) ||
        (p.memo ?? "").toLowerCase().includes(q) ||
        (p.unitCode ?? "").toLowerCase().includes(q) ||
        p.payment_date.includes(q)
      );
    });
  }, [payments, method, from, to, query]);

  const totalAll = payments.reduce((s, p) => s + p.amount, 0);
  const totalVisible = visible.reduce((s, p) => s + p.amount, 0);
  const totalUnallocated = payments.reduce((s, p) => s + p.unallocated, 0);
  const label = periodLabel(from || null, to || null, isAr);
  const hasFilters = Boolean(from || to || query || method !== "ALL");

  const reportRows = visible.map((p) => ({
    receiptNo: p.receiptNo,
    date: p.payment_date,
    methodLabel: methodLabel(p.method),
    unitCode: p.unitCode || "—",
    memo: p.memo || "—",
    unallocated: p.unallocated,
    amount: p.amount,
  }));

  async function handleExportExcel() {
    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Receipts_${memberName.replace(/\s+/g, "_") || "Owner"}`,
        title: isAr ? `سجل سندات السداد: ${memberName}` : `Payment Receipts Ledger: ${memberName}`,
        organizationName,
        currencyLabel: currency,
        dateRangeLabel: label,
        columns: [
          { header: isAr ? "رقم السند" : "Receipt no", key: "receiptNo", width: 18 },
          { header: isAr ? "تاريخ السداد" : "Date", key: "date", width: 14 },
          { header: isAr ? "طريقة الدفع" : "Method", key: "methodLabel", width: 18 },
          { header: isAr ? "الوحدة" : "Unit", key: "unitCode", width: 14 },
          { header: isAr ? "البيان" : "Memo", key: "memo", width: 28 },
          {
            header: isAr ? `غير مخصص (${currency})` : `Unallocated (${currency})`,
            key: "unallocated",
            width: 18,
            isNumber: true,
          },
          {
            header: isAr ? `المبلغ المسدد (${currency})` : `Amount (${currency})`,
            key: "amount",
            width: 18,
            isNumber: true,
          },
        ],
        rows: reportRows,
        summaries: [
          {
            label: isAr ? "إجمالي المعروض" : "Total shown",
            value: `${formatAmount(totalVisible, locale)} ${currency}`,
          },
          { label: isAr ? "عدد السندات" : "Receipts", value: visible.length },
          {
            label: isAr ? "مبالغ غير مخصصة" : "Unallocated",
            value: `${formatAmount(totalUnallocated, locale)} ${currency}`,
          },
        ],
      },
      locale,
    );
  }

  function handleExportPdf() {
    generatePortalReportPdf(
      {
        organizationName,
        documentTitle: isAr ? "سجل سندات السداد" : "Payment Receipts Ledger",
        documentSubtitle: isAr
          ? "السندات المعتمدة والمقيدة على حسابك"
          : "Posted receipts recorded against your account",
        accountName: memberName,
        currency,
        periodLabel: label,
        kpis: [
          {
            label: isAr ? "إجمالي المسدد" : "Total paid",
            value: formatAmount(totalVisible, locale),
            tone: "settled",
            emphasis: true,
          },
          { label: isAr ? "عدد السندات" : "Receipts", value: String(visible.length) },
          {
            label: isAr ? "غير مخصص بعد" : "Unallocated",
            value: formatAmount(
              visible.reduce((s, p) => s + p.unallocated, 0),
              locale,
            ),
          },
          {
            label: isAr ? "آخر سداد" : "Latest payment",
            value: visible[0]?.payment_date ?? "—",
          },
        ],
        columns: [
          { header: isAr ? "رقم السند" : "Receipt no", key: "receiptNo" },
          { header: isAr ? "التاريخ" : "Date", key: "date" },
          { header: isAr ? "طريقة الدفع" : "Method", key: "methodLabel" },
          { header: isAr ? "الوحدة" : "Unit", key: "unitCode" },
          { header: isAr ? "البيان" : "Memo", key: "memo" },
          { header: isAr ? "المبلغ" : "Amount", key: "amount", numeric: true, strong: true },
        ],
        rows: reportRows.map((r) => ({ ...r, amount: formatAmount(r.amount, locale) })),
        totalRow: {
          receiptNo: isAr ? "الإجمالي" : "Total",
          amount: formatAmount(totalVisible, locale),
        },
        notes:
          totalUnallocated > 0
            ? [
                isAr
                  ? "المبالغ غير المخصصة هي دفعات مُحصَّلة ومقيدة لصالحك لكنها لم تُخصم بعد من مطالبة بعينها، وتظل رصيدًا لك."
                  : "Unallocated amounts are receipts collected and credited to you that have not yet been applied to a specific charge; they remain to your credit.",
              ]
            : undefined,
        emptyMessage: isAr ? "لا توجد سندات سداد في هذه الفترة." : "No receipts in this period.",
      },
      locale,
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "سجل السندات والمدفوعات" : "Receipts & Payments"}
        description={
          isAr
            ? "كل سند سداد معتمد ومقيَّد على حسابك، قابل للطباعة كإيصال رسمي مستقل أو كسجل كامل."
            : "Every posted receipt recorded against your account, printable as an individual official receipt or as a full ledger."
        }
      >
        <ExportButtons
          locale={locale}
          disabled={payments.length === 0}
          onExcel={handleExportExcel}
          onPdf={handleExportPdf}
          pdfLabel={isAr ? "طباعة السجل" : "Print ledger"}
        />
      </PortalPageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={isAr ? "إجمالي ما سُدِّد" : "Total collections"}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          tone="positive"
          value={<Money amount={totalAll} locale={locale} tone="positive" />}
          hint={
            isAr
              ? `مثبتة عبر ${payments.length} سند معتمد`
              : `Across ${payments.length} posted receipts`
          }
        />
        <StatCard
          label={isAr ? "آخر سند سداد" : "Latest receipt"}
          icon={<Receipt className="size-4 text-indigo-500" />}
          value={payments[0] ? <Money amount={payments[0].amount} locale={locale} /> : "—"}
          hint={payments[0]?.payment_date ?? (isAr ? "لا توجد مدفوعات" : "No payments yet")}
        />
        <StatCard
          label={isAr ? "مبالغ لم تُخصص بعد" : "Not yet allocated"}
          icon={<Wallet className="size-4 text-amber-500" />}
          tone={totalUnallocated > 0 ? "accent" : "neutral"}
          value={<Money amount={totalUnallocated} locale={locale} />}
          hint={
            totalUnallocated > 0
              ? isAr
                ? "رصيد لك لم يُخصم من مطالبة بعد"
                : "Credit to you, not yet applied to a charge"
              : isAr
                ? "كل الدفعات مخصومة من مطالباتها"
                : "Every receipt is applied to a charge"
          }
        />
      </div>

      {onlineTxns.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-600" />
            <h2 className="text-xs font-bold text-amber-900 dark:text-amber-200">
              {isAr ? "محاولات دفع إلكتروني غير مكتملة" : "Incomplete online payment attempts"}
            </h2>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
            {isAr
              ? "هذه محاولات دفع لم تُستكمل ولم تُقيَّد على حسابك، ولا يُخصم منك شيء مقابلها. المطالبات المرتبطة بها تظل مفتوحة حتى يتم السداد بنجاح."
              : "These attempts were never completed and are not posted to your account; nothing has been charged for them. Their related dues stay open until a payment succeeds."}
          </p>
          <div className="space-y-2">
            {onlineTxns.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-card p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {isAr ? `دفع إلكتروني عبر ${t.provider}` : `Online payment via ${t.provider}`}
                  </p>
                  <p className="text-[10px] text-slate-400">{t.created_at.slice(0, 16).replace("T", " ")}</p>
                  {t.failure_message ? (
                    <p className="mt-0.5 text-[10px] text-rose-500">{t.failure_message}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                  >
                    {isAr
                      ? (TXN_STATUS_LABELS[t.status]?.ar ?? t.status)
                      : (TXN_STATUS_LABELS[t.status]?.en ?? t.status)}
                  </Badge>
                  <span className="font-semibold tabular-nums text-slate-500">
                    <Money amount={Number(t.amount)} locale={locale} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {payments.length > 0 ? (
        <>
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
              placeholder={isAr ? "ابحث برقم السند أو البيان أو الوحدة" : "Search receipt no, memo, or unit"}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented<string>
              ariaLabel={isAr ? "تصفية حسب طريقة الدفع" : "Filter by payment method"}
              value={method}
              onChange={setMethod}
              options={[
                { value: "ALL", label: isAr ? "كل الطرق" : "All methods", count: payments.length },
                ...availableMethods.map((m) => ({
                  value: m,
                  label: methodLabel(m),
                  count: payments.filter((p) => p.method === m).length,
                })),
              ]}
            />
            <span className="text-xs font-medium text-slate-400">
              {isAr
                ? `عرض ${visible.length} سند بإجمالي ${formatAmount(totalVisible, locale)} ${currency}`
                : `${visible.length} receipts totalling ${formatAmount(totalVisible, locale)} ${currency}`}
            </span>
          </div>
        </>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-5" />}
          title={
            hasFilters
              ? isAr
                ? "لا توجد سندات مطابقة"
                : "No matching receipts"
              : isAr
                ? "لم يُسجَّل أي سداد بعد"
                : "No payments recorded yet"
          }
          description={
            hasFilters
              ? isAr
                ? "لا توجد سندات ضمن الفترة أو الفلاتر المحددة. جرّب توسيع نطاق التاريخ."
                : "No receipts fall within the selected period or filters. Try widening the date range."
              : isAr
                ? "سيظهر هنا كل سند سداد فور اعتماده وتقييده على حسابك، مع إمكانية طباعته كإيصال رسمي."
                : "Every receipt appears here as soon as it is posted to your account, printable as an official receipt."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">
              {isAr ? `سجل سندات ${memberName}` : `Receipts ledger for ${memberName}`}
            </caption>
            <thead>
              <tr className="border-b border-border/70 bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "رقم السند" : "Receipt no"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "التاريخ" : "Date"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "طريقة الدفع" : "Method"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "الوحدة" : "Unit"}
                </th>
                <th scope="col" className="p-3 text-start font-semibold">
                  {isAr ? "البيان" : "Memo"}
                </th>
                <th scope="col" className="p-3 text-end font-semibold">
                  {isAr ? "المبلغ" : "Amount"}
                </th>
                <th scope="col" className="p-3 text-end font-semibold">
                  {isAr ? "الإيصال" : "Receipt"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {visible.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {p.receiptNo}
                  </td>
                  <td className="whitespace-nowrap p-3 font-mono text-slate-500">{p.payment_date}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="bg-slate-100 text-[10px] font-semibold dark:bg-slate-800">
                      {methodLabel(p.method)}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono font-semibold text-slate-600 dark:text-slate-300">
                    {p.unitCode || "—"}
                  </td>
                  <td className="max-w-[16rem] truncate p-3 text-slate-600 dark:text-slate-300">
                    {p.memo || "—"}
                    {p.unallocated > 0 ? (
                      <span className="ms-1.5 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <TriangleAlert className="size-3" />
                        {isAr ? "غير مخصص" : "unallocated"}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 text-end font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    <Money amount={p.amount} locale={locale} />
                  </td>
                  <td className="p-3 text-end">
                    <PortalPrintReceiptButton
                      paymentId={p.id}
                      organizationName={organizationName}
                      currency={currency}
                      locale={locale}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/70 bg-slate-50 font-bold dark:bg-slate-900/60">
                <td className="p-3 text-slate-600 dark:text-slate-300" colSpan={5}>
                  {isAr ? "إجمالي المعروض" : "Total shown"}
                </td>
                <td className="p-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400">
                  <Money amount={totalVisible} locale={locale} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
