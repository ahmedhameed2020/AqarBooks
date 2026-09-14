"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statusSchema = z.enum([
  "SUBMITTED",
  "TRIAGED",
  "IN_PROGRESS",
  "WAITING",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);
const visibilitySchema = z.enum(["STAFF_ONLY", "MEMBER_VISIBLE"]);

const createRequestSchema = z.object({
  unitId: z.string().uuid(),
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(4000),
  priority: prioritySchema.default("NORMAL"),
});

const cancelRequestSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

const staffUpdateSchema = z.object({
  requestId: z.string().uuid(),
  nextStatus: statusSchema.optional(),
  categoryId: z.string().uuid().optional(),
  priority: prioritySchema.optional(),
  note: z.string().trim().max(1000).optional(),
  visibility: visibilitySchema.default("STAFF_ONLY"),
});

export type MaintenanceActionResult =
  | { ok: true; requestId?: string }
  | { ok: false; error: string };

function mapMaintenanceError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("MAINTENANCE_NOT_ENTITLED")) return "not_entitled";
  if (message.includes("UNIT_NOT_AUTHORIZED") || message.includes("REQUEST_NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("INVALID_MAINTENANCE_TRANSITION")) return "invalid_transition";
  if (message.includes("CATEGORY_NOT_FOUND")) return "invalid_category";
  if (message.includes("REQUEST_NOT_FOUND")) return "not_found";
  if (message.includes("FORBIDDEN_MAINTENANCE_MANAGE")) return "forbidden";
  if (message.includes("NO_CHANGE")) return "no_change";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  return "failed";
}

export async function createMaintenanceRequestAction(
  input: z.input<typeof createRequestSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_maintenance_request", {
    p_unit_id: parsed.data.unitId,
    p_category_id: parsed.data.categoryId,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_priority: parsed.data.priority,
  });

  if (error || !data) {
    console.error("[createMaintenanceRequestAction] failed:", error?.message);
    return { ok: false, error: mapMaintenanceError(error?.message) };
  }

  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance", "page");
  return { ok: true, requestId: data };
}

export async function cancelOwnMaintenanceRequestAction(
  input: z.input<typeof cancelRequestSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = cancelRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_maintenance_request", {
    p_request_id: parsed.data.requestId,
    p_note: parsed.data.note || null,
  });

  if (error) {
    console.error("[cancelOwnMaintenanceRequestAction] failed:", error.message);
    return { ok: false, error: mapMaintenanceError(error.message) };
  }

  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  return { ok: true };
}

export async function updateMaintenanceRequestStaffAction(
  input: z.input<typeof staffUpdateSchema>,
): Promise<MaintenanceActionResult> {
  const parsed = staffUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_maintenance_request_staff", {
    p_request_id: parsed.data.requestId,
    p_next_status: parsed.data.nextStatus || null,
    p_category_id: parsed.data.categoryId || null,
    p_priority: parsed.data.priority || null,
    p_note: parsed.data.note || null,
    p_visibility: parsed.data.visibility,
  });

  if (error) {
    console.error("[updateMaintenanceRequestStaffAction] failed:", error.message);
    return { ok: false, error: mapMaintenanceError(error.message) };
  }

  revalidatePath("/[locale]/operations/maintenance", "page");
  revalidatePath("/[locale]/operations/maintenance/[requestId]", "page");
  revalidatePath("/[locale]/portal/maintenance", "page");
  revalidatePath("/[locale]/portal/maintenance/[requestId]", "page");
  return { ok: true };
}
