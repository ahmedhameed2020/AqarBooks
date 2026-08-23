import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { DueDbRow } from "@/lib/portal/row-types";
import { agingBucketOf, isoMonthsAgo } from "@/lib/portal/portal-finance";
import {
  PortalDashboardClient,
  type DashboardDue,
  type DashboardUnit,
  type MonthPoint,
} from "./portal-dashboard-client";

type AllocationRow = { due_id: string; amount: number; reversed_at: string | null };
type PaymentRow = { amount: number; payment_date: string };
type UnitRow = {
  id: string;
  code: string;
  unit_type: string;
  custom_type_label: string | null;
  balance: number;
};

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;
  const trendStart = isoMonthsAgo(11);

  const [
    { data: orgDisplay },
    { data: summaryData },
    { data: openDuesData },
    { data: unitsData },
    { data: paymentsData },
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("members_with_financials")
      .select("units_count, total_balance, last_payment_amount, last_payment_date")
      .eq("id", member.id)
      .maybeSingle(),
    supabase
      .from("dues")
      .select("id, amount, issue_date, due_date, description, status, units(code)")
      .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
      .order("due_date", { ascending: true }),
    supabase
      .from("units_with_financials")
      .select("id, code, unit_type, custom_type_label, balance")
      .order("code", { ascending: true }),
    supabase
      .from("payments")
      .select("amount, payment_date")
      .eq("member_id", member.id)
      .gte("payment_date", trendStart)
      .order("payment_date", { ascending: true }),
  ]);

  const rawDues = (openDuesData ?? []) as unknown as DueDbRow[];

  // Same outstanding rule the dues page applies: a part-settled charge must
  // not be summarised at its gross value here and at its remaining value one
  // click away.
  const paidByDue = new Map<string, number>();
  if (rawDues.length > 0) {
    const { data: allocationData } = await supabase
      .from("payment_allocations")
      .select("due_id, amount, reversed_at")
      .in(
        "due_id",
        rawDues.map((d) => d.id),
      );
    for (const a of (allocationData ?? []) as unknown as AllocationRow[]) {
      if (a.reversed_at) continue;
      paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + Number(a.amount));
    }
  }

  const today = new Date();
  const dues: DashboardDue[] = rawDues.map((d) => ({
    id: d.id,
    description: d.description ?? (isAr ? "استحقاق مالي دوري" : "Periodic due"),
    unitCode: d.units?.code ?? null,
    dueDate: d.due_date,
    outstanding: Math.max(Number(d.amount) - (paidByDue.get(d.id) ?? 0), 0),
    bucket: agingBucketOf(d.due_date, today),
  }));

  const units: DashboardUnit[] = ((unitsData ?? []) as unknown as UnitRow[]).map((u) => ({
    id: u.id,
    code: u.code,
    typeLabel: u.custom_type_label || u.unit_type,
    balance: Number(u.balance),
  }));

  // Twelve rolling months, zero-filled: a gap month is information ("nothing
  // was paid then"), and dropping it would distort the shape of the series.
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    monthKeys.push(d.toISOString().slice(0, 7));
  }
  const totalsByMonth = new Map<string, number>(monthKeys.map((k) => [k, 0]));
  for (const p of (paymentsData ?? []) as unknown as PaymentRow[]) {
    const key = p.payment_date.slice(0, 7);
    if (totalsByMonth.has(key)) totalsByMonth.set(key, totalsByMonth.get(key)! + Number(p.amount));
  }
  const trend: MonthPoint[] = monthKeys.map((k) => ({ month: k, amount: totalsByMonth.get(k) ?? 0 }));

  return (
    <PortalDashboardClient
      memberName={member.full_name}
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      unitsCount={Number(summaryData?.units_count ?? units.length)}
      totalBalance={Number(summaryData?.total_balance ?? 0)}
      lastPaymentAmount={
        summaryData?.last_payment_amount === null || summaryData?.last_payment_amount === undefined
          ? null
          : Number(summaryData.last_payment_amount)
      }
      lastPaymentDate={summaryData?.last_payment_date ?? null}
      dues={dues}
      units={units}
      trend={trend}
      locale={locale}
    />
  );
}
