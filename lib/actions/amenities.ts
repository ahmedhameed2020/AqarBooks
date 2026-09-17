"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const amenitySchema = z.object({
  propertyId: z.string().uuid(),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  descriptionAr: z.string().trim().max(1000).optional().nullable(),
  descriptionEn: z.string().trim().max(1000).optional().nullable(),
  capacity: z.number().int().min(1).max(10000),
  slotMinutes: z.number().int().min(15).max(480),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  maxAdvanceDays: z.number().int().min(1).max(365),
  requiresApproval: z.boolean(),
});

const bookingSchema = z.object({
  amenityId: z.string().uuid(),
  unitId: z.string().uuid(),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00)?$/),
  memberNote: z.string().trim().max(500).optional().nullable(),
});

const amenityUpdateSchema = amenitySchema.omit({ propertyId: true }).extend({
  amenityId: z.string().uuid(),
  isActive: z.boolean(),
});

const bookingIdSchema = z.object({ bookingId: z.string().uuid() });
const amenityStatusSchema = z.object({ amenityId: z.string().uuid(), isActive: z.boolean() });
const decisionSchema = bookingIdSchema.extend({
  decision: z.enum(["CONFIRMED", "REJECTED"]),
  staffNote: z.string().trim().max(500).optional().nullable(),
});

export type AmenityActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function mapError(message: string | undefined) {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("NOT_ENTITLED")) return "not_entitled";
  if (message.includes("NOT_FOUND")) return "not_found";
  if (message.includes("NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("DUPLICATE_AMENITY_NAME")) return "duplicate_name";
  if (message.includes("AMENITY_SLOT_UNAVAILABLE")) return "slot_unavailable";
  if (message.includes("INVALID_BOOKING_SLOT")) return "invalid_slot";
  if (message.includes("NOT_CANCELLABLE")) return "not_cancellable";
  if (message.includes("INVALID_BOOKING_DECISION")) return "invalid_decision";
  return "failed";
}

function revalidateAmenityRoutes() {
  revalidatePath("/[locale]/portal/amenities", "page");
  revalidatePath("/[locale]/portal/notifications", "page");
  revalidatePath("/[locale]/operations/amenities", "page");
}

export async function createAmenityAction(
  input: z.input<typeof amenitySchema>,
): Promise<AmenityActionResult> {
  const parsed = amenitySchema.safeParse(input);
  if (!parsed.success || parsed.data.opensAt >= parsed.data.closesAt) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_amenity", {
    p_property_id: parsed.data.propertyId,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
    p_description_ar: parsed.data.descriptionAr || null,
    p_description_en: parsed.data.descriptionEn || null,
    p_capacity: parsed.data.capacity,
    p_slot_minutes: parsed.data.slotMinutes,
    p_opens_at: parsed.data.opensAt,
    p_closes_at: parsed.data.closesAt,
    p_max_advance_days: parsed.data.maxAdvanceDays,
    p_requires_approval: parsed.data.requiresApproval,
  });

  if (error || !data) {
    console.error("[createAmenityAction] failed:", error?.message);
    return { ok: false, error: mapError(error?.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: data };
}

export async function createAmenityBookingAction(
  input: z.input<typeof bookingSchema>,
): Promise<AmenityActionResult> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_amenity_booking", {
    p_amenity_id: parsed.data.amenityId,
    p_unit_id: parsed.data.unitId,
    p_local_starts_at: parsed.data.startsAt,
    p_member_note: parsed.data.memberNote || null,
  });
  if (error || !data) {
    console.error("[createAmenityBookingAction] failed:", error?.message);
    return { ok: false, error: mapError(error?.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: data };
}

export async function updateAmenityAction(
  input: z.input<typeof amenityUpdateSchema>,
): Promise<AmenityActionResult> {
  const parsed = amenityUpdateSchema.safeParse(input);
  if (!parsed.success || parsed.data.opensAt >= parsed.data.closesAt) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_amenity", {
    p_amenity_id: parsed.data.amenityId,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
    p_description_ar: parsed.data.descriptionAr || null,
    p_description_en: parsed.data.descriptionEn || null,
    p_capacity: parsed.data.capacity,
    p_slot_minutes: parsed.data.slotMinutes,
    p_opens_at: parsed.data.opensAt,
    p_closes_at: parsed.data.closesAt,
    p_max_advance_days: parsed.data.maxAdvanceDays,
    p_requires_approval: parsed.data.requiresApproval,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[updateAmenityAction] failed:", error.message);
    return { ok: false, error: mapError(error.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: parsed.data.amenityId };
}

export async function setAmenityActiveAction(
  input: z.input<typeof amenityStatusSchema>,
): Promise<AmenityActionResult> {
  const parsed = amenityStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_amenity_active", {
    p_amenity_id: parsed.data.amenityId,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[setAmenityActiveAction] failed:", error.message);
    return { ok: false, error: mapError(error.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: parsed.data.amenityId };
}

export async function cancelAmenityBookingAction(
  input: z.input<typeof bookingIdSchema>,
): Promise<AmenityActionResult> {
  const parsed = bookingIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_amenity_booking", {
    p_booking_id: parsed.data.bookingId,
  });
  if (error) {
    console.error("[cancelAmenityBookingAction] failed:", error.message);
    return { ok: false, error: mapError(error.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: parsed.data.bookingId };
}

export async function decideAmenityBookingAction(
  input: z.input<typeof decisionSchema>,
): Promise<AmenityActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_amenity_booking", {
    p_booking_id: parsed.data.bookingId,
    p_decision: parsed.data.decision,
    p_staff_note: parsed.data.staffNote || null,
  });
  if (error) {
    console.error("[decideAmenityBookingAction] failed:", error.message);
    return { ok: false, error: mapError(error.message) };
  }
  revalidateAmenityRoutes();
  return { ok: true, id: parsed.data.bookingId };
}
