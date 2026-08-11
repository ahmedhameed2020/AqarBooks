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

export default async function IncomeStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { locale } = await params;
  const { start, end } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();

  let startDate = start;
  let endDate = end;
  if (!startDate || !endDate) {
    const { data: openPeriod } = await supabase
      .from("fiscal_periods")
      .select("start_date, end_date")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    startDate = startDate || openPeriod?.start_date || "1900-01-01";
    endDate = endDate || openPeriod?.end_date || new Date().toISOString().slice(0, 10);
  }

  const { data: rows } = await supabase.rpc("get_trial_balance", {
    p_organization_id: organization.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  const revenueRows = (rows ?? []).filter((r) => r.category === "REVENUE" && r.balance !== 0);
  const expenseRows = (rows ?? []).filter((r) => r.category === "EXPENSE" && r.balance !== 0);
  const totalRevenue = revenueRows.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.balance, 0);
  const net = totalRevenue - totalExpense;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "قائمة الدخل" : "Income Statement"}</h1>
          <p className="text-sm text-muted-foreground">
            {startDate} → {endDate}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="start" defaultValue={startDate} className="rounded-md border border-input bg-transparent p-1.5 text-sm" />
          <input type="date" name="end" defaultValue={endDate} className="rounded-md border border-input bg-transparent p-1.5 text-sm" />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {isAr ? "تحديث" : "Update"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الحساب" : "Account"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell className="font-semibold" colSpan={2}>
                {isAr ? "الإيرادات" : "Revenue"}
              </TableCell>
            </TableRow>
            {revenueRows.map((r) => (
              <TableRow key={r.account_id}>
                <TableCell className="ps-6">{isAr ? r.name_ar : r.name_en}</TableCell>
                <TableCell>{r.balance.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>{isAr ? "إجمالي الإيرادات" : "Total Revenue"}</TableCell>
              <TableCell>{totalRevenue.toFixed(2)}</TableCell>
            </TableRow>

            <TableRow className="bg-muted/40">
              <TableCell className="font-semibold" colSpan={2}>
                {isAr ? "المصروفات" : "Expenses"}
              </TableCell>
            </TableRow>
            {expenseRows.map((r) => (
              <TableRow key={r.account_id}>
                <TableCell className="ps-6">{isAr ? r.name_ar : r.name_en}</TableCell>
                <TableCell>{r.balance.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>{isAr ? "إجمالي المصروفات" : "Total Expenses"}</TableCell>
              <TableCell>{totalExpense.toFixed(2)}</TableCell>
            </TableRow>

            <TableRow className="border-t-2 font-semibold">
              <TableCell>{isAr ? "صافي الفائض/العجز" : "Net Surplus/Deficit"}</TableCell>
              <TableCell className={net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                {net.toFixed(2)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
