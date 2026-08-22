import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { buildMonthlyFinancials } from "@/lib/property/unit-financials";
import { computeAgingRows, totalsByBucket } from "@/lib/finance/aging";
import { buildActivity, shapeOwnershipHistory } from "@/lib/property/unit-activity";
import { UnitHeader } from "./unit-header";
import { UnitDetailTabs } from "./unit-detail-tabs";
import { TabOverview } from "./tab-overview";
import { TabFinancials } from "./tab-financials";
import { TabOwnership } from "./tab-ownership";
import { TabLease } from "./tab-lease";
import { TabInstallments } from "./tab-installments";
import { TabActivity } from "./tab-activity";

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
  const currency = organization.default_currency;

  // units_with_financials lacks created_at, so fetch it from the base table.
  const { data: unitMeta } = await supabase
    .from("units")
    .select("created_at")
    .eq("id", unitId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  const registeredDate = unitMeta?.created_at ? unitMeta.created_at.slice(0, 10) : null;

  // Full dues for this unit (chart + aging + activity + lastPayment).
  const { data: dueRows } = await supabase
    .from("dues")
    .select("id, unit_id, amount, issue_date, due_date, status, due_type_id")
    .eq("organization_id", organization.id)
    .eq("unit_id", unitId);

  const dueTypeIds = [...new Set((dueRows ?? []).map((d) => d.due_type_id))];
  const { data: dueTypes } = dueTypeIds.length
    ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
    : { data: [] };
  const dueTypeName = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));

  // Payments link to a unit only through payment_allocations -> dues.unit_id
  // (payments.unit_id is always null in production).
  const dueIds = (dueRows ?? []).map((d) => d.id);
  const { data: allocRows } = dueIds.length
    ? await supabase.from("payment_allocations").select("due_id, payment_id, amount").in("due_id", dueIds)
    : { data: [] };
  const allocPaymentIds = [...new Set((allocRows ?? []).map((a) => a.payment_id))];
  const { data: postedPayRows } = allocPaymentIds.length
    ? await supabase
        .from("payments")
        .select("id, amount, payment_date, method, status")
        .eq("organization_id", organization.id)
        .in("id", allocPaymentIds)
        .eq("status", "POSTED")
    : { data: [] };
  const postedIds = new Set((postedPayRows ?? []).map((p) => p.id));
  const payById = new Map((postedPayRows ?? []).map((p) => [p.id, p]));

  const paidPerPayment = new Map<string, { amount: number; payment_date: string; method: string }>();
  for (const a of allocRows ?? []) {
    if (!postedIds.has(a.payment_id)) continue;
    const p = payById.get(a.payment_id);
    if (!p) continue;
    const prev = paidPerPayment.get(a.payment_id);
    paidPerPayment.set(a.payment_id, {
      amount: (prev?.amount ?? 0) + a.amount,
      payment_date: p.payment_date,
      method: p.method,
    });
  }
  const paidEvents = [...paidPerPayment.values()];
  const lastPayment = paidEvents.length
    ? paidEvents.reduce((latest, p) => (p.payment_date > latest.payment_date ? p : latest))
    : null;

  // Full ownership history (no active-only filter) -- current split, history
  // timeline, and the overview's "current owner" card are all derived from it.
  const { data: ownershipHistoryRows } = await supabase
    .from("unit_ownerships")
    .select("member_id, share_percentage, is_primary_contact, start_date, end_date")
    .eq("organization_id", organization.id)
    .eq("unit_id", unitId)
    .order("start_date", { ascending: false });
  const { data: allOrgMembers } = await supabase
    .from("members")
    .select("id, full_name, phone, email")
    .eq("organization_id", organization.id)
    .order("full_name");

  const historyMemberName = new Map((allOrgMembers ?? []).map((m) => [m.id, m.full_name]));
  const historyMemberPhone = new Map((allOrgMembers ?? []).map((m) => [m.id, m.phone]));

  const monthly = buildMonthlyFinancials(
    (dueRows ?? []).map((d) => ({ issue_date: d.issue_date, due_date: d.due_date, amount: d.amount, status: d.status })),
    paidEvents.map((p) => ({ payment_date: p.payment_date, amount: p.amount })),
  );

  const agingTotals = totalsByBucket(
    computeAgingRows(
      (dueRows ?? []).filter((d) => ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(d.status)),
      (allocRows ?? []).map((a) => ({ due_id: a.due_id, payment_id: a.payment_id, amount: a.amount })),
      postedIds,
    ),
  );

  const activity = buildActivity(
    unitMeta?.created_at ?? `${today}T00:00:00Z`,
    (dueRows ?? []).map((d) => ({
      issue_date: d.issue_date,
      due_date: d.due_date,
      amount: d.amount,
      status: d.status,
      type: dueTypeName.get(d.due_type_id) ?? "—",
    })),
    paidEvents,
    (ownershipHistoryRows ?? []).map((o) => ({
      start_date: o.start_date,
      end_date: o.end_date,
      member_name: historyMemberName.get(o.member_id) ?? "—",
    })),
    isAr,
  );

  const ownershipHistory = shapeOwnershipHistory(ownershipHistoryRows ?? [], historyMemberName, today);
  const activeOwnerships = (ownershipHistoryRows ?? []).filter((o) => !o.end_date || o.end_date >= today);
  const primary = activeOwnerships[0];
  const overviewOwner = primary
    ? {
        id: primary.member_id,
        name: historyMemberName.get(primary.member_id) ?? "—",
        phone: historyMemberPhone.get(primary.member_id) ?? null,
        share: primary.share_percentage,
      }
    : null;

  return (
    <main className="space-y-6 p-6">
      <UnitHeader
        unit={unit}
        locale={locale}
        currency={currency}
        organizationName={organization.name}
        resortName={organization.name}
        registeredDate={registeredDate}
        lastPayment={lastPayment}
        dues={(dueRows ?? []).map((d) => ({
          date: d.due_date,
          type: dueTypeName.get(d.due_type_id) ?? (isAr ? "مطالبة مالية" : "Fee Due"),
          amount: d.amount,
          status: d.status,
        }))}
        payments={(postedPayRows ?? []).map((p) => ({
          date: p.payment_date,
          method: p.method || "CASH",
          amount: p.amount,
        }))}
      />
      <UnitDetailTabs
        labels={{
          overview: isAr ? "نظرة عامة" : "Overview",
          financials: isAr ? "المالية" : "Financials",
          ownership: isAr ? "الملكية" : "Ownership",
          lease: isAr ? "الإيجار" : "Lease",
          installments: isAr ? "التقسيط" : "Installments",
          activity: isAr ? "النشاط" : "Activity",
        }}
        overview={
          <TabOverview
            unit={unit}
            locale={locale}
            currency={currency}
            owner={overviewOwner}
            registeredDate={registeredDate}
            recentActivity={activity}
          />
        }
        financials={
          <TabFinancials
            organizationId={organization.id}
            unitId={unitId}
            locale={locale}
            currency={currency}
            monthly={monthly}
            agingTotals={agingTotals}
          />
        }
        ownership={
          <TabOwnership
            organizationId={organization.id}
            unitId={unitId}
            unitCode={unit.code}
            history={ownershipHistory}
            members={allOrgMembers ?? []}
            locale={locale}
          />
        }
        lease={<TabLease organizationId={organization.id} unitId={unitId} locale={locale} currency={currency} />}
        installments={<TabInstallments organizationId={organization.id} unitId={unitId} locale={locale} currency={currency} />}
        activity={<TabActivity events={activity} locale={locale} currency={currency} />}
      />
    </main>
  );
}
