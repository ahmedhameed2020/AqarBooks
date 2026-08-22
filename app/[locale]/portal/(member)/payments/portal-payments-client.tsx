"use client";

import { useState } from "react";
import {
  Receipt,
  FileSpreadsheet,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  CreditCard,
  Building,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { PortalPrintReceiptButton } from "./portal-print-receipt-button";
import type { PaymentDbRow } from "@/lib/portal/row-types";

export interface OnlineTxnItem {
  id: string;
  amount: number;
  provider: string;
  status: string;
  failure_message: string | null;
  created_at: string;
}

const METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  CASH: { ar: "نقدًا", en: "Cash" },
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  CHEQUE: { ar: "شيك بنكي", en: "Cheque" },
  OTHER: { ar: "أخرى", en: "Other" },
  ONLINE: { ar: "دفع إلكتروني", en: "Online Payment" },
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
  payments: PaymentDbRow[];
  onlineTxns: OnlineTxnItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [filterMethod, setFilterMethod] = useState<string>("ALL");

  const totalPaidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const filteredPayments = payments.filter((p) => {
    if (filterMethod === "ALL") return true;
    return p.method === filterMethod;
  });

  async function handleExportExcel() {
    const columns = [
      { header: isAr ? "رقم السند" : "Receipt No", key: "receiptNo", width: 18 },
      { header: isAr ? "تاريخ السداد" : "Payment Date", key: "date", width: 14 },
      { header: isAr ? "طريقة الدفع" : "Method", key: "method", width: 18 },
      { header: isAr ? `المبلغ المسدد (${currency})` : `Amount (${currency})`, key: "amount", width: 18, isNumber: true },
    ];

    const rows = payments.map((p) => ({
      receiptNo: p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : `PAY-${p.id.slice(0, 8)}`),
      date: p.payment_date,
      method: isAr ? METHOD_LABELS[p.method]?.ar || p.method : METHOD_LABELS[p.method]?.en || p.method,
      amount: Number(p.amount),
    }));

    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Receipts_${memberName.replace(/\s+/g, "_")}`,
        title: isAr ? `سجل إيصالات وسندات سداد المالك: ${memberName}` : `Payment Receipts Ledger: ${memberName}`,
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency,
        columns,
        rows,
        summaries: [
          { label: isAr ? "إجمالي السندات المسددة" : "Total Receipts Paid", value: `${totalPaidAmount.toLocaleString()} ${currency}` },
          { label: isAr ? "عدد السندات" : "Receipts Count", value: payments.length },
        ],
      },
      locale
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Export Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAr ? "سجل السندات والمدفوعات المسددة" : "Payments & Receipts Ledger"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAr
              ? "استعراض وطباعة كافة إيصالات السداد المقيدة والمعتمدة رسميًا."
              : "Review and print verified payment receipts recorded in your ledger."}
          </p>
        </div>

        {payments.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2 font-bold text-xs h-10 px-4 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="size-4 text-emerald-500" />
            <span>{isAr ? "تصدير السجل Excel" : "Export Excel"}</span>
          </Button>
        )}
      </div>

      {/* Summary Bento KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 shadow-2xs space-y-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span>{isAr ? "إجمالي المبالغ المسددة والمقيدة" : "Total Verified Collections"}</span>
          </p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            <Money amount={totalPaidAmount} locale={locale} tone="positive" />
          </p>
          <p className="text-[10px] text-slate-400">
            {isAr ? `مثبتة عبر (${payments.length}) سند سداد رسمي` : `Across ${payments.length} verified receipts`}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Receipt className="size-4 text-indigo-500" />
            <span>{isAr ? "آخر دفعة مسددة" : "Latest Receipt"}</span>
          </p>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
            {payments[0] ? <Money amount={Number(payments[0].amount)} locale={locale} /> : "—"}
          </p>
          <p className="text-[10px] text-slate-400">
            {payments[0]?.payment_date || (isAr ? "لا توجد دفعات" : "No payments")}
          </p>
        </div>
      </div>

      {/* Online Transactions in progress / pending */}
      {onlineTxns.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-500 animate-spin" />
            <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300">
              {isAr ? "حركات دفع إلكتروني قيد المعالجة" : "Pending Online Transactions"}
            </h3>
          </div>
          <div className="space-y-2">
            {onlineTxns.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/60 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {isAr ? `دفع إلكتروني (${t.provider})` : `Online Payment (${t.provider})`}
                  </p>
                  <p className="text-[10px] text-slate-400">{t.created_at.slice(0, 16)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                    {t.status}
                  </Badge>
                  <span className="font-bold tabular-nums">
                    <Money amount={Number(t.amount)} locale={locale} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-border/70">
          <button
            type="button"
            onClick={() => setFilterMethod("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterMethod === "ALL"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? `كافة الطرق (${payments.length})` : `All (${payments.length})`}
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod("CASH")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterMethod === "CASH"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? "نقدًا" : "Cash"}
          </button>
          <button
            type="button"
            onClick={() => setFilterMethod("BANK_TRANSFER")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterMethod === "BANK_TRANSFER"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? "تحويل بنكي" : "Bank Transfer"}
          </button>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          {isAr
            ? `عرض ${filteredPayments.length} سند سداد`
            : `Showing ${filteredPayments.length} receipts`}
        </span>
      </div>

      {/* Receipts Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-xs">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-border/70 text-slate-600 dark:text-slate-400">
              <th className="p-3.5 font-bold text-start">{isAr ? "رقم السند" : "Receipt No"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "تاريخ السداد" : "Date"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "طريقة الدفع" : "Method"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "المبلغ المسدد" : "Amount Paid"}</th>
              <th className="p-3.5 font-bold text-end">{isAr ? "الإيصال المعتمد" : "Receipt PDF"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredPayments.length ? (
              filteredPayments.map((p) => {
                const receiptNumber =
                  p.receipt_no || (p.receipt_number ? `REC-${p.receipt_number}` : `PAY-${p.id.slice(0, 8)}`);
                const methodLabel = isAr ? METHOD_LABELS[p.method]?.ar || p.method : METHOD_LABELS[p.method]?.en || p.method;

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {receiptNumber}
                    </td>
                    <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                      {p.payment_date}
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 font-semibold">
                        {methodLabel}
                      </Badge>
                    </td>
                    <td className="p-3.5 font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      <Money amount={Number(p.amount)} locale={locale} />
                    </td>
                    <td className="p-3.5 text-end">
                      <PortalPrintReceiptButton
                        paymentId={p.id}
                        organizationName={organizationName}
                        currency={currency}
                        locale={locale}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-400">
                  <Receipt className="size-8 mx-auto opacity-30 mb-2" />
                  <p className="font-semibold">
                    {isAr ? "لا توجد سندات سداد مسجلة" : "No payment receipts found"}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
