import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Wallet, Receipt, CircleCheck, Clock3 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Money } from "@/components/money";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { KpiCard } from "../../dashboard/kpi-card";
import { UnitBalanceBadge } from "../unit-balance-badge";
import { OccupancyBadge, unitTypeLabel } from "../units-table";
import { DuesTable } from "../dues-table";
import { PaymentsTable } from "../payments-table";
import { BackButton } from "../back-button";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ locale: string; unitId: string }>;
}) {
  const { locale, unitId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale: locale as Locale });
  const organization = await getPrimaryOrganization(user!.id);
  if (!organization) notFound();

  const supabase = await createClient();

  // Explicit organization_id scoping here (not relying on RLS alone, per
  // the phase-2 brief): a unitId from another tenant must 404, never leak
  // through as a silent empty page.
  const { data: unit } = await supabase
    .from("units_with_financials")
    .select("*")
    .eq("id", unitId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!unit) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const { data: ownerships } = await supabase
    .from("unit_ownerships")
    .select("member_id, share_percentage, is_primary_contact, end_date")
    .eq("organization_id", organization.id)
    .eq("unit_id", unitId)
    .order("share_percentage", { ascending: false });

  // payments.unit_id is always null in production data -- the "record
  // payment" form has no unit field, only a member field. The only reliable
  // unit-level link is payment_allocations -> dues.unit_id (see PaymentsTable
  // for the full explanation), so "last payment" is derived the same way.
  const { data: unitDues } = await supabase.from("dues").select("id").eq("organization_id", organization.id).eq("unit_id", unitId);
  const unitDueIds = (unitDues ?? []).map((d) => d.id);
  let lastPayment: { amount: number; payment_date: string } | null = null;
  if (unitDueIds.length) {
    const { data: allocations } = await supabase
      .from("payment_allocations")
      .select("payment_id, amount")
      .in("due_id", unitDueIds);
    const paymentIds = [...new Set((allocations ?? []).map((a) => a.payment_id))];
    if (paymentIds.length) {
      const { data: payments } = await supabase
        .from("payments")
        .select("id, payment_date, status")
        .eq("organization_id", organization.id)
        .in("id", paymentIds)
        .eq("status", "POSTED")
        .order("payment_date", { ascending: false });
      const latest = (payments ?? [])[0];
      if (latest) {
        const amount = (allocations ?? [])
          .filter((a) => a.payment_id === latest.id)
          .reduce((s, a) => s + a.amount, 0);
        lastPayment = { amount, payment_date: latest.payment_date };
      }
    }
  }

  const activeOwnerships = (ownerships ?? []).filter((o) => !o.end_date || o.end_date >= today);
  const memberIds = [...new Set(activeOwnerships.map((o) => o.member_id))];
  const { data: members } = memberIds.length
    ? await supabase.from("members").select("id, full_name, email, phone").in("id", memberIds)
    : { data: [] };
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  const currency = organization.default_currency;

  return (
    <main className="space-y-6 p-6">
      <BackButton locale={locale} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{unit.code}</h1>
        <UnitBalanceBadge balance={unit.balance} currency={currency} locale={locale} />
        <OccupancyBadge status={unit.occupancy_status} locale={locale} />
      </div>
      <p className="text-sm text-muted-foreground">
        {[isAr ? unit.building_name_ar : unit.building_name_en, isAr ? unit.zone_name_ar : unit.zone_name_en]
          .filter(Boolean)
          .join(" · ") || (isAr ? "بدون مبنى/منطقة" : "No building/zone")}
        {" · "}
        {unitTypeLabel(unit, isAr)}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isAr ? `الرصيد الحالي (${currency})` : `Current balance (${currency})`}
          value={<Money amount={unit.balance} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />}
          icon={<Wallet className="size-4.5" />}
          tone={unit.balance > 0 ? "negative" : "positive"}
        />
        <KpiCard
          label={isAr ? `إجمالي المستحق (${currency})` : `Total due (${currency})`}
          value={<Money amount={unit.total_due} locale={locale} />}
          icon={<Receipt className="size-4.5" />}
        />
        <KpiCard
          label={isAr ? `إجمالي المدفوع (${currency})` : `Total paid (${currency})`}
          value={<Money amount={unit.total_paid} locale={locale} tone="positive" />}
          icon={<CircleCheck className="size-4.5" />}
          tone="positive"
        />
        <KpiCard
          label={isAr ? "آخر دفعة" : "Last payment"}
          value={lastPayment ? <Money amount={lastPayment.amount} currency={currency} locale={locale} /> : "—"}
          hint={lastPayment?.payment_date}
          icon={<Clock3 className="size-4.5" />}
        />
      </div>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">{isAr ? "المالك الحالي" : "Current owner"}</h2>
        </div>
        <div className="p-4">
          {activeOwnerships.length ? (
            <div className="space-y-3">
              {activeOwnerships.map((o) => {
                const member = memberById.get(o.member_id);
                return (
                  <div key={o.member_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      {member ? (
                        <Link href={`/members/${member.id}`} locale={locale} className="font-medium hover:underline">
                          {member.full_name}
                        </Link>
                      ) : (
                        <span className="font-medium">—</span>
                      )}
                      {o.is_primary_contact && (
                        <span className="ms-2 text-xs text-muted-foreground">
                          {isAr ? "(جهة الاتصال الأساسية)" : "(primary contact)"}
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {[member?.email, member?.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <span className="tabular-nums font-medium text-muted-foreground">{o.share_percentage}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {isAr ? "لا يوجد مالك مسجّل" : "No owner on record"}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الاستحقاقات" : "Dues history"}</h2>
        <DuesTable organizationId={organization.id} unitId={unitId} locale={locale} currency={currency} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الدفعات" : "Payments history"}</h2>
        <PaymentsTable organizationId={organization.id} unitId={unitId} locale={locale} currency={currency} />
      </section>
    </main>
  );
}
