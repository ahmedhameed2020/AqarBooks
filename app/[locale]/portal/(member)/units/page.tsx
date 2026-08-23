import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import type { UnitType } from "@/lib/units/unit-type-labels";
import { PortalUnitsClient, type PortalUnitItem, type PortalPlanItem } from "./portal-units-client";

type UnitRow = {
  id: string;
  code: string;
  unit_type: UnitType;
  custom_type_label: string | null;
  building_name_ar: string | null;
  building_name_en: string | null;
  zone_name_ar: string | null;
  zone_name_en: string | null;
  area: number | null;
  floor_number: number | null;
  total_due: number;
  total_paid: number;
  balance: number;
  has_arrears: boolean;
};

type OwnershipRow = {
  unit_id: string;
  share_percentage: number | null;
  is_primary_contact: boolean;
  start_date: string | null;
  end_date: string | null;
};

type PlanRow = {
  id: string;
  unit_id: string;
  status: string;
  total_price: number;
  down_payment: number | null;
  installment_count: number;
  installment_frequency: string;
  starts_on: string;
};

export default async function PortalUnitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const { member } = ctx;

  const [
    { data: orgDisplay },
    { data: unitsData, error: unitsError },
    { data: ownershipData, error: ownershipError },
    { data: planData, error: planError },
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("units_with_financials")
      .select(
        "id, code, unit_type, custom_type_label, building_name_ar, building_name_en, zone_name_ar, zone_name_en, area, floor_number, total_due, total_paid, balance, has_arrears",
      )
      .order("code", { ascending: true }),
    // unit_ownerships_select_own already scopes this to the caller's own
    // ownership records; the explicit member_id filter keeps the intent legible
    // and survives any future widening of that policy.
    supabase
      .from("unit_ownerships")
      .select("unit_id, share_percentage, is_primary_contact, start_date, end_date")
      .eq("member_id", member.id),
    supabase
      .from("installment_plans")
      .select("id, unit_id, status, total_price, down_payment, installment_count, installment_frequency, starts_on")
      .eq("buyer_member_id", member.id),
  ]);

  if (unitsError) console.error("[PortalUnitsPage] units query failed:", unitsError.message);
  if (ownershipError)
    console.error("[PortalUnitsPage] ownerships query failed:", ownershipError.message);
  if (planError) console.error("[PortalUnitsPage] plans query failed:", planError.message);

  const today = new Date().toISOString().slice(0, 10);
  const ownershipByUnit = new Map<string, OwnershipRow>();
  for (const o of (ownershipData ?? []) as unknown as OwnershipRow[]) {
    // A unit can carry a historical ownership row alongside the live one; the
    // current holding is the one that has not ended.
    const isCurrent = !o.end_date || o.end_date >= today;
    const existing = ownershipByUnit.get(o.unit_id);
    if (!existing || isCurrent) ownershipByUnit.set(o.unit_id, o);
  }

  const units: PortalUnitItem[] = ((unitsData ?? []) as unknown as UnitRow[]).map((u) => {
    const ownership = ownershipByUnit.get(u.id);
    return {
      id: u.id,
      code: u.code,
      unit_type: u.unit_type,
      custom_type_label: u.custom_type_label,
      building_name_ar: u.building_name_ar,
      building_name_en: u.building_name_en,
      zone_name_ar: u.zone_name_ar,
      zone_name_en: u.zone_name_en,
      area: u.area === null ? null : Number(u.area),
      floor_number: u.floor_number,
      totalDue: Number(u.total_due),
      totalPaid: Number(u.total_paid),
      balance: Number(u.balance),
      sharePercentage: ownership?.share_percentage === null || ownership?.share_percentage === undefined
        ? null
        : Number(ownership.share_percentage),
      isPrimaryContact: ownership?.is_primary_contact ?? false,
      ownedSince: ownership?.start_date ?? null,
    };
  });

  const plans: PortalPlanItem[] = ((planData ?? []) as unknown as PlanRow[]).map((p) => ({
    id: p.id,
    unitCode: units.find((u) => u.id === p.unit_id)?.code ?? null,
    status: p.status,
    totalPrice: Number(p.total_price),
    downPayment: p.down_payment === null ? null : Number(p.down_payment),
    installmentCount: p.installment_count,
    installmentFrequency: p.installment_frequency,
    startsOn: p.starts_on,
  }));

  return (
    <PortalUnitsClient
      organizationName={orgDisplay?.name ?? "AqarBooks"}
      currency={orgDisplay?.default_currency ?? "EGP"}
      memberName={member.full_name ?? ""}
      units={units}
      plans={plans}
      locale={locale}
    />
  );
}
