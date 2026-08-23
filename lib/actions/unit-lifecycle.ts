"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

// The unit counterpart of member-lifecycle.ts, and it exists for the same
// reason: units could be created but never retired or removed.
//
// The foreign keys pointing at public.units split the same way:
//
//   NO ACTION  dues, payments            -> the delete is refused outright
//   CASCADE    installment_plans, unit_leases, unit_ownerships,
//              unit_handovers, service_charge_allocations
//   SET NULL   commissions               -> the commission loses its unit
//
// The CASCADE list here is heavier than the member one: purchase plans and
// lease contracts are agreements with people, not metadata. So a unit that
// carries any of them is never deletable, only archivable -- nothing in this
// set is "harmless" the way a phone number was.

export interface UnitDependencies {
  /** Rows the database itself refuses to orphan. */
  blocking: { dues: number; payments: number };
  /** Rows a delete would take with it, all of them worth keeping. */
  destructive: {
    ownerships: number;
    leases: number;
    installmentPlans: number;
    handovers: number;
    serviceCharges: number;
  };
  /** Commission rows that would survive but lose their unit reference. */
  detaching: { commissions: number };
  safeToDelete: boolean;
  isArchived: boolean;
  code: string;
}

export type UnitDependenciesResult =
  | { ok: true; dependencies: UnitDependencies }
  | { ok: false; error: string };

export type UnitLifecycleResult = { ok: true } | { ok: false; error: string };

async function authorize(unitId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "unauthenticated" };

  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("units")
    .select("id, organization_id, code, archived_at")
    .eq("id", unitId)
    .maybeSingle();

  if (!unit) return { ok: false as const, error: "not_found" };

  const { data: permitted } = await supabase.rpc("has_permission", {
    p_user_id: user.id,
    p_organization_id: unit.organization_id,
    p_permission_key: "property.units.manage",
  });
  if (!permitted) return { ok: false as const, error: "forbidden" };

  return { ok: true as const, user, supabase, unit };
}

type CountableTable =
  | "dues"
  | "payments"
  | "unit_ownerships"
  | "unit_leases"
  | "installment_plans"
  | "unit_handovers"
  | "service_charge_allocations"
  | "commissions";

async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: CountableTable,
  unitId: string,
): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unitId);
  if (error) {
    // A failed count is not a zero count. Returning -1 keeps it out of
    // "safe to delete" rather than quietly clearing the way.
    console.error(`[unit-lifecycle] count failed on ${table}:`, error.message);
    return -1;
  }
  return count ?? 0;
}

export async function getUnitDependenciesAction(unitId: string): Promise<UnitDependenciesResult> {
  if (!z.string().uuid().safeParse(unitId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const [dues, payments, ownerships, leases, installmentPlans, handovers, serviceCharges, commissions] =
    await Promise.all([
      countRows(admin, "dues", unitId),
      countRows(admin, "payments", unitId),
      countRows(admin, "unit_ownerships", unitId),
      countRows(admin, "unit_leases", unitId),
      countRows(admin, "installment_plans", unitId),
      countRows(admin, "unit_handovers", unitId),
      countRows(admin, "service_charge_allocations", unitId),
      countRows(admin, "commissions", unitId),
    ]);

  const gating = [
    dues, payments, ownerships, leases, installmentPlans, handovers, serviceCharges, commissions,
  ];

  return {
    ok: true,
    dependencies: {
      blocking: { dues, payments },
      destructive: { ownerships, leases, installmentPlans, handovers, serviceCharges },
      detaching: { commissions },
      safeToDelete: gating.every((n) => n === 0),
      isArchived: auth.unit.archived_at !== null,
      code: auth.unit.code,
    },
  };
}

const archiveSchema = z.object({
  unitId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

// Error codes raised by archive_unit / restore_unit / update_unit. Postgres
// returns them as "<CODE>: <arabic message>", so the prefix is what we match.
const RPC_ERRORS: Record<string, string> = {
  FORBIDDEN: "forbidden",
  UNIT_NOT_FOUND: "not_found",
  UNIT_HAS_ACTIVE_OWNERSHIP: "has_active_ownership",
  UNIT_HAS_OPEN_DUES: "has_open_dues",
  ORGANIZATION_INACTIVE: "organization_inactive",
  INVALID_BUILDING: "invalid_building",
  INVALID_ZONE: "invalid_zone",
  DUPLICATE_CODE: "duplicate_code",
};

function mapRpcError(message: string): string {
  const code = Object.keys(RPC_ERRORS).find((c) => message.startsWith(c));
  return code ? RPC_ERRORS[code] : "failed";
}

/**
 * Archiving goes through the archive_unit RPC rather than updating the table.
 *
 * That function has existed in production the whole time and does three things
 * a direct UPDATE does not: it refuses to archive a unit that still has an
 * active ownership, refuses one that still has open dues, and sets is_active
 * alongside archived_at so the rest of the system agrees the unit is retired.
 * It also records the reason in platform_audit_logs.reason, which is why units
 * need no archive_reason column of their own.
 */
export async function archiveUnitAction(input: {
  unitId: string;
  reason: string;
}): Promise<UnitLifecycleResult> {
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "reason_required" };

  const auth = await authorize(parsed.data.unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase.rpc("archive_unit", {
    p_organization_id: auth.unit.organization_id,
    p_unit_id: parsed.data.unitId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[archiveUnitAction] archive_unit failed:", error.message);
    return { ok: false, error: mapRpcError(error.message) };
  }

  revalidatePath("/[locale]/property", "page");
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

export async function restoreUnitAction(unitId: string): Promise<UnitLifecycleResult> {
  if (!z.string().uuid().safeParse(unitId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase.rpc("restore_unit", {
    p_organization_id: auth.unit.organization_id,
    p_unit_id: unitId,
  });

  if (error) {
    console.error("[restoreUnitAction] restore_unit failed:", error.message);
    return { ok: false, error: mapRpcError(error.message) };
  }

  revalidatePath("/[locale]/property", "page");
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const updateSchema = z.object({
  unitId: z.string().uuid(),
  code: z.string().trim().min(1).max(50),
  unitType: z.enum(["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"]),
  customTypeLabel: z.string().trim().max(80).nullable(),
  buildingId: z.string().uuid().nullable(),
  zoneId: z.string().uuid().nullable(),
  floorNumber: z.number().int().min(-10).max(200).nullable(),
  area: z.number().positive().max(1_000_000).nullable(),
});

export type UpdateUnitInput = z.input<typeof updateSchema>;

/**
 * Editing a unit was never wired to any screen, yet update_unit has been in the
 * database all along -- with the permission check, the org-active check, the
 * validation that the chosen building and zone belong to this unit's own
 * property, duplicate-code handling and its own audit entry.
 *
 * property_id is deliberately not a parameter of that function: a unit does not
 * move between properties from an edit form, only between buildings and zones
 * inside its own. That constraint is honoured here rather than worked around.
 */
export async function updateUnitAction(input: UpdateUnitInput): Promise<UnitLifecycleResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const data = parsed.data;

  const auth = await authorize(data.unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.supabase.rpc("update_unit", {
    p_organization_id: auth.unit.organization_id,
    p_unit_id: data.unitId,
    p_code: data.code,
    p_unit_type: data.unitType,
    // The function itself clears this unless the type is OTHER; passing it
    // unconditionally keeps that decision in one place.
    p_custom_type_label: data.customTypeLabel,
    p_building_id: data.buildingId,
    p_zone_id: data.zoneId,
    p_floor_number: data.floorNumber,
    p_area: data.area,
  });

  if (error) {
    console.error("[updateUnitAction] update_unit failed:", error.message);
    return { ok: false, error: mapRpcError(error.message) };
  }

  revalidatePath("/[locale]/property", "page");
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

export interface UnitEditContext {
  code: string;
  unitType: string;
  customTypeLabel: string | null;
  buildingId: string | null;
  zoneId: string | null;
  floorNumber: number | null;
  area: number | null;
  /** Buildings and zones of this unit's own property -- the only valid choices. */
  buildings: { id: string; name: string }[];
  zones: { id: string; name: string }[];
}

export type UnitEditContextResult =
  | { ok: true; context: UnitEditContext }
  | { ok: false; error: string };

/** Everything the edit dialog needs, scoped to the unit's own property. */
export async function getUnitEditContextAction(
  unitId: string,
  locale: string,
): Promise<UnitEditContextResult> {
  if (!z.string().uuid().safeParse(unitId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const isAr = locale === "ar";
  const supabase = auth.supabase;

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("code, unit_type, custom_type_label, building_id, zone_id, floor_number, area, property_id")
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unit) return { ok: false, error: "not_found" };

  const [{ data: buildings }, { data: zones }] = await Promise.all([
    supabase
      .from("buildings")
      .select("id, name_ar, name_en")
      .eq("property_id", unit.property_id)
      .order("name_ar"),
    supabase
      .from("zones")
      .select("id, name_ar, name_en")
      .eq("property_id", unit.property_id)
      .order("name_ar"),
  ]);

  return {
    ok: true,
    context: {
      code: unit.code,
      unitType: unit.unit_type,
      customTypeLabel: unit.custom_type_label,
      buildingId: unit.building_id,
      zoneId: unit.zone_id,
      floorNumber: unit.floor_number,
      area: unit.area === null ? null : Number(unit.area),
      buildings: (buildings ?? []).map((b) => ({
        id: b.id,
        name: (isAr ? b.name_ar : b.name_en) || b.name_ar || b.name_en || "—",
      })),
      zones: (zones ?? []).map((z) => ({
        id: z.id,
        name: (isAr ? z.name_ar : z.name_en) || z.name_ar || z.name_en || "—",
      })),
    },
  };
}

/** Permanent removal, allowed only for a unit that nothing references. */
export async function deleteUnitAction(unitId: string): Promise<UnitLifecycleResult> {
  if (!z.string().uuid().safeParse(unitId).success) return { ok: false, error: "invalid_input" };

  const auth = await authorize(unitId);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Re-checked server-side; the dialog's copy is a courtesy, this is the gate.
  const deps = await getUnitDependenciesAction(unitId);
  if (!deps.ok) return { ok: false, error: deps.error };
  if (!deps.dependencies.safeToDelete) return { ok: false, error: "has_dependencies" };

  const { error } = await auth.supabase.from("units").delete().eq("id", unitId);
  if (error) {
    console.error("[deleteUnitAction] failed:", error.message);
    return { ok: false, error: error.message };
  }

  await auth.supabase.from("platform_audit_logs").insert({
    actor_id: auth.user.id,
    organization_id: auth.unit.organization_id,
    action: "unit.deleted",
    entity_type: "unit",
    entity_id: unitId,
    safe_change_summary: { code: auth.unit.code },
  });

  revalidatePath("/[locale]/property", "page");
  return { ok: true };
}
