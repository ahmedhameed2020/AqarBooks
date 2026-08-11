import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { CreateCashboxForm } from "./create-cashbox-form";
import { OpenSessionForm, CloseSessionForm, PayDueForm } from "./session-forms";

export default async function CashierPage({
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

  const [{ data: cashboxes }, { data: openSessions }, { data: accounts }, { data: periods }] =
    await Promise.all([
      supabase.from("cashboxes").select("id, name, gl_account_id").eq("organization_id", organization.id),
      supabase
        .from("cashier_sessions")
        .select("id, cashbox_id, opening_balance, opened_at")
        .eq("organization_id", organization.id)
        .eq("status", "OPEN"),
      supabase
        .from("chart_of_accounts")
        .select("id, code, name_ar, name_en, category")
        .eq("organization_id", organization.id)
        .eq("is_group", false),
      supabase
        .from("fiscal_periods")
        .select("id")
        .eq("organization_id", organization.id)
        .eq("status", "OPEN")
        .limit(1),
    ]);

  const { data: openDues } = await supabase
    .from("dues")
    .select("id, unit_id, amount")
    .eq("organization_id", organization.id)
    .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

  const { data: units } = await supabase.from("units").select("id, code").eq("organization_id", organization.id);
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));

  const { data: allocations } = await supabase.from("payment_allocations").select("due_id, amount, payment_id");
  const { data: postedPayments } = await supabase
    .from("payments")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("status", "POSTED");
  const postedIds = new Set((postedPayments ?? []).map((p) => p.id));
  const paidByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (!postedIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }
  const dueOptions = (openDues ?? []).map((d) => ({
    id: d.id,
    label: unitCodeById.get(d.unit_id) ?? d.unit_id,
    remaining: d.amount - (paidByDue.get(d.id) ?? 0),
  }));

  const assetAccounts = (accounts ?? []).filter((a) => a.category === "ASSET");
  const sessionByCashbox = new Map((openSessions ?? []).map((s) => [s.cashbox_id, s]));
  const fiscalPeriodId = periods?.[0]?.id;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{isAr ? "الخزينة" : "Cashier"}</h1>

      {resort && (
        <CreateCashboxForm
          organizationId={organization.id}
          resortId={resort.id}
          assetAccounts={assetAccounts.map((a) => ({ id: a.id, label: `${a.code} — ${isAr ? a.name_ar : a.name_en}` }))}
          locale={locale}
        />
      )}

      <div className="space-y-4">
        {cashboxes?.length ? (
          cashboxes.map((cashbox) => {
            const session = sessionByCashbox.get(cashbox.id);
            return (
              <div key={cashbox.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium">{cashbox.name}</h2>
                  <Badge variant={session ? "default" : "outline"}>
                    {session ? (isAr ? "جلسة مفتوحة" : "Session open") : (isAr ? "مغلق" : "Closed")}
                  </Badge>
                </div>

                {!session && resort && (
                  <OpenSessionForm
                    organizationId={organization.id}
                    resortId={resort.id}
                    cashboxId={cashbox.id}
                    locale={locale}
                  />
                )}

                {session && resort && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {isAr ? "افتُتحت" : "Opened"} {new Date(session.opened_at).toLocaleString(locale)} —{" "}
                      {isAr ? "الرصيد الافتتاحي" : "Opening"}: {session.opening_balance.toFixed(2)}
                    </p>
                    {fiscalPeriodId && (
                      <PayDueForm
                        organizationId={organization.id}
                        resortId={resort.id}
                        sessionId={session.id}
                        cashAccountId={cashbox.gl_account_id}
                        dues={dueOptions}
                        fiscalPeriodId={fiscalPeriodId}
                        locale={locale}
                      />
                    )}
                    <CloseSessionForm sessionId={session.id} locale={locale} />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">{isAr ? "لا توجد صناديق بعد" : "No cashboxes yet"}</p>
        )}
      </div>
    </div>
  );
}
