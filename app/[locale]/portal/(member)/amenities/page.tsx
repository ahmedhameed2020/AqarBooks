import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { createClient } from "@/lib/supabase/server";
import { PortalAmenitiesClient, type PortalAmenity, type PortalAmenityBooking } from "./portal-amenities-client";

export default async function PortalAmenitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: enabled, error: enabledError } = await supabase.rpc("amenity_booking_enabled", {
    p_organization_id: ctx.member.organization_id,
  });
  if (enabledError) {
    console.error("[PortalAmenitiesPage] entitlement query failed:", enabledError.message);
    return <section className="rounded-2xl border border-rose-200 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "تعذر تحميل خدمة حجز المرافق" : "Could not load amenity booking"}</h1><p className="mt-2 text-sm text-slate-500">{isAr ? "حدّث الصفحة، وإذا استمرت المشكلة فتواصل مع الإدارة." : "Refresh the page. If the problem continues, contact management."}</p></section>;
  }
  if (!enabled) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black">{isAr ? "حجز المرافق غير متاح في باقتك" : "Amenity booking is not included in your plan"}</h1>
        <p className="mt-2 text-sm text-slate-500">{isAr ? "تواصل مع إدارة المنشأة لتفعيل الخدمة." : "Contact property management to enable this service."}</p>
      </section>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: ownerships, error: ownershipsError }, { data: amenityRows, error: amenitiesError }, { data: bookingRows, error: bookingsError }] = await Promise.all([
    supabase.from("unit_ownerships").select("unit_id").eq("organization_id", ctx.member.organization_id).eq("member_id", ctx.member.id).lte("start_date", today).or(`end_date.is.null,end_date.gte.${today}`),
    supabase.from("amenities").select("id, property_id, name_ar, name_en, description_ar, description_en, capacity, slot_minutes, opens_at, closes_at, max_advance_days, requires_approval").eq("is_active", true).order("name_en"),
    supabase.from("amenity_bookings").select("id, property_id, amenity_id, unit_id, starts_at, ends_at, status, member_note, staff_note").order("starts_at", { ascending: false }).limit(100),
  ]);
  if (ownershipsError || amenitiesError || bookingsError) {
    console.error("[PortalAmenitiesPage] data query failed:", ownershipsError?.message ?? amenitiesError?.message ?? bookingsError?.message);
    return <section className="rounded-2xl border border-rose-200 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "تعذر تحميل المرافق والحجوزات" : "Could not load amenities and bookings"}</h1><p className="mt-2 text-sm text-slate-500">{isAr ? "لم نعرض قائمة فارغة لأن تحميل البيانات فشل. حاول مجددًا." : "The page was not shown as empty because loading failed. Please try again."}</p></section>;
  }

  const unitIds = [...new Set((ownerships ?? []).map((row) => row.unit_id))];
  const { data: units, error: unitsError } = unitIds.length
    ? await supabase.from("units").select("id, property_id, code").in("id", unitIds).is("archived_at", null)
    : { data: [], error: null };
  if (unitsError) {
    console.error("[PortalAmenitiesPage] current units query failed:", unitsError.message);
    return <section className="rounded-2xl border border-rose-200 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "تعذر تحميل الوحدات الحالية" : "Could not load current units"}</h1></section>;
  }

  const propertyIds = [...new Set([...(units ?? []).map((unit) => unit.property_id), ...(amenityRows ?? []).map((amenity) => amenity.property_id), ...(bookingRows ?? []).map((booking) => booking.property_id)])];
  const { data: properties, error: propertiesError } = propertyIds.length
    ? await supabase.from("properties").select("id, timezone").in("id", propertyIds)
    : { data: [], error: null };
  if (propertiesError) {
    console.error("[PortalAmenitiesPage] property timezone query failed:", propertiesError.message);
    return <section className="rounded-2xl border border-rose-200 bg-card p-6"><h1 className="text-lg font-black">{isAr ? "تعذر تحميل المنطقة الزمنية للعقار" : "Could not load the property timezone"}</h1></section>;
  }
  const propertyTimezone = new Map((properties ?? []).map((property) => [property.id, property.timezone]));

  const amenities: PortalAmenity[] = (amenityRows ?? []).map((row) => ({
    id: row.id,
    propertyId: row.property_id,
    propertyTimezone: propertyTimezone.get(row.property_id) ?? "UTC",
    name: isAr ? row.name_ar : row.name_en,
    description: isAr ? row.description_ar : row.description_en,
    capacity: row.capacity,
    slotMinutes: row.slot_minutes,
    opensAt: row.opens_at.slice(0, 5),
    closesAt: row.closes_at.slice(0, 5),
    maxAdvanceDays: row.max_advance_days,
    requiresApproval: row.requires_approval,
  }));
  const amenityName = new Map(amenities.map((item) => [item.id, item.name]));
  const unitCode = new Map((units ?? []).map((unit) => [unit.id, unit.code]));
  const bookings: PortalAmenityBooking[] = (bookingRows ?? []).map((row) => ({
    id: row.id,
    amenityId: row.amenity_id,
    amenityName: amenityName.get(row.amenity_id) ?? "—",
    propertyTimezone: propertyTimezone.get(row.property_id) ?? "UTC",
    unitCode: unitCode.get(row.unit_id) ?? "—",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    memberNote: row.member_note,
    staffNote: row.staff_note,
  }));

  return <PortalAmenitiesClient amenities={amenities} units={units ?? []} bookings={bookings} locale={locale as "ar" | "en"} />;
}
