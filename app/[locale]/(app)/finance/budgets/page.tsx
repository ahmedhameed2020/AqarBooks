import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { BudgetForm, type BudgetAccount } from "./budget-form";

export default async function BudgetsPage({
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

  // Two-tier gate, matching finance/accounts and finance/reports/aging: the
  // budgets_select_member RLS policy alone would expose planning figures to
  // any org member, so the page requires either the manage right or the
  // standard financial-reports read right before rendering anything.
  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.budgets.manage"),
    hasPermission(organization.id, "finance.reports.read"),
  ]);
  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "الموازنات التقديرية" : "Budgets"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على الموازنات. تواصل مع مدير النظام."
            : "You don't have permission to view budgets. Contact an administrator."}
        </p>
      </div>
    );
  }

  // Budgets are only meaningful for periods still being planned or worked;
  // a LOCKED period's budget is history and editing it would rewrite a
  // closed comparison, so those are shown read-only via the report instead.
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
        <h1 className="text-xl font-semibold">{isAr ? "الموازنات التقديرية" : "Budgets"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا توجد فترات مالية بعد. أنشئ سنة وفترات مالية أولًا من إعدادات المالية."
            : "No fiscal periods yet. Create a fiscal year and periods first from finance settings."}
        </p>
      </div>
    );
  }

  const [{ data: accounts }, { data: budgets }] = await Promise.all([
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("is_active", true)
      .in("category", ["REVENUE", "EXPENSE"])
      .order("code"),
    supabase
      .from("budgets")
      .select("account_id, amount")
      .eq("organization_id", organization.id)
      .eq("fiscal_period_id", selectedPeriod.id),
  ]);

  const budgetByAccount = new Map((budgets ?? []).map((b) => [b.account_id, b.amount]));
  const rows: BudgetAccount[] = (accounts ?? []).map((a) => ({
    id: a.id,
    code: a.code,
    name_ar: a.name_ar,
    name_en: a.name_en,
    category: a.category as "REVENUE" | "EXPENSE",
    amount: budgetByAccount.get(a.id) ?? null,
  }));

  const budgetedCount = rows.filter((r) => r.amount !== null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "الموازنات التقديرية" : "Budgets"}</h1>
          <p className="text-sm text-muted-foreground">
            {selectedPeriod.name} · {selectedPeriod.start_date} → {selectedPeriod.end_date} ·{" "}
            {isAr
              ? `${budgetedCount} من ${rows.length} حساب محدَّد`
              : `${budgetedCount} of ${rows.length} accounts set`}
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

      <BudgetForm
        key={selectedPeriod.id}
        organizationId={organization.id}
        fiscalPeriodId={selectedPeriod.id}
        accounts={rows}
        locale={locale}
        canManage={canManage}
      />
    </div>
  );
}
