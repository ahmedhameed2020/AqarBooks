"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  FileSpreadsheet,
  Printer,
  Download,
  Filter,
  Layers,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { PrintStatementButton } from "./print-statement-button";
import type { StatementLine } from "@/lib/reports/account-statement-pdf";

export interface PortalStatementMovement {
  id: string;
  date: string;
  kind: "CHARGE" | "PAYMENT";
  description: string;
  unitCode: string | null;
  reference: string | null;
  amount: number;
}

export function PortalStatementClient({
  organizationName,
  currency,
  memberName,
  movements,
  statementLines,
  totalDue,
  totalPaid,
  balance,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  movements: PortalStatementMovement[];
  statementLines: StatementLine[];
  totalDue: number;
  totalPaid: number;
  balance: number;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [filterType, setFilterType] = useState<"ALL" | "CHARGE" | "PAYMENT">("ALL");

  const filteredMovements = useMemo(() => {
    if (filterType === "ALL") return movements;
    return movements.filter((m) => m.kind === filterType);
  }, [movements, filterType]);

  async function handleExportExcel() {
    const columns = [
      { header: isAr ? "التاريخ" : "Date", key: "date", width: 14 },
      { header: isAr ? "نوع الحركة" : "Type", key: "typeLabel", width: 16 },
      { header: isAr ? "الوصف والبيان" : "Description", key: "description", width: 30 },
      { header: isAr ? "رقم الوحدة" : "Unit Code", key: "unitCode", width: 14 },
      { header: isAr ? "المرجع / السند" : "Reference", key: "reference", width: 18 },
      { header: isAr ? `مدين (مستحق ${currency})` : `Debit (${currency})`, key: "debit", width: 16, isNumber: true },
      { header: isAr ? `دائن (مسدد ${currency})` : `Credit (${currency})`, key: "credit", width: 16, isNumber: true },
    ];

    const rows = movements.map((m) => ({
      date: m.date,
      typeLabel: m.kind === "CHARGE" ? (isAr ? "استحقاق مالي" : "Fee Charge") : (isAr ? "سند سداد" : "Payment"),
      description: m.description,
      unitCode: m.unitCode || "—",
      reference: m.reference || "—",
      debit: m.kind === "CHARGE" ? m.amount : null,
      credit: m.kind === "PAYMENT" ? m.amount : null,
    }));

    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Statement_${memberName.replace(/\s+/g, "_")}`,
        title: isAr ? `كشف حساب المالك: ${memberName}` : `Owner Account Statement: ${memberName}`,
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency,
        columns,
        rows,
        summaries: [
          { label: isAr ? "إجمالي المطالبات" : "Total Charges", value: `${totalDue.toLocaleString()} ${currency}` },
          { label: isAr ? "إجمالي المسدد" : "Total Paid", value: `${totalPaid.toLocaleString()} ${currency}` },
          { label: isAr ? "صافي الرصيد القائم" : "Net Balance", value: `${balance.toLocaleString()} ${currency}` },
        ],
      },
      locale
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Export Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAr ? "كشف الحساب المالي المعتمد" : "Certified Financial Statement"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAr
              ? "سجل حركات المطالبات والسندات المالية المقيدة في دفتر الأستاذ العام."
              : "General ledger movements, periodic dues, and posted receipts."}
          </p>
        </div>

        {/* Dual Export Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2 font-bold text-xs h-10 px-3.5 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="size-4 text-emerald-500" />
            <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
          </Button>

          <PrintStatementButton
            organizationName={organizationName}
            propertyName=""
            currency={currency}
            accountName={memberName}
            lines={statementLines}
            locale={locale}
          />
        </div>
      </div>

      {/* Bento Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <TrendingDown className="size-3.5 text-rose-500" />
            <span>{isAr ? "إجمالي المطالبات والفواتير" : "Total Charges"}</span>
          </p>
          <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
            <Money amount={totalDue} locale={locale} />
          </p>
          <p className="text-[10px] text-slate-400">
            {isAr ? "إجمالي المبالغ المستحقة المقيدة" : "Total debited obligations"}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-emerald-500" />
            <span>{isAr ? "إجمالي المسدد والمقبوض" : "Total Paid"}</span>
          </p>
          <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
            <Money amount={totalPaid} locale={locale} tone="positive" />
          </p>
          <p className="text-[10px] text-slate-400">
            {isAr ? "إجمالي السندات المحصلة" : "Total verified collections"}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-2xs space-y-1 ${
            balance <= 0
              ? "border-emerald-500/30 bg-emerald-500/[0.04]"
              : "border-rose-500/30 bg-rose-500/[0.04]"
          }`}
        >
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Wallet className="size-3.5 text-indigo-500" />
            <span>{isAr ? "صافي الرصيد القائم" : "Net Balance"}</span>
          </p>
          <p className="text-xl font-black tabular-nums">
            <Money amount={balance} locale={locale} tone={balance > 0 ? "negative" : "positive"} />
          </p>
          <p className="text-[10px] text-slate-400">
            {balance <= 0
              ? isAr
                ? "الحساب مسوى بالكامل"
                : "Zero balance"
              : isAr
              ? "رصيد مستحق بذمتكم"
              : "Outstanding due"}
          </p>
        </div>
      </div>

      {/* Movement Filter Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-border/70">
          <button
            type="button"
            onClick={() => setFilterType("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "ALL"
                ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? `كافة الحركات (${movements.length})` : `All (${movements.length})`}
          </button>
          <button
            type="button"
            onClick={() => setFilterType("CHARGE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "CHARGE"
                ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? "المطالبات فقط" : "Charges Only"}
          </button>
          <button
            type="button"
            onClick={() => setFilterType("PAYMENT")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "PAYMENT"
                ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {isAr ? "المدفوعات فقط" : "Payments Only"}
          </button>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          {isAr
            ? `عرض ${filteredMovements.length} حركة مالية`
            : `Showing ${filteredMovements.length} movements`}
        </span>
      </div>

      {/* Movements Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-xs">
        <table className="w-full text-start text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-border/70 text-slate-600 dark:text-slate-400">
              <th className="p-3.5 font-bold text-start">{isAr ? "التاريخ" : "Date"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "نوع الحركة" : "Type"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "البيان والوصف" : "Description"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "الوحدة" : "Unit"}</th>
              <th className="p-3.5 font-bold text-start">{isAr ? "المرجع / السند" : "Reference"}</th>
              <th className="p-3.5 font-bold text-end">{isAr ? "المبلغ" : "Amount"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filteredMovements.length ? (
              filteredMovements.map((m) => {
                const isCharge = m.kind === "CHARGE";
                return (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">{m.date}</td>
                    <td className="p-3.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold py-0.5 px-2 ${
                          isCharge
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {isCharge ? (isAr ? "مطالبة مالية" : "Charge") : (isAr ? "سند سداد" : "Payment")}
                      </Badge>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      {m.description}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {m.unitCode || "—"}
                    </td>
                    <td className="p-3.5 font-mono text-slate-400">{m.reference || "—"}</td>
                    <td className="p-3.5 text-end font-black tabular-nums">
                      <span
                        className={
                          isCharge
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {isCharge ? "+" : "-"}
                        <Money amount={m.amount} locale={locale} />
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <FileText className="size-8 mx-auto opacity-30 mb-2" />
                  <p className="font-semibold">
                    {isAr ? "لا توجد حركات مالية مطابقة للفلتر" : "No movements found"}
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
