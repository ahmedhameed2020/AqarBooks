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
import { RecordPaymentForm } from "./record-payment-form";

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { locale } = await params;
  const { unit: unitParam } = await searchParams;
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
    { data: members },
    { data: units },
    { data: openDues },
    { data: accounts },
    { data: periods },
    { data: payments },
    { data: allocations },
  ] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("organization_id", organization.id).order("full_name"),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
    supabase
      .from("dues")
      .select("id, unit_id, amount, status")
      .eq("organization_id", organization.id)
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name_ar, name_en, category")
      .eq("organization_id", organization.id)
      .eq("is_group", false)
      .eq("category", "ASSET"),
    supabase
      .from("fiscal_periods")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN"),
    supabase
      .from("payments")
      .select("id, receipt_number, amount, method, payment_date, status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("payment_allocations").select("due_id, amount, payment_id"),
  ]);

  const { data: postedPayments } = await supabase
    .from("payments")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("status", "POSTED");
  const postedPaymentIds = new Set((postedPayments ?? []).map((p) => p.id));

  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const paidByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }

  const dueOptions = (openDues ?? []).map((d) => ({
    id: d.id,
    unitId: d.unit_id,
    label: `${unitCodeById.get(d.unit_id) ?? d.unit_id} — ${d.amount.toFixed(2)}`,
    remaining: d.amount - (paidByDue.get(d.id) ?? 0),
  }));
  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{isAr ? "المدفوعات" : "Payments"}</h1>

      {resort && (
        <RecordPaymentForm
          organizationId={organization.id}
          resortId={resort.id}
          members={(members ?? []).map((m) => ({ id: m.id, label: m.full_name }))}
          dues={dueOptions}
          depositAccounts={(accounts ?? []).map((a) => ({
            id: a.id,
            label: `${a.code} — ${isAr ? a.name_ar : a.name_en}`,
          }))}
          periods={(periods ?? []).map((p) => ({ id: p.id, label: p.name }))}
          locale={locale}
          preselectedUnitId={preselectedUnitId}
        />
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isAr ? "رقم الإيصال" : "Receipt #"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "الطريقة" : "Method"}</TableHead>
              <TableHead>{isAr ? "التاريخ" : "Date"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments?.length ? (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.receipt_number}</TableCell>
                  <TableCell>{payment.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.method}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.payment_date}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد مدفوعات بعد" : "No payments yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
