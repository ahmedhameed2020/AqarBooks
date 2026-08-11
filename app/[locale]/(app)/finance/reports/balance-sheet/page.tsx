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

export default async function BalanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ asOf?: string }>;
}) {
  const { locale } = await params;
  const { asOf } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const asOfDate = asOf || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_trial_balance", {
    p_organization_id: organization.id,
    p_start_date: "1900-01-01",
    p_end_date: asOfDate,
  });

  const assetRows = (rows ?? []).filter((r) => r.category === "ASSET" && r.balance !== 0);
  const liabilityRows = (rows ?? []).filter((r) => r.category === "LIABILITY" && r.balance !== 0);
  const equityRows = (rows ?? []).filter((r) => r.category === "EQUITY" && r.balance !== 0);
  const revenueTotal = (rows ?? []).filter((r) => r.category === "REVENUE").reduce((s, r) => s + r.balance, 0);
  const expenseTotal = (rows ?? []).filter((r) => r.category === "EXPENSE").reduce((s, r) => s + r.balance, 0);
  const currentEarnings = revenueTotal - expenseTotal;

  const totalAssets = assetRows.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equityRows.reduce((s, r) => s + r.balance, 0) + currentEarnings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "الميزانية العمومية" : "Balance Sheet"}</h1>
          <p className="text-sm text-muted-foreground">
            {isAr ? "حتى تاريخ" : "As of"} {asOfDate}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="date" name="asOf" defaultValue={asOfDate} className="rounded-md border border-input bg-transparent p-1.5 text-sm" />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {isAr ? "تحديث" : "Update"}
          </button>
        </form>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{isAr ? "الأصول" : "Assets"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{isAr ? r.name_ar : r.name_en}</TableCell>
                  <TableCell>{r.balance.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>{isAr ? "إجمالي الأصول" : "Total Assets"}</TableCell>
                <TableCell>{totalAssets.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead colSpan={2}>{isAr ? "الخصوم وحقوق الملكية" : "Liabilities & Equity"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40">
                <TableCell className="font-medium" colSpan={2}>
                  {isAr ? "الخصوم" : "Liabilities"}
                </TableCell>
              </TableRow>
              {liabilityRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{isAr ? r.name_ar : r.name_en}</TableCell>
                  <TableCell>{r.balance.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell>{isAr ? "إجمالي الخصوم" : "Total Liabilities"}</TableCell>
                <TableCell>{totalLiabilities.toFixed(2)}</TableCell>
              </TableRow>

              <TableRow className="bg-muted/40">
                <TableCell className="font-medium" colSpan={2}>
                  {isAr ? "حقوق الملكية" : "Equity"}
                </TableCell>
              </TableRow>
              {equityRows.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell>{isAr ? r.name_ar : r.name_en}</TableCell>
                  <TableCell>{r.balance.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>{isAr ? "أرباح الفترة الحالية" : "Current Period Earnings"}</TableCell>
                <TableCell>{currentEarnings.toFixed(2)}</TableCell>
              </TableRow>
              <TableRow className="font-medium">
                <TableCell>{isAr ? "إجمالي حقوق الملكية" : "Total Equity"}</TableCell>
                <TableCell>{totalEquity.toFixed(2)}</TableCell>
              </TableRow>

              <TableRow className="border-t-2 font-semibold">
                <TableCell>{isAr ? "إجمالي الخصوم وحقوق الملكية" : "Total Liabilities & Equity"}</TableCell>
                <TableCell>{(totalLiabilities + totalEquity).toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {Math.abs(totalAssets - (totalLiabilities + totalEquity)) > 0.005 && (
        <p className="text-sm text-destructive">
          {isAr ? "تحذير: الميزانية غير متوازنة" : "Warning: balance sheet does not balance"}
        </p>
      )}
    </div>
  );
}
