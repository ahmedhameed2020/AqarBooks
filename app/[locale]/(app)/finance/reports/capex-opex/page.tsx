import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Wrench, AlertCircle } from "lucide-react";
import { CapexOpexClient, type CapexOpexItem } from "./capex-opex-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX) — AqarBooks"
      : "CAPEX vs OPEX Maintenance Schedule — AqarBooks",
    description: isAr
      ? "الفصل المحاسبي بين المصاريف الرأسمالية المعززة لقيمة الأصول (CAPEX) والمصاريف التشغيلية الروتينية (OPEX)."
      : "Accounting classification of maintenance spending into capital expenditures (CAPEX) vs operational expenses (OPEX).",
  };
}

export default async function CapexOpexPage({
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

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.expenses.view"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تقرير CAPEX vs OPEX" : "CAPEX vs OPEX Schedule"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير الصيانة الرأسمالية والتشغيلية."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: assetsRaw, error: assetsError },
    { data: expensesRaw, error: expensesError },
    { data: propertiesRaw },
    { data: resortsRaw },
    { data: accountsRaw },
    { data: categoriesRaw },
  ] = await Promise.all([
    supabase
      .from("fixed_assets")
      .select("id, code, name_ar, name_en, property_id, acquisition_date, acquisition_cost, asset_account_id")
      .eq("organization_id", organization.id),
    supabase
      .from("expenses")
      .select("id, description, amount, expense_date, voucher_number, property_id, expense_category_id")
      .eq("organization_id", organization.id),
    supabase.from("properties").select("id, name").eq("organization_id", organization.id),
    supabase.from("resorts").select("id, name").eq("organization_id", organization.id),
    supabase.from("chart_of_accounts").select("id, name_ar, name_en").eq("organization_id", organization.id),
    supabase.from("expense_categories").select("id, name_ar, name_en").eq("organization_id", organization.id),
  ]);

  // A failed read is a failure, never an empty report.
  if (assetsError || expensesError) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تعذر تحميل تقرير CAPEX / OPEX" : "The CAPEX / OPEX report could not be loaded"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لم تُقرأ البيانات من قاعدة البيانات. أعد المحاولة؛ لا تُعرض أرقام ناقصة."
            : "Data could not be read from the database. Try again; no partial numbers are shown."}
        </p>
      </div>
    );
  }

  // Classification rule (shown to the reader): CAPEX = capitalised fixed assets
  // acquired (acquisition cost); OPEX = recorded expense vouchers (expense amount).
  const propertyName = new Map(
    [...(propertiesRaw ?? []), ...(resortsRaw ?? [])].map((row) => [row.id, row.name] as const),
  );
  const accountName = new Map(
    (accountsRaw ?? []).map((a) => [a.id, isAr ? a.name_ar : a.name_en] as const),
  );
  const categoryName = new Map(
    (categoriesRaw ?? []).map((c) => [c.id, isAr ? c.name_ar : c.name_en] as const),
  );

  const items: CapexOpexItem[] = [
    ...(assetsRaw ?? []).map((asset) => ({
      id: `CAPEX-${asset.id}`,
      workOrderNumber: asset.code,
      title: (isAr ? asset.name_ar : asset.name_en) || asset.name_ar || asset.name_en,
      category: (asset.asset_account_id && accountName.get(asset.asset_account_id)) || (isAr ? "أصل ثابت" : "Fixed asset"),
      resortName: asset.property_id ? propertyName.get(asset.property_id) ?? "—" : "—",
      type: "CAPEX" as const,
      contractorName: "—",
      cost: Number(asset.acquisition_cost ?? 0),
      completionDate: asset.acquisition_date ?? "",
      isCapitalized: true,
    })),
    ...(expensesRaw ?? []).map((expense) => ({
      id: `OPEX-${expense.id}`,
      workOrderNumber: expense.voucher_number != null ? `V-${expense.voucher_number}` : "—",
      title: expense.description ?? "—",
      category: (expense.expense_category_id && categoryName.get(expense.expense_category_id)) || (isAr ? "مصروف" : "Expense"),
      resortName: expense.property_id ? propertyName.get(expense.property_id) ?? "—" : "—",
      type: "OPEX" as const,
      contractorName: "—",
      cost: Number(expense.amount ?? 0),
      completionDate: expense.expense_date ?? "",
      isCapitalized: false,
    })),
  ].sort((a, b) => b.completionDate.localeCompare(a.completionDate));

  return (
    <CapexOpexClient
      items={items}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}

