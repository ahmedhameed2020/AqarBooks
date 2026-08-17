import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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
import { CreateStatementForm, type BankAccountOption } from "./statement-forms";

export default async function ReconciliationIndexPage({
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

  const [canManage, canRead] = await Promise.all([
    hasPermission(organization.id, "finance.bank_reconciliation.manage"),
    hasPermission(organization.id, "finance.bank_reconciliation.read"),
  ]);

  if (!canManage && !canRead) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">{isAr ? "المطابقة البنكية" : "Bank Reconciliation"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "لا تملك صلاحية الاطلاع على المطابقات البنكية. تواصل مع مدير النظام."
            : "You don't have permission to view bank reconciliations. Contact an administrator."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: statements }, { data: accounts }] = await Promise.all([
    supabase
      .from("bank_statements")
      .select("id, period_start, period_end, closing_balance, status, bank_account_id")
      .eq("organization_id", organization.id)
      .order("period_end", { ascending: false }),
    supabase
      .from("bank_accounts")
      .select("id, account_name, account_number, is_active")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("account_name"),
  ]);

  const accountById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const options: BankAccountOption[] = (accounts ?? []).map((a) => ({
    id: a.id,
    label: `${a.account_name} — ${a.account_number}`,
  }));

  const fmt = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "المطابقة البنكية" : "Bank Reconciliation"}</h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "قارن ما يقوله البنك بما تقوله الدفاتر، وأثبت الفرق بندًا بندًا."
            : "Confront what the bank says against what the books say, and account for the difference line by line."}
        </p>
      </div>

      {canManage && (
        <CreateStatementForm
          organizationId={organization.id}
          bankAccounts={options}
          locale={locale}
        />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الحساب البنكي" : "Bank account"}</TableHead>
              <TableHead>{isAr ? "الفترة" : "Period"}</TableHead>
              <TableHead className="text-end">{isAr ? "الرصيد الختامي" : "Closing balance"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(statements ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {isAr ? "لا توجد كشوف حسابات بعد." : "No statements yet."}
                </TableCell>
              </TableRow>
            ) : (
              (statements ?? []).map((s) => {
                const account = accountById.get(s.bank_account_id);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/finance/banks/reconciliation/${s.id}`}
                        locale={locale as Locale}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {account ? account.account_name : (isAr ? "حساب محذوف" : "Deleted account")}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {s.period_start} → {s.period_end}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{fmt(s.closing_balance)}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "RECONCILED" ? "default" : "secondary"}>
                        {s.status === "RECONCILED"
                          ? isAr
                            ? "مطابَق"
                            : "Reconciled"
                          : isAr
                            ? "قيد المطابقة"
                            : "In progress"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
