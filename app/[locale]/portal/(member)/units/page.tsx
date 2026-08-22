import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import {
  PortalUnitsClient,
  type PortalUnitItem,
} from "./portal-units-client";

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
  ] = await Promise.all([
    supabase.rpc("get_own_organization_display").maybeSingle(),
    supabase
      .from("units_with_financials")
      .select("id, code, unit_type, custom_type_label, building_name_ar, building_name_en, zone_name_ar, zone_name_en, balance, has_arrears")
      .order("code", { ascending: true }),
  ]);

  if (unitsError) console.error("[PortalUnitsPage] units query failed:", unitsError.message);

  const units = (unitsData ?? []) as unknown as PortalUnitItem[];
  const organizationName = orgDisplay?.name ?? "AqarBooks";
  const currency = orgDisplay?.default_currency ?? "EGP";

  return (
    <PortalUnitsClient
      organizationName={organizationName}
      currency={currency}
      memberName={member.full_name ?? ""}
      units={units}
      locale={locale}
    />
  );
}
