import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "@/app/[locale]/(app)/dashboard/kpi-card";
import { ExpensesClient, type ExpenseRow } from "./expenses-client";
import { type OptionItem, type CategoryDetail } from "./expense-dialogs";
import {
  DollarSign,
  Receipt,
  Tag,
  TrendingDown,
  Layers,
  Wallet,
  ArrowDownRight,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "المصروفات وسندات الصرف | AqarBooks" : "Expenses & Vouchers | AqarBooks",
    description: isAr
      ? "إدارة وتسجيل المصروفات وسندات الصرف المباشرة وترحيل القيود المحاسبية."
      : "Manage, record, and track expense vouchers with automated general ledger postings.",
  };
}

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const { data: resort } = await supabase
    .from("resorts")
    .select("id")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [
    { data: categoriesRaw },
    { data: accountsRaw },
    { data: periodsRaw },
    { data: expensesRaw },
  ] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("id, name_ar, name_en, default_expense_account_id")
      .eq("organization_id", organization.id),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase
      .from("expenses")
      .select(
        "id, voucher_number, description, amount, expense_date, expense_category_id, payment_account_id, journal_entry_id, created_at"
      )
      .eq("organization_id", organization.id)
      .order("expense_date", { ascending: false })
      .limit(300),
  ]);

  const expenses: ExpenseRow[] = (expensesRaw ?? []).map((e) => ({
    id: e.id,
    voucher_number: e.voucher_number,
    description: e.description,
    amount: Number(e.amount),
    expense_date: e.expense_date,
    expense_category_id: e.expense_category_id,
    payment_account_id: e.payment_account_id,
    journal_entry_id: e.journal_entry_id,
    created_at: e.created_at,
  }));

  const expenseAccounts: OptionItem[] = (accountsRaw ?? [])
    .filter((a) => a.category === "EXPENSE")
    .map((a) => ({
      id: a.id,
      code: a.code,
      label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
    }));

  const paymentAccounts: OptionItem[] = (accountsRaw ?? [])
    .filter((a) => a.category === "ASSET")
    .map((a) => ({
      id: a.id,
      code: a.code,
      label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
    }));

  const periods: OptionItem[] = (periodsRaw ?? []).map((p) => ({
    id: p.id,
    label: p.name,
  }));

  // Category counts and amounts
  const countByCategory = new Map<string, { count: number; total: number }>();
  for (const exp of expenses) {
    const prev = countByCategory.get(exp.expense_category_id) || { count: 0, total: 0 };
    countByCategory.set(exp.expense_category_id, {
      count: prev.count + 1,
      total: prev.total + exp.amount,
    });
  }

  const categoryDetails: CategoryDetail[] = (categoriesRaw ?? []).map((c) => {
    const stats = countByCategory.get(c.id);
    return {
      id: c.id,
      name_ar: c.name_ar,
      name_en: c.name_en,
      default_expense_account_id: c.default_expense_account_id,
      expenseCount: stats?.count ?? 0,
      totalAmount: stats?.total ?? 0,
    };
  });

  const categories: OptionItem[] = (categoriesRaw ?? []).map((c) => ({
    id: c.id,
    label: isAr ? c.name_ar : c.name_en,
  }));

  // ── Financial Intelligence Calculations ──────────────────────────
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCount = expenses.length;
  const avgAmount = totalCount > 0 ? totalAmount / totalCount : 0;

  // Find top expense category
  let topCategoryName = "—";
  let topCategoryAmount = 0;
  for (const cat of categoryDetails) {
    if ((cat.totalAmount ?? 0) > topCategoryAmount) {
      topCategoryAmount = cat.totalAmount ?? 0;
      topCategoryName = isAr ? cat.name_ar : cat.name_en;
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {isAr ? "المصروفات وسندات الصرف" : "Expenses & Disbursement Vouchers"}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {isAr
            ? "حوكمة وضبط المصروفات التشغيلية والعمومية مع ترحيل القيود اليومية للحسابات آلياً."
            : "Record, govern, and audit operating expenditures with instant General Ledger double-entry postings."}
        </p>
      </div>

      {/* ── Executive KPI Summary Grid ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Expenses */}
        <KpiCard
          label={isAr ? "إجمالي المصروفات المسجلة" : "Total Expenses"}
          value={
            <>
              {totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-slate-400">{isAr ? "ر.س" : "SAR"}</span>
            </>
          }
          icon={<DollarSign className="size-5" />}
          tone="negative"
          hint={isAr ? `إجمالي الإنفاق عبر ${totalCount} سند` : `Across ${totalCount} vouchers`}
        />

        {/* Total Vouchers Count */}
        <KpiCard
          label={isAr ? "عدد سندات الصرف" : "Total Vouchers"}
          value={totalCount.toLocaleString()}
          icon={<Receipt className="size-5" />}
          tone="info"
          hint={isAr ? "سندات صادرة ومرحلة" : "Posted vouchers"}
        />

        {/* Average Expense per Voucher */}
        <KpiCard
          label={isAr ? "متوسط قيمة السند" : "Average Voucher Size"}
          value={
            <>
              {avgAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-xs font-bold text-slate-400">{isAr ? "ر.س" : "SAR"}</span>
            </>
          }
          icon={<ArrowDownRight className="size-5" />}
          tone="warning"
          hint={isAr ? "معدل الصرف لكل سند" : "Mean expenditure"}
        />

        {/* Top Spending Category */}
        <KpiCard
          label={isAr ? "الفئة الأكثر إنفاقاً" : "Top Expense Category"}
          value={topCategoryName}
          icon={<Tag className="size-5" />}
          tone="positive"
          hint={
            topCategoryAmount > 0
              ? isAr
                ? `${topCategoryAmount.toLocaleString()} ر.س`
                : `${topCategoryAmount.toLocaleString()} SAR`
              : isAr ? "لا توجد حركات بعد" : "No activity"
          }
        />
      </div>

      {/* ── Main Interactive Table & Client Controls ────────────────── */}
      <ExpensesClient
        expenses={expenses}
        categories={categories}
        categoryDetails={categoryDetails}
        paymentAccounts={paymentAccounts}
        expenseAccounts={expenseAccounts}
        periods={periods}
        organizationId={organization.id}
        resortId={resort?.id ?? ""}
        locale={locale}
      />
    </div>
  );
}
