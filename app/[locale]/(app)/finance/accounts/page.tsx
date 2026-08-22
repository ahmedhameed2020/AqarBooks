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

  // chart_of_accounts SELECT stays broadly readable to any org member at
  // the RLS layer (chart_of_accounts_select_member, is_org_member) --
  // deliberately NOT tightened, since it's a shared reference table read
  // by 8+ other finance pages (cashier, banks, suppliers, dues, payments,
  // general-ledger, etc.) across roles that legitimately need to resolve
  // account names/codes without needing full chart-of-accounts management
  // rights. This page-level gate only protects the ADMINISTRATION view
  // (full listing + create-account form) specifically, matching the same
  // pattern already used by finance/reports/aging/page.tsx.
  const canViewAccounts = await hasPermission(organization.id, "finance.accounts.view");
  if (!canViewAccounts) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "دليل الحسابات" : "Chart of Accounts"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا تملك صلاحية عرض دليل الحسابات." : "You don't have permission to view the chart of accounts."}
        </p>
      </div>
    );
  }

  // Writes are gated by the chart_of_accounts_manage RLS policy. Mirroring it
  // here keeps the create and edit affordances from being offered to a
  // read-only member whose submit would only ever be rejected.
  const canManage = await hasPermission(organization.id, "finance.accounts.manage");

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select(
      "id, code, name_ar, name_en, parent_id, category, normal_balance, is_group, is_active, is_used, requires_cost_center, is_cash_equivalent, cash_flow_section",
    )
    .eq("organization_id", organization.id);

  const rows = (accounts ?? []) as AccountRow[];

  const { data: templates } = await supabase.from("coa_templates").select("key, name_ar, name_en");
  const template = templates?.[0];

  const postable = rows.filter((a) => !a.is_group).length;
  const perCategory = ACCOUNT_CATEGORIES.map((category) => ({
    category,
    count: rows.filter((a) => a.category === category).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{isAr ? "دليل الحسابات" : "Chart of Accounts"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "الهيكل المحاسبي الذي تُرحَّل إليه كل القيود. الحسابات التجميعية لا يُقيَّد عليها مباشرة."
            : "The account structure every journal entry posts into. Group accounts are not directly postable."}
        </p>
      </div>

      {rows.length > 0 && (
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{isAr ? "إجمالي الحسابات" : "Total accounts"}</dt>
            <dd className="font-semibold tabular-nums">{rows.length}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{isAr ? "قابلة للترحيل" : "Postable"}</dt>
            <dd className="font-semibold tabular-nums">{postable}</dd>
          </div>
          {perCategory.map(({ category, count }) => (
            <div key={category} className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{categoryLabel(category, isAr)}</dt>
              <dd className="font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      )}

      {!rows.length && template && canManage && (
        <CloneTemplateForm
          organizationId={organization.id}
          templateKey={template.key}
          templateName={isAr ? template.name_ar : template.name_en}
          locale={locale}
        />
      )}

      {canManage && (
        <CreateAccountForm organizationId={organization.id} accounts={rows} locale={locale} />
      )}

      <AccountsClient accounts={rows} canManage={canManage} locale={locale} />
    </div>
  );
}
