import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StaffVehiclesClient, type StaffVehicleItem } from "./vehicles-client";

type VehicleRow = {
  id: string;
  property_id: string;
  unit_id: string;
  member_id: string;
  plate_number: string;
  plate_country: string;
  plate_region: string | null;
  normalized_plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function StaffVehiclesPage({
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

  const denied = await denyIfMissingPermission(organization.id, "operations.vehicles.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: moduleEnabled }, { data: canManage }] = await Promise.all([
    supabase.rpc("unit_experience_enabled", { p_organization_id: organization.id }),
    supabase.rpc("vehicle_staff_can_manage", { p_organization_id: organization.id }),
  ]);

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "تجربة الوحدة غير مفعلة" : "Unit experience is not enabled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAr ? "فعّل استحقاق تجربة الوحدة قبل استخدام سجل المركبات." : "Enable the unit experience entitlement before using the vehicle registry."}
        </p>
      </div>
    );
  }

  const { data: vehicleRows, error } = await supabase
    .from("vehicles")
    .select("id, property_id, unit_id, member_id, plate_number, plate_country, plate_region, normalized_plate, make, model, color, year, notes, is_active, created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) console.error("[StaffVehiclesPage] vehicles query failed:", error.message);
  const vehicles = (vehicleRows ?? []) as VehicleRow[];

  const [{ data: units }, { data: properties }, { data: members }] = await Promise.all([
    vehicles.length ? supabase.from("units").select("id, code").in("id", [...new Set(vehicles.map((vehicle) => vehicle.unit_id))]) : { data: [] },
    vehicles.length ? supabase.from("properties").select("id, name").in("id", [...new Set(vehicles.map((vehicle) => vehicle.property_id))]) : { data: [] },
    vehicles.length ? supabase.from("members").select("id, full_name").in("id", [...new Set(vehicles.map((vehicle) => vehicle.member_id))]) : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit.code]));
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));
  const memberById = new Map((members ?? []).map((member) => [member.id, member.full_name]));

  const items: StaffVehicleItem[] = vehicles.map((vehicle) => ({
    id: vehicle.id,
    propertyName: propertyById.get(vehicle.property_id) ?? "—",
    unitCode: unitById.get(vehicle.unit_id) ?? "—",
    memberName: memberById.get(vehicle.member_id) ?? "—",
    plateNumber: vehicle.plate_number,
    plateCountry: vehicle.plate_country,
    plateRegion: vehicle.plate_region,
    normalizedPlate: vehicle.normalized_plate,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    year: vehicle.year,
    notes: vehicle.notes,
    isActive: vehicle.is_active,
    createdAt: vehicle.created_at,
  }));

  return <StaffVehiclesClient vehicles={items} canManage={Boolean(canManage)} locale={locale as "ar" | "en"} />;
}
