import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
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
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateAccountForm } from "./create-account-form";
import { CloneTemplateForm } from "./clone-template-form";

function sortByHierarchy<
  T extends { id: string; parent_id: string | null; code: string },
>(accounts: T[]): (T & { depth: number })[] {
  const byParent = new Map<string | null, T[]>();
  for (const account of accounts) {
    const list = byParent.get(account.parent_id) ?? [];
    list.push(account);
    byParent.set(account.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code));
  }

  const result: (T & { depth: number })[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const account of byParent.get(parentId) ?? []) {
      result.push({ ...account, depth });
      walk(account.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

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

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name_ar, name_en, parent_id, category, normal_balance, is_group, is_active")
    .eq("organization_id", organization.id);

  const sorted = sortByHierarchy(accounts ?? []);

  const { data: templates } = await supabase.from("coa_templates").select("key, name_ar, name_en");
  const template = templates?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "دليل الحسابات" : "Chart of Accounts"}</h1>
      </div>

      {!accounts?.length && template && (
        <CloneTemplateForm
          organizationId={organization.id}
          templateKey={template.key}
          templateName={isAr ? template.name_ar : template.name_en}
          locale={locale}
        />
      )}

      <CreateAccountForm organizationId={organization.id} accounts={accounts ?? []} locale={locale} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الرمز" : "Code"}</TableHead>
              <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
              <TableHead>{isAr ? "التصنيف" : "Category"}</TableHead>
              <TableHead>{isAr ? "الرصيد الطبيعي" : "Normal balance"}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length ? (
              sorted.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono text-xs">{account.code}</TableCell>
                  <TableCell style={{ paddingInlineStart: `${account.depth * 1.25 + 1}rem` }}>
                    <span className={account.is_group ? "font-semibold" : ""}>
                      {isAr ? account.name_ar : account.name_en}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{account.category}</TableCell>
                  <TableCell className="text-muted-foreground">{account.normal_balance}</TableCell>
                  <TableCell>
                    {account.is_group && <Badge variant="outline">{isAr ? "تجميعي" : "Group"}</Badge>}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد حسابات بعد" : "No accounts yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
