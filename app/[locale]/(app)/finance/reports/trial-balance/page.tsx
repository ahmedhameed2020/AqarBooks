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

export default async function TrialBalancePage({
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

  const nonZero = (rows ?? []).filter((r) => r.total_debit !== 0 || r.total_credit !== 0);
  const totalDebit = nonZero.reduce((s, r) => s + r.total_debit, 0);
  const totalCredit = nonZero.reduce((s, r) => s + r.total_credit, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "ميزان المراجعة" : "Trial Balance"}</h1>
          <p className="text-sm text-muted-foreground">
            {isAr ? "حتى تاريخ" : "As of"} {asOfDate}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input
            type="date"
            name="asOf"
            defaultValue={asOfDate}
            className="rounded-md border border-input bg-transparent p-1.5 text-sm"
          />
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm">
            {isAr ? "تحديث" : "Update"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "الرمز" : "Code"}</TableHead>
              <TableHead>{isAr ? "الحساب" : "Account"}</TableHead>
              <TableHead>{isAr ? "مدين" : "Debit"}</TableHead>
              <TableHead>{isAr ? "دائن" : "Credit"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nonZero.length ? (
              nonZero.map((r) => (
                <TableRow key={r.account_id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{isAr ? r.name_ar : r.name_en}</TableCell>
                  <TableCell>{r.total_debit.toFixed(2)}</TableCell>
                  <TableCell>{r.total_credit.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد حركات مرحّلة" : "No posted activity"}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="font-medium">
              <TableCell colSpan={2}>{isAr ? "الإجمالي" : "Total"}</TableCell>
              <TableCell>{totalDebit.toFixed(2)}</TableCell>
              <TableCell>{totalCredit.toFixed(2)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      {Math.abs(totalDebit - totalCredit) > 0.005 && (
        <p className="text-sm text-destructive">
          {isAr ? "تحذير: الميزان غير متوازن" : "Warning: trial balance does not balance"}
        </p>
      )}
    </div>
  );
}
