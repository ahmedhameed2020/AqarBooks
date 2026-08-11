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
import { AccountPicker } from "./account-picker";

export default async function GeneralLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ accountId?: string }>;
}) {
  const { locale } = await params;
  const { accountId } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code, name_ar, name_en")
    .eq("organization_id", organization.id)
    .eq("is_group", false)
    .order("code");

  const { data: lines } = accountId
    ? await supabase.rpc("get_account_ledger", {
        p_organization_id: organization.id,
        p_account_id: accountId,
        p_start_date: "1900-01-01",
        p_end_date: new Date().toISOString().slice(0, 10),
      })
    : { data: null };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "دفتر الأستاذ العام" : "General Ledger"}</h1>
      </div>

      <AccountPicker accounts={accounts ?? []} selectedId={accountId} locale={locale} />

      {accountId && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
                <TableHead>{isAr ? "البيان" : "Description"}</TableHead>
                <TableHead>{isAr ? "مدين" : "Debit"}</TableHead>
                <TableHead>{isAr ? "دائن" : "Credit"}</TableHead>
                <TableHead>{isAr ? "الرصيد" : "Balance"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines?.length ? (
                lines.map((l) => (
                  <TableRow key={l.entry_id + String(l.running_balance)}>
                    <TableCell>{l.entry_number ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{l.entry_date}</TableCell>
                    <TableCell>{l.description}</TableCell>
                    <TableCell>{l.debit > 0 ? l.debit.toFixed(2) : ""}</TableCell>
                    <TableCell>{l.credit > 0 ? l.credit.toFixed(2) : ""}</TableCell>
                    <TableCell className="font-medium">{l.running_balance.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {isAr ? "لا توجد حركات لهذا الحساب" : "No activity for this account"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
