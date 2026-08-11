import { setRequestLocale } from "next-intl/server";
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
import { CreateExpenseCategoryForm, RecordExpenseForm } from "./expense-forms";

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

  const [{ data: categories }, { data: accounts }, { data: periods }, { data: expenses }] = await Promise.all([
    supabase.from("expense_categories").select("id, name_ar, name_en").eq("organization_id", organization.id),
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
      .select("id, voucher_number, description, amount, expense_date, expense_category_id")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const categoryNameById = new Map(
    (categories ?? []).map((c) => [c.id, isAr ? c.name_ar : c.name_en]),
  );
  const expenseAccounts = (accounts ?? []).filter((a) => a.category === "EXPENSE");
  const assetAccounts = (accounts ?? []).filter((a) => a.category === "ASSET");

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">{isAr ? "المصروفات" : "Expenses"}</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">{isAr ? "فئات المصروفات" : "Expense Categories"}</h2>
        <CreateExpenseCategoryForm
          organizationId={organization.id}
          expenseAccounts={expenseAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
          locale={locale}
        />
      </section>

      {resort && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium">{isAr ? "سند صرف" : "Expense Voucher"}</h2>
          <RecordExpenseForm
            organizationId={organization.id}
            resortId={resort.id}
            categories={(categories ?? []).map((c) => ({ id: c.id, label: isAr ? c.name_ar : c.name_en }))}
            paymentAccounts={assetAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
            periods={(periods ?? []).map((p) => ({ id: p.id, label: p.name }))}
            locale={locale}
          />
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{isAr ? "الفئة" : "Category"}</TableHead>
              <TableHead>{isAr ? "الوصف" : "Description"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses?.length ? (
              expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.voucher_number ?? "—"}</TableCell>
                  <TableCell>{categoryNameById.get(e.expense_category_id) ?? "—"}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell>{e.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.expense_date}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد مصروفات بعد" : "No expenses yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
