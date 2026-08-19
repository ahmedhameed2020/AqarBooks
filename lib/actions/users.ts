"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";

const inviteUserSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  roleKey: z.string().min(1),
  fullName: z.string().max(150).optional().nullable(),
});

export async function inviteUserAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const fullNameRaw = formData.get("fullName");
  const parsed = inviteUserSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    roleKey: formData.get("roleKey"),
    fullName: fullNameRaw ? String(fullNameRaw).trim() : null,
  });

  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(currentUser.id);
  if (!org || org.id !== parsed.data.organizationId) return { ok: false, error: "unauthorized" };

  const adminClient = createAdminClient();

  // 1. Invite or find auth user
  const { data: invited, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(parsed.data.email);

  if (inviteError || !invited.user) {
    // If user already exists in auth, find by email
    const { data: listData } = await adminClient.auth.admin.listUsers();
    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase()
    );

    if (!existingUser) {
      return { ok: false, error: inviteError?.message ?? "invite_failed" };
    }

    // Add existing user to organization
    const { error: memErr } = await adminClient.rpc("add_organization_member", {
      p_organization_id: parsed.data.organizationId,
      p_user_id: existingUser.id,
      p_role_key: parsed.data.roleKey,
    });

    if (memErr) return { ok: false, error: memErr.message };

    // Update profile full_name if provided and currently empty
    if (parsed.data.fullName) {
      await adminClient
        .from("profiles")
        .update({ full_name: parsed.data.fullName })
        .eq("id", existingUser.id);
    }
  } else {
    // New user created via invite
    const { error: memErr } = await adminClient.rpc("add_organization_member", {
      p_organization_id: parsed.data.organizationId,
      p_user_id: invited.user.id,
      p_role_key: parsed.data.roleKey,
    });

    if (memErr) return { ok: false, error: memErr.message };

    if (parsed.data.fullName) {
      await adminClient
        .from("profiles")
        .update({ full_name: parsed.data.fullName })
        .eq("id", invited.user.id);
    }
  }

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

const changeRoleSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  newRoleId: z.string().uuid(),
});

export async function changeUserRoleAction(
  organizationId: string,
  userId: string,
  newRoleId: string,
): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse({ organizationId, userId, newRoleId });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(currentUser.id);
  if (!org || org.id !== organizationId) return { ok: false, error: "unauthorized" };

  const adminClient = createAdminClient();

  // Verify new role exists and belongs to this org or is system role
  const { data: role, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, key")
    .eq("id", newRoleId)
    .single();

  if (roleErr || !role) return { ok: false, error: "role_not_found" };

  // Delete current organization role assignments for this user
  await adminClient
    .from("user_role_assignments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  // Insert new role assignment
  const { error: insErr } = await adminClient
    .from("user_role_assignments")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role_id: newRoleId,
      created_by: currentUser.id,
    });

  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

const updateStatusSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["active", "invited", "suspended", "inactive"]),
});

export async function updateUserStatusAction(
  organizationId: string,
  userId: string,
  status: "active" | "invited" | "suspended" | "inactive",
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse({ organizationId, userId, status });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(currentUser.id);
  if (!org || org.id !== organizationId) return { ok: false, error: "unauthorized" };

  if (currentUser.id === userId && status !== "active") {
    return { ok: false, error: "cannot_suspend_self" };
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("organization_memberships")
    .update({ status })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

export async function removeUserAction(
  organizationId: string,
  userId: string,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  const org = await getPrimaryOrganization(currentUser.id);
  if (!org || org.id !== organizationId) return { ok: false, error: "unauthorized" };

  if (currentUser.id === userId) {
    return { ok: false, error: "cannot_remove_self" };
  }

  const adminClient = createAdminClient();

  // Delete role assignments
  await adminClient
    .from("user_role_assignments")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  // Delete membership
  const { error } = await adminClient
    .from("organization_memberships")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}
