import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import { StaffAmenitiesClient, type StaffAmenity, type StaffAmenityBooking } from "./staff-amenities-client";

export default async function StaffAmenitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;
  const denied = await denyIfMissingPermission(organization.id, "operations.amenities.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: enabled }, { data: canManage }] = await Promise.all([
    supabase.rpc("amenity_booking_enabled", { p_organization_id: organization.id }),
    supabase.rpc("amenity_staff_can_manage", { p_organization_id: organization.id }),
  ]);
  if (!enabled) return <section className="rounded-2xl border bg-card p-6"><h1 className="text-lg font-black">{isAr ? "حجز المرافق غير مفعّل" : "Amenity booking is not enabled"}</h1></section>;

  const [{ data: propertyRows }, { data: amenityRows }, { data: bookingRows }] = await Promise.all([
    supabase.from("properties").select("id, name, timezone").eq("organization_id", organization.id).order("name"),
    supabase.from("amenities").select("id, property_id, name_ar, name_en, capacity, slot_minutes, opens_at, closes_at, requires_approval, is_active").eq("organization_id", organization.id).order("name_en"),
    supabase.from("amenity_bookings").select("id, amenity_id, unit_id, member_id, starts_at, ends_at, status, member_note, staff_note").eq("organization_id", organization.id).order("starts_at", { ascending: false }).limit(250),
  ]);
  const unitIds = [...new Set((bookingRows ?? []).map((row) => row.unit_id))];
  const memberIds = [...new Set((bookingRows ?? []).map((row) => row.member_id))];
  const [{ data: units }, { data: members }] = await Promise.all([
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    memberIds.length ? supabase.from("members").select("id, full_name").in("id", memberIds) : { data: [] },
  ]);
  const propertyName = new Map((propertyRows ?? []).map((row) => [row.id, row.name]));
  const amenityById = new Map((amenityRows ?? []).map((row) => [row.id, row]));
  const unitCode = new Map((units ?? []).map((row) => [row.id, row.code]));
  const memberName = new Map((members ?? []).map((row) => [row.id, row.full_name]));
  const amenities: StaffAmenity[] = (amenityRows ?? []).map((row) => ({
    id: row.id, propertyId: row.property_id, propertyName: propertyName.get(row.property_id) ?? "—",
    name: isAr ? row.name_ar : row.name_en, capacity: row.capacity, slotMinutes: row.slot_minutes,
    opensAt: row.opens_at.slice(0, 5), closesAt: row.closes_at.slice(0, 5), requiresApproval: row.requires_approval, isActive: row.is_active,
  }));
  const bookings: StaffAmenityBooking[] = (bookingRows ?? []).map((row) => {
    const amenity = amenityById.get(row.amenity_id);
    return { id: row.id, amenityName: amenity ? (isAr ? amenity.name_ar : amenity.name_en) : "—", unitCode: unitCode.get(row.unit_id) ?? "—", memberName: memberName.get(row.member_id) ?? "—", startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, memberNote: row.member_note, staffNote: row.staff_note };
  });
  return <StaffAmenitiesClient properties={propertyRows ?? []} amenities={amenities} bookings={bookings} canManage={Boolean(canManage)} locale={locale as "ar" | "en"} />;
}
