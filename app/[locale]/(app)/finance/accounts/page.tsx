import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { ACCOUNT_CATEGORIES, categoryLabel } from "@/lib/accounting/account-labels";
import { CreateAccountForm } from "./create-account-form";
import { CloneTemplateForm } from "./clone-template-form";
import { AccountsClient, type AccountRow } from "./accounts-client";

export default async function ChartOfAccountsPage({
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

  const canViewAccounts = await hasPermission(organization.id, "finance.accounts.view");
  if (!canViewAccounts) {
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-start">
        <h1 className="text-xl font-bold text-red-900">
          {isAr ? "دليل الحسابات" : "Chart of Accounts"}
        </h1>
        <p className="text-sm text-red-700">
          {isAr
            ? "لا تملك صلاحية عرض دليل وشجرة الحسابات المحاسبية."
            : "You do not have permission to view the chart of accounts."}
        </p>
      </div>
    );
  }

  const canManage = await hasPermission(organization.id, "finance.accounts.manage");

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, code, name_ar, name_en, parent_id, category, normal_balance, is_group, is_active, is_used, requires_cost_center, is_cash_equivalent, cash_flow_section"
    )
    .eq("organization_id", organization.id);

  const rows = (accounts ?? []) as AccountRow[];

  const { data: templates } = await supabase
    .from("coa_templates")
    .select("key, name_ar, name_en");
  const template = templates?.[0];

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div className="space-y-1 text-start">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {isAr ? "دليل وشجرة الحسابات" : "Chart of Accounts"}
            </h1>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-200/60">
              {isAr ? "الهيكل المالي الموحد" : "Unified Ledger"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {isAr
              ? "الهيكل المحاسبي الشامل للقيود اليومية ومراكز التكلفة والتدفقات النقدية وفق المعايير المحاسبية المعتمدة."
              : "Comprehensive accounting structure governing journal entries, cost centers, and cash flow classifications."}
          </p>
        </div>

        {canManage && rows.length > 0 && (
          <CreateAccountForm
            organizationId={organization.id}
            accounts={rows}
            locale={locale}
          />
        )}
      </div>

      {/* Empty State with Template Cloning */}
      {!rows.length && template && canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <CloneTemplateForm
            organizationId={organization.id}
            templateKey={template.key}
            templateName={isAr ? template.name_ar : template.name_en}
            locale={locale}
          />
        </div>
      )}

      {/* Main Interactive Accounts Table & Dashboard */}
      {rows.length > 0 && (
        <AccountsClient
          accounts={rows}
          canManage={canManage}
          locale={locale}
          organizationName={organization.name}
        />
      )}
    </div>
  );
}
