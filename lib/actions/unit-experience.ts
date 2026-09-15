"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const vehicleYear = new Date().getFullYear() + 1;

const vehicleInputSchema = z.object({
  unitId: z.string().uuid(),
  plateNumber: z.string().trim().min(1).max(40),
  plateCountry: z.string().trim().min(1).max(3).transform((value) => value.toUpperCase()),
  plateRegion: z.string().trim().max(40).optional().nullable(),
  make: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  color: z.string().trim().max(60).optional().nullable(),
  year: z.number().int().min(1900).max(vehicleYear).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const staffVehicleInputSchema = vehicleInputSchema.omit({ unitId: true }).extend({
  vehicleId: z.string().uuid(),
  isActive: z.boolean(),
});

const vehicleIdSchema = z.object({
  vehicleId: z.string().uuid(),
});

const notificationIdSchema = z.object({
  notificationId: z.string().uuid(),
});

export type UnitExperienceActionResult =
  | { ok: true; vehicleId?: string; count?: number }
  | { ok: false; error: string };

function mapUnitExperienceError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("UNIT_EXPERIENCE_NOT_ENTITLED")) return "not_entitled";
  if (message.includes("UNIT_NOT_AUTHORIZED") || message.includes("VEHICLE_NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("UNIT_NOT_FOUND") || message.includes("VEHICLE_NOT_FOUND") || message.includes("NOTIFICATION_NOT_FOUND")) return "not_found";
  if (message.includes("DUPLICATE_VEHICLE_PLATE")) return "duplicate_plate";
  if (message.includes("INVALID_VEHICLE_PLATE")) return "invalid_plate";
  if (message.includes("INVALID_VEHICLE_COUNTRY")) return "invalid_country";
  if (message.includes("ORGANIZATION_INACTIVE")) return "organization_inactive";
  return "failed";
}

export async function createVehicleAction(
  input: z.input<typeof vehicleInputSchema>,
): Promise<UnitExperienceActionResult> {
  const parsed = vehicleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_vehicle", {
    p_unit_id: parsed.data.unitId,
    p_plate_number: parsed.data.plateNumber,
    p_plate_country: parsed.data.plateCountry,
    p_plate_region: parsed.data.plateRegion || null,
    p_make: parsed.data.make || null,
    p_model: parsed.data.model || null,
    p_color: parsed.data.color || null,
    p_year: parsed.data.year || null,
    p_notes: parsed.data.notes || null,
  });

  if (error || !data) {
    console.error("[createVehicleAction] failed:", error?.message);
    return { ok: false, error: mapUnitExperienceError(error?.message) };
  }

  revalidatePath("/[locale]/portal/vehicles", "page");
  revalidatePath("/[locale]/portal/notifications", "page");
  revalidatePath("/[locale]/operations/vehicles", "page");
  return { ok: true, vehicleId: data };
}

export async function updateVehicleStaffAction(
  input: z.input<typeof staffVehicleInputSchema>,
): Promise<UnitExperienceActionResult> {
  const parsed = staffVehicleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_vehicle_staff", {
    p_vehicle_id: parsed.data.vehicleId,
    p_plate_number: parsed.data.plateNumber,
    p_plate_country: parsed.data.plateCountry,
    p_plate_region: parsed.data.plateRegion || null,
    p_make: parsed.data.make || null,
    p_model: parsed.data.model || null,
    p_color: parsed.data.color || null,
    p_year: parsed.data.year || null,
    p_notes: parsed.data.notes || null,
    p_is_active: parsed.data.isActive,
  });

  if (error) {
    console.error("[updateVehicleStaffAction] failed:", error.message);
    return { ok: false, error: mapUnitExperienceError(error.message) };
  }

  revalidatePath("/[locale]/operations/vehicles", "page");
  revalidatePath("/[locale]/portal/vehicles", "page");
  revalidatePath("/[locale]/portal/notifications", "page");
  return { ok: true, vehicleId: parsed.data.vehicleId };
}

export async function deactivateOwnVehicleAction(
  input: z.input<typeof vehicleIdSchema>,
): Promise<UnitExperienceActionResult> {
  const parsed = vehicleIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_own_vehicle", {
    p_vehicle_id: parsed.data.vehicleId,
  });

  if (error) {
    console.error("[deactivateOwnVehicleAction] failed:", error.message);
    return { ok: false, error: mapUnitExperienceError(error.message) };
  }

  revalidatePath("/[locale]/portal/vehicles", "page");
  revalidatePath("/[locale]/portal/vehicles/[vehicleId]", "page");
  revalidatePath("/[locale]/portal/notifications", "page");
  revalidatePath("/[locale]/operations/vehicles", "page");
  return { ok: true, vehicleId: parsed.data.vehicleId };
}

export async function markNotificationReadAction(
  input: z.input<typeof notificationIdSchema>,
): Promise<UnitExperienceActionResult> {
  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: parsed.data.notificationId,
  });

  if (error) {
    console.error("[markNotificationReadAction] failed:", error.message);
    return { ok: false, error: mapUnitExperienceError(error.message) };
  }

  revalidatePath("/[locale]/portal/notifications", "page");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<UnitExperienceActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    console.error("[markAllNotificationsReadAction] failed:", error.message);
    return { ok: false, error: mapUnitExperienceError(error.message) };
  }

  revalidatePath("/[locale]/portal/notifications", "page");
  return { ok: true, count: data ?? 0 };
}
