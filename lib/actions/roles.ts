"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { getCurrentUser } from "@/lib/auth/session";
import { proveTenantPermission } from "@/lib/auth/authorize";
import { denyIfDemo } from "@/lib/demo/guard";

// Helper: Safely insert platform audit logs without breaking tenant operations
// OBS-02: PARTIALLY REMEDIATED -- atomicity pending DB-01
async function logAuditTrail(
  adminClient: ReturnType<typeof createAdminClient>,
  payload: {
    actor_id: string;
    organization_id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    safe_change_summary: Record<string, unknown>;
  },
) {
  try {
    const { error: auditErr } = await adminClient.from("platform_audit_logs").insert({
      actor_id: payload.actor_id,
      organization_id: payload.organization_id,
      action: payload.action,
      entity_type: payload.entity_type,
      entity_id: payload.entity_id,
      safe_change_summary: payload.safe_change_summary,
    });
    if (auditErr) {
      console.error("[OBS-02] platform_audit_logs insert returned error:", auditErr.message);
    }
  } catch (err) {
    console.error("[OBS-02] Failed to write platform_audit_logs:", err);
  }
}

// Helper: Validate that all requested permission IDs are valid tenant permissions
// Uses canonical tenant template permission keys from public.role_template_permissions
async function validateTenantPermissionIds(
  adminClient: ReturnType<typeof createAdminClient>,
  permissionIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (permissionIds.length === 0) return { ok: true };

  // 1. Resolve requested permission IDs into keys
  const { data: perms, error: permErr } = await adminClient
    .from("permissions")
    .select("id, key")
    .in("id", permissionIds);

  if (permErr || !perms || perms.length !== permissionIds.length) {
    return { ok: false, error: "invalid_permission_scope" };
  }

  // 2. Reject any platform permission
  const hasPlatformPerm = perms.some((p) => p.key.startsWith("platform."));
  if (hasPlatformPerm) {
    return { ok: false, error: "invalid_permission_scope" };
  }

  // 3. Verify each permission key is present in tenant role templates (union of all tenant templates)
  const requestedKeys = perms.map((p) => p.key);
  const { data: templatePerms, error: templateErr } = await adminClient
    .from("role_template_permissions")
    .select("permission_key")
    .in("permission_key", requestedKeys);

  if (templateErr || !templatePerms) {
    return { ok: false, error: "invalid_permission_scope" };
  }

  const allowedKeySet = new Set(templatePerms.map((tp) => tp.permission_key));
  const allAllowed = requestedKeys.every((k) => allowedKeySet.has(k));

  if (!allAllowed) {
    return { ok: false, error: "invalid_permission_scope" };
  }

  return { ok: true };
}

const updatePermissionsSchema = z.object({
  organizationId: z.string().uuid(),
  roleId: z.string().uuid(),
  permissionIds: z.array(z.string().uuid()),
});

export async function updateRolePermissionsAction(
  organizationId: string,
  roleId: string,
  permissionIds: string[],
): Promise<ActionResult> {
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = updatePermissionsSchema.safeParse({
    organizationId,
    roleId,
    permissionIds,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    organizationId,
    "tenant.roles.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  const adminClient = createAdminClient();

  // Verify target role belongs to this organization and is not a system role
  const { data: role, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, is_system, key")
    .eq("id", roleId)
    .single();

  if (roleErr || !role) return { ok: false, error: "role_not_found" };

  if (role.is_system || role.organization_id !== organizationId) {
    return { ok: false, error: "cannot_modify_system_role" };
  }

  // Protect TENANT_OWNER permissions from being cleared
  if (role.key === "TENANT_OWNER" && permissionIds.length === 0) {
    return { ok: false, error: "cannot_clear_owner_permissions" };
  }

  // Validate permission scope: reject platform.% or non-tenant permissions
  const scopeCheck = await validateTenantPermissionIds(adminClient, permissionIds);
  if (!scopeCheck.ok) {
    return { ok: false, error: scopeCheck.error };
  }

  // Delete existing grants
  const { error: delErr } = await adminClient
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);

  if (delErr) return { ok: false, error: delErr.message };

  // Insert new grants if any
  if (permissionIds.length > 0) {
    const rows = permissionIds.map((pId) => ({
      role_id: roleId,
      permission_id: pId,
    }));

    const { error: insErr } = await adminClient
      .from("role_permissions")
      .insert(rows);

    if (insErr) return { ok: false, error: insErr.message };
  }

  // Write audit trail
  await logAuditTrail(adminClient, {
    actor_id: currentUser.id,
    organization_id: organizationId,
    action: "role.permissions_updated",
    entity_type: "role",
    entity_id: roleId,
    safe_change_summary: {
      roleKey: role.key,
      permissionCount: permissionIds.length,
    },
  });

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true };
}

const createRoleSchema = z.object({
  organizationId: z.string().uuid(),
  key: z.string().min(2).max(50).regex(/^[A-Z0-9_]+$/, "Key must be uppercase alphanumeric with underscores"),
  nameAr: z.string().min(2).max(100),
  nameEn: z.string().min(2).max(100),
  permissionIds: z.array(z.string().uuid()).default([]),
});

export async function createRoleAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const permIdsRaw = formData.get("permissionIds");
  let permissionIds: string[] = [];
  try {
    if (typeof permIdsRaw === "string") {
      permissionIds = JSON.parse(permIdsRaw);
    }
  } catch {
    permissionIds = [];
  }

  const parsed = createRoleSchema.safeParse({
    organizationId: formData.get("organizationId"),
    key: formData.get("key"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    permissionIds,
  });

  if (!parsed.success) return { ok: false, error: "invalid_input" };

  // Explicitly reject reserved PLATFORM_SUPER_ADMIN key
  if (parsed.data.key === "PLATFORM_SUPER_ADMIN") {
    return { ok: false, error: "reserved_role_key" };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    parsed.data.organizationId,
    "tenant.roles.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  const adminClient = createAdminClient();

  // Validate permission scope: reject platform.% or non-tenant permissions
  const scopeCheck = await validateTenantPermissionIds(adminClient, parsed.data.permissionIds);
  if (!scopeCheck.ok) {
    return { ok: false, error: scopeCheck.error };
  }

  // Create role strictly scoped to this organization, is_system = false
  const { data: newRole, error: roleErr } = await adminClient
    .from("roles")
    .insert({
      organization_id: parsed.data.organizationId,
      key: parsed.data.key,
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      is_system: false,
    })
    .select("id")
    .single();

  if (roleErr || !newRole) {
    if (roleErr?.code === "23505") {
      return { ok: false, error: "role_key_already_exists" };
    }
    return { ok: false, error: roleErr?.message || "failed_to_create_role" };
  }

  // Grant permissions
  if (parsed.data.permissionIds.length > 0) {
    const rows = parsed.data.permissionIds.map((pId) => ({
      role_id: newRole.id,
      permission_id: pId,
    }));

    await adminClient.from("role_permissions").insert(rows);
  }

  // Write audit trail
  await logAuditTrail(adminClient, {
    actor_id: currentUser.id,
    organization_id: parsed.data.organizationId,
    action: "role.created",
    entity_type: "role",
    entity_id: newRole.id,
    safe_change_summary: {
      key: parsed.data.key,
      nameEn: parsed.data.nameEn,
      permissionCount: parsed.data.permissionIds.length,
    },
  });

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true };
}
