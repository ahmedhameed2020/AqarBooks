"use client";

import { useState, useTransition } from "react";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ShieldCheck,
  Building,
  Calendar,
  Lock,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { STATUS_LABELS, type DueDbRow } from "@/lib/portal/row-types";
import { createOnlinePaymentCheckoutAction } from "@/lib/actions/online-payment-checkout";

const GENERIC_ERROR = {
  ar: "تعذر إتمام عملية الدفع، يرجى المحاولة مرة أخرى.",
  en: "Could not start the payment, please try again.",
};

export function DuesCheckout({
  dues,
  organizationName,
  currency,
  locale,
}: {
  dues: DueDbRow[];
  organizationName?: string;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [selected, setSelected] = useState<Set<string>>(
    new Set(dues.map((d) => d.id)) // Pre-select all for convenience
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTotal = dues
    .filter((d) => selected.has(d.id))
    .reduce((sum, d) => sum + Number(d.amount), 0);

  const allSelected = dues.length > 0 && selected.size === dues.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(dues.map((d) => d.id)));
    }
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
        ("message" in result && result.message) ||
          (isAr ? GENERIC_ERROR.ar : GENERIC_ERROR.en)
      );
    });
  }

  async function handleExportExcel() {
    const columns = [
      { header: isAr ? "رقم الوحدة" : "Unit", key: "unitCode", width: 14 },
      { header: isAr ? "البيان والوصف" : "Description", key: "description", width: 30 },
      { header: isAr ? "تاريخ الإصدار" : "Issue Date", key: "issueDate", width: 14 },
      { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate", width: 14 },
      { header: isAr ? "الحالة" : "Status", key: "statusLabel", width: 16 },
      { header: isAr ? `المبلغ المستحق (${currency || "EGP"})` : `Amount (${currency || "EGP"})`, key: "amount", width: 18, isNumber: true },
    ];

    const rows = dues.map((d) => ({
      unitCode: d.units?.code || "—",
      description: d.description || (isAr ? "مطالبة مالية دورية" : "Periodic Due"),
      issueDate: d.issue_date,
      dueDate: d.due_date,
      statusLabel: d.status === "OVERDUE" ? (isAr ? "متأخر" : "Overdue") : (isAr ? "مستحق" : "Due"),
      amount: Number(d.amount),
    }));

    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Open_Dues`,
        title: isAr ? "كشف المطالبات والمستحقات المفتوحة" : "Open Financial Dues & Invoices",
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency || "EGP",
        columns,
        rows,
      },
      locale
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {dues.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAll}
              className="gap-2 text-xs font-bold rounded-xl h-9"
            >
              {allSelected ? <CheckSquare className="size-4 text-indigo-600" /> : <Square className="size-4" />}
              <span>
                {allSelected
                  ? isAr
                    ? "إلغاء تحديد الكل"
                    : "Deselect All"
                  : isAr
                  ? "تحديد الكل"
                  : "Select All"}
              </span>
            </Button>
          )}

          <span className="text-xs text-slate-500 font-medium">
            {isAr
              ? `تم تحديد (${selected.size} من أصل ${dues.length} مطالبة)`
              : `(${selected.size} of ${dues.length} selected)`}
          </span>
        </div>

        {dues.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2 font-bold text-xs h-9 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="size-4 text-emerald-500" />
            <span>{isAr ? "تصدير المطالبات Excel" : "Export Excel"}</span>
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dues List */}
      <div className="space-y-3">
        {dues.length === 0 ? (
          <div className="p-12 text-center rounded-3xl border border-dashed border-border/70 bg-card space-y-3">
            <div className="size-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-6" />
            </div>
            <p className="font-black text-base text-slate-900 dark:text-white">
              {isAr ? "لا توجد مستحقات مالية مفتوحة" : "No open dues"}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isAr
                ? "حسابك مسدد بالكامل ولا توجد أي فواتير أو مطالبات معلقة."
                : "Your account is fully settled with zero pending invoices."}
            </p>
          </div>
        ) : (
          dues.map((d) => {
            const isChecked = selected.has(d.id);
            const isOverdue = d.status === "OVERDUE";
            return (
              <div
                key={d.id}
                onClick={() => toggle(d.id, !isChecked)}
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer select-none ${
                  isChecked
                    ? "border-indigo-500/60 bg-indigo-50/40 dark:bg-indigo-950/30 shadow-2xs"
                    : "border-border/70 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-900/50"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={(checked) => toggle(d.id, checked === true)}
                    className="size-5 rounded-md border-border data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    aria-label={isAr ? "تحديد الاستحقاق" : "Select due"}
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic Due")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {d.units?.code && (
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.2 rounded-md">
                          {d.units.code}
                        </span>
                      )}
                      <span>
                        {isAr ? "تاريخ الاستحقاق:" : "Due Date:"} {d.due_date}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-bold py-0.5 px-2.5 ${
                      isOverdue
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {isOverdue ? (isAr ? "متأخر السداد" : "Overdue") : (isAr ? "مستحق" : "Due")}
                  </Badge>
                  <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                    <Money amount={Number(d.amount)} locale={locale} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating / Bottom Checkout Bar */}
      {dues.length > 0 && (
        <div className="sticky bottom-4 z-20 rounded-3xl border border-border/80 bg-card/95 backdrop-blur-md p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {isAr ? "إجمالي المطالبات المحددة للسداد" : "Total Selected for Payment"}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                <Money amount={selectedTotal} locale={locale} />
              </span>
              <span className="text-xs text-slate-400 font-semibold">
                ({selected.size} {isAr ? "مطالبة" : "invoices"})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={selected.size === 0 || isPending}
              onClick={handlePay}
              className="w-full sm:w-auto h-12 px-8 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm shadow-md gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin me-2" />
                  {isAr ? "جاري تجهيز بوابة الدفع..." : "Initializing Gateway..."}
                </>
              ) : (
                <>
                  <Lock className="size-4" />
                  <span>{isAr ? "سداد الآن أونلاين بأمان" : "Pay Securely Online"}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
