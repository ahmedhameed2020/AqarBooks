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
import { CreateDueTypeForm } from "./create-due-type-form";
import { IssueDueForm } from "./issue-due-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "outline",
  ISSUED: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "default",
  OVERDUE: "destructive",
  VOID: "outline",
};

export default async function DuesPage({
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
    { data: units },
    { data: dueTypes },
    { data: accounts },
    { data: periods },
    { data: dues },
    { data: allocations },
  ] = await Promise.all([
    supabase.from("units").select("id, code").eq("organization_id", organization.id).order("code"),
    supabase.from("due_types").select("id, name_ar, name_en").eq("organization_id", organization.id),
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
      .from("dues")
      .select("id, unit_id, amount, due_date, status, description")
      .eq("organization_id", organization.id)
      .order("due_date", { ascending: false })
      .limit(100),
    supabase
      .from("payment_allocations")
      .select("due_id, amount, payment_id"),
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

  const revenueAccounts = (accounts ?? []).filter((a) => a.category === "REVENUE");
  const assetAccounts = (accounts ?? []).filter((a) => a.category === "ASSET");
  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{isAr ? "المستحقات" : "Dues"}</h1>

      <CreateDueTypeForm organizationId={organization.id} revenueAccounts={revenueAccounts} locale={locale} />

      {resort && (
        <IssueDueForm
          organizationId={organization.id}
          resortId={resort.id}
          units={(units ?? []).map((u) => ({ id: u.id, label: u.code }))}
          dueTypes={(dueTypes ?? []).map((d) => ({ id: d.id, label: isAr ? d.name_ar : d.name_en }))}
          receivableAccounts={assetAccounts.map((a) => ({
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
              <TableHead>{isAr ? "الوحدة" : "Unit"}</TableHead>
              <TableHead>{isAr ? "المبلغ" : "Amount"}</TableHead>
              <TableHead>{isAr ? "المتبقي" : "Remaining"}</TableHead>
              <TableHead>{isAr ? "الاستحقاق" : "Due date"}</TableHead>
              <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dues?.length ? (
              dues.map((due) => (
                <TableRow key={due.id}>
                  <TableCell className="font-medium">{unitCodeById.get(due.unit_id) ?? "—"}</TableCell>
                  <TableCell>{due.amount.toFixed(2)}</TableCell>
                  <TableCell>{(due.amount - (paidByDue.get(due.id) ?? 0)).toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{due.due_date}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[due.status] ?? "outline"}>{due.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {isAr ? "لا توجد مستحقات بعد" : "No dues yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
