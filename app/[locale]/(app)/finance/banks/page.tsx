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
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateBankForm, CreateBankAccountForm } from "./bank-forms";
import { RecordChequeForm, ChequeStatusForm, ClearChequeForm } from "./cheque-forms";

const CHEQUE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  RECEIVED: "secondary",
  DEPOSITED: "secondary",
  CLEARED: "default",
  RETURNED: "destructive",
  CANCELLED: "outline",
};

export default async function BanksPage({
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

  const [
    { data: banks },
    { data: bankAccounts },
    { data: accounts },
    { data: members },
    { data: cheques },
    { data: periods },
    { data: openDues },
    { data: units },
  ] = await Promise.all([
    supabase.from("banks").select("id, name_ar, name_en").eq("organization_id", organization.id),
    supabase
      .from("bank_accounts")
      .select("id, account_name, account_number, bank_id")
      .eq("organization_id", organization.id),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("category", "ASSET"),
    supabase.from("members").select("id, full_name").eq("organization_id", organization.id),
    supabase
      .from("cheques")
      .select("id, cheque_number, amount, status, due_date, bank_account_id, direction")
      .eq("organization_id", organization.id)
      .order("cheque_date", { ascending: false }),
    supabase.from("fiscal_periods").select("id").eq("organization_id", organization.id).eq("status", "OPEN").limit(1),
    supabase
      .from("dues")
      .select("id, unit_id, amount")
      .eq("organization_id", organization.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
  ]);

  const bankNameById = new Map((banks ?? []).map((b) => [b.id, isAr ? b.name_ar : b.name_en]));
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const fiscalPeriodId = periods?.[0]?.id;
  const dueOptions = (openDues ?? []).map((d) => ({
    id: d.id,
    label: `${unitCodeById.get(d.unit_id) ?? d.unit_id} — ${d.amount.toFixed(2)}`,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{isAr ? "البنوك والشيكات" : "Banks & Cheques"}</h1>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">{isAr ? "البنوك" : "Banks"}</h2>
        <CreateBankForm organizationId={organization.id} locale={locale} />
        {resort && (
          <CreateBankAccountForm
            organizationId={organization.id}
            resortId={resort.id}
            banks={(banks ?? []).map((b) => ({ id: b.id, label: isAr ? b.name_ar : b.name_en }))}
            assetAccounts={(accounts ?? []).map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
            locale={locale}
          />
        )}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? "البنك" : "Bank"}</TableHead>
                <TableHead>{isAr ? "اسم الحساب" : "Account name"}</TableHead>
                <TableHead>{isAr ? "رقم الحساب" : "Account number"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankAccounts?.length ? (
                bankAccounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell>{bankNameById.get(acc.bank_id) ?? "—"}</TableCell>
                    <TableCell className="font-medium">{acc.account_name}</TableCell>
                    <TableCell className="text-muted-foreground">{acc.account_number}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {isAr ? "لا توجد حسابات بنكية بعد" : "No bank accounts yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium">{isAr ? "الشيكات" : "Cheques"}</h2>
        {resort && (
          <RecordChequeForm
            organizationId={organization.id}
            resortId={resort.id}
            bankAccounts={(bankAccounts ?? []).map((a) => ({ id: a.id, label: a.account_name }))}
            members={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
            locale={locale}
          />
        )}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? "رقم الشيك" : "Cheque #"}</TableHead>
                <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
                <TableHead>{isAr ? "الاستحقاق" : "Due date"}</TableHead>
                <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isAr ? "إجراء" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cheques?.length ? (
                cheques.map((cheque) => (
                  <TableRow key={cheque.id}>
                    <TableCell className="font-medium">{cheque.cheque_number}</TableCell>
                    <TableCell>{cheque.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{cheque.due_date}</TableCell>
                    <TableCell>
                      <Badge variant={CHEQUE_VARIANT[cheque.status] ?? "outline"}>{cheque.status}</Badge>
                    </TableCell>
                    <TableCell className="space-y-2">
                      <ChequeStatusForm chequeId={cheque.id} currentStatus={cheque.status} locale={locale} />
                      {cheque.status === "DEPOSITED" && (
                        <ClearChequeForm
                          chequeId={cheque.id}
                          amount={cheque.amount}
                          fiscalPeriodId={fiscalPeriodId}
                          dues={dueOptions}
                          locale={locale}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {isAr ? "لا توجد شيكات بعد" : "No cheques yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
