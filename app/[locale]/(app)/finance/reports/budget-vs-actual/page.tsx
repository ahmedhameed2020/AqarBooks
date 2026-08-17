import { Fragment } from "react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

type Row = {
  accountId: string;
  code: string;
  name: string;
  budget: number;
  actual: number;
  /** Positive = favourable, negative = unfavourable. See varianceOf(). */
  variance: number;
};

/**
 * Variance is signed by BUSINESS OUTCOME, not by arithmetic. Beating a
 * revenue target and undershooting an expense budget are both favourable,
 * so the two categories subtract in opposite directions -- reporting a raw
 * (actual - budget) for both would paint every cost saving as a red number.
 */
function varianceOf(category: "REVENUE" | "EXPENSE", budget: number, actual: number) {
  return category === "REVENUE" ? actual - budget : budget - actual;
}

const GROUPS = [
  { category: "REVENUE" as const, labelAr: "الإيرادات", labelEn: "Revenue" },
  { category: "EXPENSE" as const, labelAr: "المصروفات", labelEn: "Expenses" },
];

export default async function BudgetVsActualPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();

  const { data: periods } = await supabase
    .from("fiscal_periods")
    .select("id, name, start_date, end_date, status")
    .eq("organization_id", organization.id)
    .order("start_date", { ascending: false });

  const periodList = periods ?? [];
  const selectedPeriod =
    periodList.find((p) => p.id === period) ??
    periodList.find((p) => p.status === "OPEN") ??
    periodList[0];

  if (!selectedPeriod) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "الموازنة مقابل الفعلي" : "Budget vs Actual"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا توجد فترات مالية بعد." : "No fiscal periods yet."}
        </p>
      </div>
    );
  }

  const [{ data: trialBalance, error }, { data: budgets }] = await Promise.all([
    supabase.rpc("get_trial_balance", {
      p_organization_id: organization.id,
      p_start_date: selectedPeriod.start_date,
      p_end_date: selectedPeriod.end_date,
    }),
    supabase
      .from("budgets")
      .select("account_id, amount")
      .eq("organization_id", organization.id)
      .eq("fiscal_period_id", selectedPeriod.id),
  ]);

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">
          {isAr ? "الموازنة مقابل الفعلي" : "Budget vs Actual"}
        </h1>
        <p className="text-sm text-destructive">
          {isAr
            ? "غير مصرح لك بالاطلاع على التقارير المالية. تواصل مع مدير النظام لمنحك صلاحية «قراءة التقارير المالية»."
            : "You do not have permission to view financial reports. Ask an administrator to grant you the finance reports read permission."}
        </p>
      </div>
    );
  }

  const budgetByAccount = new Map((budgets ?? []).map((b) => [b.account_id, b.amount]));

  const rowsByCategory = new Map<"REVENUE" | "EXPENSE", Row[]>([
    ["REVENUE", []],
    ["EXPENSE", []],
  ]);

  for (const tb of trialBalance ?? []) {
    if (tb.category !== "REVENUE" && tb.category !== "EXPENSE") continue;
    const budget = budgetByAccount.get(tb.account_id) ?? 0;
    const actual = tb.balance;
    // Skip accounts that are neither budgeted nor used -- they carry no
    // information and would bury the lines that matter.
    if (budget === 0 && actual === 0) continue;
    rowsByCategory.get(tb.category)!.push({
      accountId: tb.account_id,
      code: tb.code,
      name: isAr ? tb.name_ar : tb.name_en,
      budget,
      actual,
      variance: varianceOf(tb.category, budget, actual),
    });
  }

  const hasAnyBudget = (budgets ?? []).length > 0;

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (budget: number, actual: number) =>
    budget === 0 ? "—" : `${((actual / budget) * 100).toFixed(0)}%`;
  const varianceClass = (v: number) =>
    v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-destructive" : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {isAr ? "الموازنة مقابل الفعلي" : "Budget vs Actual"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selectedPeriod.name} · {selectedPeriod.start_date} → {selectedPeriod.end_date}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <select
            name="period"
            defaultValue={selectedPeriod.id}
            className="rounded-md border border-input bg-transparent p-1.5 text-sm"
          >
            {periodList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {isAr ? "عرض" : "Show"}
          </button>
        </form>
      </div>

      {!hasAnyBudget && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {isAr ? "لم تُحدَّد موازنة لهذه الفترة بعد. " : "No budget has been set for this period yet. "}
          <Link href="/finance/budgets" locale={locale as Locale} className="font-medium underline">
            {isAr ? "حدِّد الموازنة الآن" : "Set the budget now"}
          </Link>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الحساب" : "Account"}</TableHead>
              <TableHead className="text-end">{isAr ? "الموازنة" : "Budget"}</TableHead>
              <TableHead className="text-end">{isAr ? "الفعلي" : "Actual"}</TableHead>
              <TableHead className="text-end">{isAr ? "الانحراف" : "Variance"}</TableHead>
              <TableHead className="text-end">{isAr ? "التحقيق" : "Achieved"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GROUPS.map((group) => {
              const rows = rowsByCategory.get(group.category)!;
              const budgetTotal = rows.reduce((s, r) => s + r.budget, 0);
              const actualTotal = rows.reduce((s, r) => s + r.actual, 0);
              const varianceTotal = varianceOf(group.category, budgetTotal, actualTotal);
              return (
                <Fragment key={group.category}>
                  <TableRow className="bg-muted/40">
                    <TableCell className="font-semibold" colSpan={5}>
                      {isAr ? group.labelAr : group.labelEn}
                    </TableCell>
                  </TableRow>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell className="ps-6 text-muted-foreground" colSpan={5}>
                        {isAr ? "لا توجد حركة أو موازنة" : "No activity or budget"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.accountId}>
                        <TableCell className="ps-6">
                          <span className="text-muted-foreground tabular-nums">{r.code}</span> {r.name}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{fmt(r.budget)}</TableCell>
                        <TableCell className="text-end tabular-nums">{fmt(r.actual)}</TableCell>
                        <TableCell className={`text-end tabular-nums ${varianceClass(r.variance)}`}>
                          {fmt(r.variance)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {pct(r.budget, r.actual)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="font-medium">
                    <TableCell className="ps-6">
                      {isAr ? `إجمالي ${group.labelAr}` : `Total ${group.labelEn}`}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{fmt(budgetTotal)}</TableCell>
                    <TableCell className="text-end tabular-nums">{fmt(actualTotal)}</TableCell>
                    <TableCell className={`text-end tabular-nums ${varianceClass(varianceTotal)}`}>
                      {fmt(varianceTotal)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums text-muted-foreground">
                      {pct(budgetTotal, actualTotal)}
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}

            {(() => {
              const rev = rowsByCategory.get("REVENUE")!;
              const exp = rowsByCategory.get("EXPENSE")!;
              const budgetSurplus =
                rev.reduce((s, r) => s + r.budget, 0) - exp.reduce((s, r) => s + r.budget, 0);
              const actualSurplus =
                rev.reduce((s, r) => s + r.actual, 0) - exp.reduce((s, r) => s + r.actual, 0);
              // The surplus line behaves like revenue: more is better.
              const surplusVariance = actualSurplus - budgetSurplus;
              return (
                <TableRow className="border-t-2 font-semibold">
                  <TableCell>
                    {isAr ? "صافي الفائض/العجز" : "Net Surplus/Deficit"}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(budgetSurplus)}</TableCell>
                  <TableCell className="text-end tabular-nums">{fmt(actualSurplus)}</TableCell>
                  <TableCell className={`text-end tabular-nums ${varianceClass(surplusVariance)}`}>
                    {fmt(surplusVariance)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums text-muted-foreground">
                    {pct(budgetSurplus, actualSurplus)}
                  </TableCell>
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {isAr
          ? "الانحراف الموجب (بالأخضر) في مصلحة المنشأة: إيراد يفوق المستهدف أو مصروف أقل من المخطط."
          : "A positive variance (green) is favourable: revenue above target, or spend below plan."}
      </p>
    </div>
  );
}
