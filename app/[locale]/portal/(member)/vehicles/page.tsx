import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalVehiclesClient, type PortalVehicleItem } from "./portal-vehicles-client";

export default async function PortalVehiclesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: vehicleRows, error } = await supabase
    .from("vehicles")
    .select("id, property_id, unit_id, plate_number, plate_country, plate_region, make, model, color, year, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) console.error("[PortalVehiclesPage] vehicle query failed:", error.message);

  const vehicles = vehicleRows ?? [];
  const unitIds = [...new Set(vehicles.map((vehicle) => vehicle.unit_id))];
  const propertyIds = [...new Set(vehicles.map((vehicle) => vehicle.property_id))];
  const [{ data: units }, { data: properties }] = await Promise.all([
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.code]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));

  const items: PortalVehicleItem[] = vehicles.map((vehicle) => ({
    id: vehicle.id,
    unitCode: unitById.get(vehicle.unit_id) ?? "—",
    propertyName: propertyById.get(vehicle.property_id) ?? "—",
    plateNumber: vehicle.plate_number,
    plateCountry: vehicle.plate_country,
    plateRegion: vehicle.plate_region,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    year: vehicle.year,
    isActive: vehicle.is_active,
    createdAt: vehicle.created_at,
  }));

  return <PortalVehiclesClient vehicles={items} locale={locale as "ar" | "en"} />;
}
