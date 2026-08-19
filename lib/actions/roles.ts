"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";

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
  const parsed = updatePermissionsSchema.safeParse({
    organizationId,
    roleId,
    permissionIds,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(user.id);
  if (!org || org.id !== organizationId) return { ok: false, error: "unauthorized" };

  const adminClient = createAdminClient();

  // Verify role belongs to this organization
  const { data: role, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, is_system, key")
    .eq("id", roleId)
    .single();

  if (roleErr || !role) return { ok: false, error: "role_not_found" };

  // Don't allow clearing all permissions on TENANT_OWNER
  if (role.key === "TENANT_OWNER" && permissionIds.length === 0) {
    return { ok: false, error: "cannot_clear_owner_permissions" };
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

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(user.id);
  if (!org || org.id !== parsed.data.organizationId) return { ok: false, error: "unauthorized" };

  const adminClient = createAdminClient();

  // Create role
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

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true };
}
