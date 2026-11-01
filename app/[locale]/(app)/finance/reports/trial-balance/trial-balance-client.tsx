"use client";

import { useState, useMemo } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Printer, FileSpreadsheet, CheckCircle2, AlertTriangle, Search, Calendar, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { useToast } from "@/components/ui/toast";

export interface TrialBalanceRow {
  account_id: string | null;
  code: string;
  name_ar: string;
  name_en: string;
  category: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | string;
  normal_balance: string;
  /** opening / closing positions on their natural side (a balance is either a debit or a credit, never both) */
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
  /** in the account's normal direction */
  opening_balance: number;
  closing_balance: number;
  /** the explicit line carrying the net result of earlier fiscal years that no year-end close has moved */
  is_synthetic: boolean;
  fiscal_year_known: boolean;
}

const COLS = [
  ["opening-debit", "opening_debit"],
  ["opening-credit", "opening_credit"],
  ["period-debit", "period_debit"],
  ["period-credit", "period_credit"],
  ["closing-debit", "closing_debit"],
  ["closing-credit", "closing_credit"],
] as const;

export function TrialBalanceClient({
  rows,
  startDate,
  endDate,
  organizationName,
  taxNumber,
  currency,
  locale,
}: {
  rows: TrialBalanceRow[];
  startDate: string;
  endDate: string;
  organizationName: string;
  taxNumber?: string | null;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [from, setFrom] = useState(startDate);
  const [to, setTo] = useState(endDate);

  const applyPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`${pathname}?from=${from}&asOf=${to}`);
  };

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (selectedCategory !== "ALL" && r.category !== selectedCategory && !(r.is_synthetic && selectedCategory === "EQUITY")) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return r.code.toLowerCase().includes(q) || r.name_ar.toLowerCase().includes(q) || r.name_en.toLowerCase().includes(q);
      }),
    [rows, selectedCategory, searchQuery],
  );

  const sum = (key: (typeof COLS)[number][1]) => filteredRows.reduce((s, r) => s + r[key], 0);
  const totals = Object.fromEntries(COLS.map(([, key]) => [key, sum(key)])) as Record<(typeof COLS)[number][1], number>;
  const diffOpening = Math.abs(totals.opening_debit - totals.opening_credit);
  const diffPeriod = Math.abs(totals.period_debit - totals.period_credit);
  const diffClosing = Math.abs(totals.closing_debit - totals.closing_credit);
  // the identity is only checkable on the full, unfiltered set
  const isFullSet = selectedCategory === "ALL" && !searchQuery.trim();
  const isBalanced = diffOpening < 0.005 && diffPeriod < 0.005 && diffClosing < 0.005;
  const hasUnclosed = rows.some((r) => r.is_synthetic);
  const fiscalYearKnown = rows.length === 0 || rows[0].fiscal_year_known;

  const categoryLabels: Record<string, { ar: string; en: string }> = {
    ASSET: { ar: "أصول", en: "Asset" },
    LIABILITY: { ar: "خصوم", en: "Liability" },
    EQUITY: { ar: "حقوق ملكية", en: "Equity" },
    REVENUE: { ar: "إيرادات", en: "Revenue" },
    EXPENSE: { ar: "مصروفات", en: "Expense" },
  };
  const nameOf = (r: TrialBalanceRow) => (isAr ? r.name_ar : r.name_en);
  const catOf = (r: TrialBalanceRow) => categoryLabels[r.category]?.[isAr ? "ar" : "en"] || r.category;

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (n: number) => (n === 0 ? "—" : fmt(n));

  const exportColumns = [
    { header: isAr ? "رمز الحساب" : "Code", key: "code", width: 12 },
    { header: isAr ? "اسم الحساب" : "Account", key: "accountName", width: 32 },
    { header: isAr ? "افتتاحي مدين" : "Opening Dr", key: "opening_debit", isNumber: true, width: 15 },
    { header: isAr ? "افتتاحي دائن" : "Opening Cr", key: "opening_credit", isNumber: true, width: 15 },
    { header: isAr ? "حركة مدين" : "Period Dr", key: "period_debit", isNumber: true, width: 15 },
    { header: isAr ? "حركة دائن" : "Period Cr", key: "period_credit", isNumber: true, width: 15 },
    { header: isAr ? "ختامي مدين" : "Closing Dr", key: "closing_debit", isNumber: true, width: 15 },
    { header: isAr ? "ختامي دائن" : "Closing Cr", key: "closing_credit", isNumber: true, width: 15 },
  ];
  const exportRows = filteredRows.map((r) => ({
    code: r.code,
    accountName: nameOf(r),
    opening_debit: r.opening_debit,
    opening_credit: r.opening_credit,
    period_debit: r.period_debit,
    period_credit: r.period_credit,
    closing_debit: r.closing_debit,
    closing_credit: r.closing_credit,
  }));
  const exportTotal = {
    code: isAr ? "الإجمالي العام" : "Grand Total",
    accountName: isBalanced ? (isAr ? "✓ متوازن" : "✓ Balanced") : (isAr ? "⚠️ غير متوازن" : "⚠️ Out of balance"),
    ...totals,
  };
  const periodLabel = `${startDate} → ${endDate}`;
  const note = isAr
    ? "رصيد أول المدة لحسابات الميزانية = كل ما رُحّل قبل تاريخ البداية. حسابات الإيرادات والمصروفات تبدأ من أول السنة المالية. نتيجة السنوات السابقة غير المقفلة تظهر في سطر مستقل لأن إقفال السنة غير متاح في هذه النسخة."
    : "Balance-sheet accounts open with everything posted before the start date. Income and expense accounts open at the start of the fiscal year. The result of earlier, unclosed fiscal years is shown on its own line because year-end closing is not available in this version.";

  const handleExportPdf = () => {
    generateFinancialStatementPdf(
      {
        title: isAr ? "ميزان المراجعة بالأرصدة الافتتاحية" : "Trial Balance with Opening Balances",
        subtitle: periodLabel,
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: periodLabel,
        columns: exportColumns.map((c) => ({ header: c.header, key: c.key, isNumber: c.isNumber, width: `${Math.round((c.width / 134) * 100)}%`, align: c.isNumber ? ("end" as const) : ("start" as const) })),
        rows: exportRows,
        totalRow: exportTotal,
        summaries: [
          { label: isAr ? "مدين ختامي" : "Closing debit", value: totals.closing_debit, highlight: true },
          { label: isAr ? "دائن ختامي" : "Closing credit", value: totals.closing_credit, highlight: true },
        ],
        notes: [note],
      },
      locale,
    );
  };

  const handleExportExcel = async () => {
    toast.add({ type: "info", title: isAr ? "جاري تصدير ملف الإكسل..." : "Exporting Excel..." });
    await exportFinancialStatementToExcel(
      {
        filename: "trial_balance",
        sheetName: isAr ? "ميزان المراجعة" : "Trial Balance",
        reportTitle: isAr ? "ميزان المراجعة بالأرصدة الافتتاحية" : "Trial Balance with Opening Balances",
        organizationName,
        taxNumber,
        currencyLabel: currency,
        dateRangeLabel: periodLabel,
        columns: exportColumns.map((c) => ({ ...c, isNumber: Boolean(c.isNumber) })),
        rows: exportRows,
        totalRow: exportTotal,
        summaries: [
          { label: isAr ? "مدين ختامي" : "Closing debit", value: totals.closing_debit },
          { label: isAr ? "دائن ختامي" : "Closing credit", value: totals.closing_credit },
        ],
      },
      locale,
    );
    toast.add({ type: "success", title: isAr ? "تم تصدير الإكسل بنجاح" : "Excel exported" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <form onSubmit={applyPeriod} className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative">
            <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input type="date" aria-label={isAr ? "من تاريخ" : "From"} value={from} onChange={(e) => setFrom(e.target.value)} className="ps-9 text-xs h-9 w-44 font-mono font-bold" />
          </div>
          <div className="relative">
            <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input type="date" aria-label={isAr ? "إلى تاريخ" : "To"} value={to} onChange={(e) => setTo(e.target.value)} className="ps-9 text-xs h-9 w-44 font-mono font-bold" />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs font-bold">
            {isAr ? "تحديث الفترة" : "Apply Period"}
          </Button>
        </form>
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button onClick={handleExportPdf} variant="outline" size="sm" className="h-9 text-xs font-bold gap-1.5">
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / تصدير PDF" : "Print / PDF"}</span>
          </Button>
          <Button onClick={handleExportExcel} size="sm" className="h-9 text-xs font-bold gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm">
            <FileSpreadsheet className="size-3.5" />
            <span>{isAr ? "تصدير إكسل (Excel)" : "Export Excel"}</span>
          </Button>
        </div>
      </div>

      <div
        data-testid="tb-balance-status"
        data-balanced={isFullSet ? String(isBalanced) : "filtered"}
        className={`rounded-2xl border p-4 shadow-sm ${!isFullSet ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" : isBalanced ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/40"}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{isAr ? "فحص التوازن (افتتاحي، حركة، ختامي)" : "Balance check (opening, movement, closing)"}</span>
          {isFullSet && (isBalanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertTriangle className="size-4 text-rose-600" />)}
        </div>
        <div className="mt-1 font-mono text-sm font-black">
          {!isFullSet
            ? isAr ? "التوازن يُفحص على الميزان الكامل فقط (أزِل الفلتر)" : "Balance is checked on the full trial balance only (clear the filter)"
            : isBalanced
              ? isAr ? "متوازن 100% ✓ في الافتتاحي والحركة والختامي" : "100% Balanced ✓ — opening, movement and closing"
              : isAr ? `غير متوازن — افتتاحي ${fmt(diffOpening)} · حركة ${fmt(diffPeriod)} · ختامي ${fmt(diffClosing)}` : `Out of balance — opening ${fmt(diffOpening)} · movement ${fmt(diffPeriod)} · closing ${fmt(diffClosing)}`}
        </div>
      </div>

      <div data-testid="tb-note" className="flex gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 text-[11px] font-medium text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
        <Info className="size-4 shrink-0 text-sky-600" />
        <p>
          {note}
          {hasUnclosed && (
            <strong data-testid="tb-unclosed-warning" className="mt-1 block">
              {isAr ? "تنبيه: توجد نتيجة سنوات سابقة غير مقفلة في هذا الميزان (السطر RE-PRIOR)." : "Notice: this trial balance contains the result of earlier unclosed fiscal years (line RE-PRIOR)."}
            </strong>
          )}
          {!fiscalYearKnown && (
            <strong data-testid="tb-fy-unknown" className="mt-1 block">
              {isAr ? "لا توجد سنة مالية معرّفة تتضمن تاريخ البداية؛ استُخدم تاريخ البداية كحدّ للسنة." : "No fiscal year is defined for the start date; the start date was used as the year boundary."}
            </strong>
          )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${selectedCategory === cat ? "bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400"}`}
            >
              {cat === "ALL" ? (isAr ? "جميع الحسابات" : "All Accounts") : categoryLabels[cat]?.[isAr ? "ar" : "en"] || cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={isAr ? "بحث بالرمز أو اسم الحساب..." : "Search accounts..."} className="ps-9 text-xs h-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start" data-testid="tb-table">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th rowSpan={2} className="p-3 text-start w-24">{isAr ? "الرمز" : "Code"}</th>
                <th rowSpan={2} className="p-3 text-start">{isAr ? "اسم الحساب" : "Account Name"}</th>
                <th rowSpan={2} className="p-3 text-center w-24">{isAr ? "التصنيف" : "Category"}</th>
                <th colSpan={2} className="p-2 text-center border-s border-slate-700">{isAr ? "رصيد أول المدة" : "Opening balance"}</th>
                <th colSpan={2} className="p-2 text-center border-s border-slate-700">{isAr ? "حركة الفترة" : "Period movement"}</th>
                <th colSpan={2} className="p-2 text-center border-s border-slate-700">{isAr ? "رصيد آخر المدة" : "Closing balance"}</th>
              </tr>
              <tr className="bg-slate-800/80">
                {[0, 1, 2].flatMap((g) => [
                  <th key={`d${g}`} className="p-2 text-end border-s border-slate-700 w-28">{isAr ? "مدين" : "Debit"}</th>,
                  <th key={`c${g}`} className="p-2 text-end w-28">{isAr ? "دائن" : "Credit"}</th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr key={r.account_id ?? r.code} data-testid={`tb-row-${r.code}`} data-synthetic={r.is_synthetic ? "true" : "false"} className={r.is_synthetic ? "bg-amber-50/60 dark:bg-amber-950/20" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/50"}>
                    <td className="p-3 font-mono font-bold text-purple-700 dark:text-purple-400">{r.code}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {nameOf(r)}
                      {r.is_synthetic && <span className="ms-2 text-[10px] font-semibold text-amber-700">{isAr ? "(لا يوجد إقفال سنة)" : "(no year-end close)"}</span>}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-[10px] font-semibold">{catOf(r)}</Badge>
                    </td>
                    {COLS.map(([col, key]) => (
                      <td key={col} data-col={col} data-value={r[key]} className="p-3 text-end font-mono font-semibold text-slate-900 dark:text-slate-100 border-s border-slate-100 dark:border-slate-800">
                        {cell(r[key])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد أرصدة أو حركات في هذه الفترة" : "No balances or activity in this period"}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="bg-slate-100/80 dark:bg-slate-800/90 border-t-2 border-slate-900 dark:border-slate-700 font-bold">
                <tr data-testid="tb-total">
                  <td colSpan={3} className="p-3 text-start font-black text-slate-900 dark:text-white">{isAr ? "الإجمالي العام" : "Grand Total"}</td>
                  {COLS.map(([col, key]) => (
                    <td key={col} data-col={col} data-value={totals[key]} className="p-3 text-end font-mono font-black text-slate-950 dark:text-white border-s border-slate-200 dark:border-slate-700">
                      {fmt(totals[key])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
