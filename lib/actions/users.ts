"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";
import { getCurrentUser } from "@/lib/auth/session";
import { proveTenantPermission, getCallerTenantPermissions } from "@/lib/auth/authorize";
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

// Helper: Check if target user is the last active TENANT_OWNER
async function isLastTenantOwner(
  adminClient: ReturnType<typeof createAdminClient>,
  organizationId: string,
  targetUserId: string,
): Promise<boolean> {
  // Find TENANT_OWNER role(s) valid for this organization
  const { data: ownerRoles } = await adminClient
    .from("roles")
    .select("id")
    .eq("key", "TENANT_OWNER")
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (!ownerRoles || ownerRoles.length === 0) return false;
  const ownerRoleIds = ownerRoles.map((r) => r.id);

  // Check if target user has active TENANT_OWNER assignment in this organization
  const { data: targetAssignment } = await adminClient
    .from("user_role_assignments")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .in("role_id", ownerRoleIds)
    .maybeSingle();

  if (!targetAssignment) {
    return false; // Target is not a tenant owner
  }

  // Find all user IDs assigned to TENANT_OWNER in this organization
  const { data: allOwnerAssignments } = await adminClient
    .from("user_role_assignments")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role_id", ownerRoleIds);

  if (!allOwnerAssignments || allOwnerAssignments.length === 0) return false;

  const otherUserIds = Array.from(
    new Set(allOwnerAssignments.map((a) => a.user_id).filter((uid) => uid !== targetUserId))
  );

  if (otherUserIds.length === 0) {
    return true; // No other users assigned this role
  }

  // Count OTHER active members among those users
  const { data: activeOtherOwners } = await adminClient
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("user_id", otherUserIds);

  return !activeOtherOwners || activeOtherOwners.length === 0;
}

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
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

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

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    parsed.data.organizationId,
    "tenant.users.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  // Attack D / Self-Escalation Guard: Caller cannot invite their own email
  if (currentUser.email && parsed.data.email.toLowerCase() === currentUser.email.toLowerCase()) {
    return { ok: false, error: "cannot_invite_self" };
  }

  // Privilege Ceiling Guard: Fetch caller's effective permissions and owner status
  const callerPermsResult = await getCallerTenantPermissions(
    parsed.data.organizationId,
    currentUser.id,
  );
  if (!callerPermsResult.ok) return { ok: false, error: callerPermsResult.error };

  // Attack C: Only an active TENANT_OWNER can invite another TENANT_OWNER
  if (parsed.data.roleKey === "TENANT_OWNER" && !callerPermsResult.isOwner) {
    return { ok: false, error: "cannot_assign_tenant_owner" };
  }

  const adminClient = createAdminClient();

  // Find role strictly for this organization (disallow platform super admin)
  if (parsed.data.roleKey === "PLATFORM_SUPER_ADMIN") {
    return { ok: false, error: "role_not_found" };
  }

  const { data: roleData, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, is_system")
    .or(`organization_id.eq.${parsed.data.organizationId},organization_id.is.null`)
    .eq("key", parsed.data.roleKey)
    .order("organization_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (roleErr || !roleData) {
    return { ok: false, error: "role_not_found" };
  }

  // Privilege Ceiling Guard: Non-owner cannot assign a role with permissions they do not possess
  if (!callerPermsResult.isOwner) {
    const { data: targetRoleGrants } = await adminClient
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", roleData.id);

    if (targetRoleGrants && targetRoleGrants.length > 0) {
      const grantIds = targetRoleGrants.map((g) => g.permission_id);
      const { data: targetPerms } = await adminClient
        .from("permissions")
        .select("key")
        .in("id", grantIds);

      if (targetPerms) {
        const hasUnheldPerm = targetPerms.some((p) => !callerPermsResult.permissions.has(p.key));
        if (hasUnheldPerm) {
          return { ok: false, error: "role_privilege_escalation" };
        }
      }
    }
  }

  let invitedUserId: string | null = null;
  let isNewUserCreated = false;

  // Invite or find existing auth user
  const { data: invited, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(parsed.data.email);

  if (inviteError || !invited.user) {
    // If user already exists in auth, find user by email
    const { data: listData } = await adminClient.auth.admin.listUsers();
    const existingUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase()
    );

    if (existingUser) {
      invitedUserId = existingUser.id;
      isNewUserCreated = false;
    } else {
      // Do NOT use createUser(email_confirm: true) fallback. Fail with clear error.
      return { ok: false, error: inviteError?.message || "invite_failed" };
    }
  } else {
    invitedUserId = invited.user.id;
    isNewUserCreated = true;
  }

  // Guard: Do not downgrade or wipe existing members through invite
  const { data: existingMembership } = await adminClient
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", invitedUserId)
    .maybeSingle();

  if (existingMembership) {
    return { ok: false, error: "user_already_member" };
  }

  try {
    // Upsert membership
    const { error: memErr } = await adminClient
      .from("organization_memberships")
      .upsert({
        organization_id: parsed.data.organizationId,
        user_id: invitedUserId,
        status: "invited",
      });

    if (memErr) throw new Error(memErr.message);

    // Assign role
    await adminClient
      .from("user_role_assignments")
      .delete()
      .eq("organization_id", parsed.data.organizationId)
      .eq("user_id", invitedUserId);

    const { error: assignErr } = await adminClient
      .from("user_role_assignments")
      .insert({
        organization_id: parsed.data.organizationId,
        user_id: invitedUserId,
        role_id: roleData.id,
        created_by: currentUser.id,
      });

    if (assignErr) throw new Error(assignErr.message);

    // Update profile full name if provided
    if (parsed.data.fullName) {
      await adminClient
        .from("profiles")
        .upsert({
          id: invitedUserId,
          full_name: parsed.data.fullName,
        });
    }

    // Write audit trail
    await logAuditTrail(adminClient, {
      actor_id: currentUser.id,
      organization_id: parsed.data.organizationId,
      action: "user.invited",
      entity_type: "user",
      entity_id: invitedUserId,
      safe_change_summary: {
        email: parsed.data.email,
        roleKey: parsed.data.roleKey,
        roleId: roleData.id,
        fullName: parsed.data.fullName,
      },
    });

    revalidatePath("/[locale]/admin/users", "page");
    return { ok: true };
  } catch (err: unknown) {
    // Compensation: If DB write fails and we created a brand-new auth user, remove it
    if (isNewUserCreated && invitedUserId) {
      try {
        await adminClient.auth.admin.deleteUser(invitedUserId);
      } catch (cleanupErr) {
        console.error("[SEC-05] Failed to compensate user creation:", cleanupErr);
      }
    }
    const message = err instanceof Error ? err.message : "invite_failed";
    return { ok: false, error: message };
  }
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
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = changeRoleSchema.safeParse({ organizationId, userId, newRoleId });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    organizationId,
    "tenant.users.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  // Defense-in-depth: Prevent self-role escalation or self-demotion
  if (currentUser.id === userId) {
    return { ok: false, error: "cannot_change_own_role" };
  }

  const adminClient = createAdminClient();

  // Verify target user belongs to the exact organization
  const { data: targetMembership, error: targetMemErr } = await adminClient
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetMemErr || !targetMembership) {
    return { ok: false, error: "target_not_member" };
  }

  // Verify new role exists and belongs to this org or is a valid tenant template
  const { data: role, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, key")
    .eq("id", newRoleId)
    .single();

  if (roleErr || !role) return { ok: false, error: "role_not_found" };

  // Reject assigning platform super admin or foreign org role
  if (role.key === "PLATFORM_SUPER_ADMIN") {
    return { ok: false, error: "invalid_role_assignment" };
  }
  if (role.organization_id !== null && role.organization_id !== organizationId) {
    return { ok: false, error: "role_organization_mismatch" };
  }

  // Privilege Ceiling Guard: Fetch caller's effective permissions and owner status
  const callerPermsResult = await getCallerTenantPermissions(organizationId, currentUser.id);
  if (!callerPermsResult.ok) return { ok: false, error: callerPermsResult.error };

  // Attack E: Only an active TENANT_OWNER can assign or change a user to TENANT_OWNER
  if (role.key === "TENANT_OWNER" && !callerPermsResult.isOwner) {
    return { ok: false, error: "cannot_assign_tenant_owner" };
  }

  // Privilege Ceiling Guard: Non-owner cannot assign a role with permissions they do not possess
  if (!callerPermsResult.isOwner) {
    const { data: targetRoleGrants } = await adminClient
      .from("role_permissions")
      .select("permission_id")
      .eq("role_id", role.id);

    if (targetRoleGrants && targetRoleGrants.length > 0) {
      const grantIds = targetRoleGrants.map((g) => g.permission_id);
      const { data: targetPerms } = await adminClient
        .from("permissions")
        .select("key")
        .in("id", grantIds);

      if (targetPerms) {
        const hasUnheldPerm = targetPerms.some((p) => !callerPermsResult.permissions.has(p.key));
        if (hasUnheldPerm) {
          return { ok: false, error: "role_privilege_escalation" };
        }
      }
    }
  }

  // Prevent demoting the last active TENANT_OWNER
  if (role.key !== "TENANT_OWNER") {
    const isLast = await isLastTenantOwner(adminClient, organizationId, userId);
    if (isLast) {
      return { ok: false, error: "cannot_demote_last_tenant_owner" };
    }
  }

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

  // Write audit trail
  await logAuditTrail(adminClient, {
    actor_id: currentUser.id,
    organization_id: organizationId,
    action: "user.role_changed",
    entity_type: "user",
    entity_id: userId,
    safe_change_summary: {
      newRoleId,
      roleKey: role.key,
    },
  });

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

const updateStatusSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["active", "invited", "suspended"]),
});

export async function updateUserStatusAction(
  organizationId: string,
  userId: string,
  status: "active" | "invited" | "suspended",
): Promise<ActionResult> {
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = updateStatusSchema.safeParse({ organizationId, userId, status });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    organizationId,
    "tenant.users.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  if (currentUser.id === userId && status !== "active") {
    return { ok: false, error: "cannot_suspend_self" };
  }

  const adminClient = createAdminClient();

  // Verify target user belongs to the exact organization
  const { data: targetMembership, error: targetMemErr } = await adminClient
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetMemErr || !targetMembership) {
    return { ok: false, error: "target_not_member" };
  }

  // Prevent suspending the last active TENANT_OWNER
  if (status !== "active") {
    const isLast = await isLastTenantOwner(adminClient, organizationId, userId);
    if (isLast) {
      return { ok: false, error: "cannot_suspend_last_tenant_owner" };
    }
  }

  const { error } = await adminClient
    .from("organization_memberships")
    .update({ status })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  // Write audit trail
  await logAuditTrail(adminClient, {
    actor_id: currentUser.id,
    organization_id: organizationId,
    action: "user.status_updated",
    entity_type: "user",
    entity_id: userId,
    safe_change_summary: { status },
  });

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}

export async function removeUserAction(
  organizationId: string,
  userId: string,
): Promise<ActionResult> {
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const currentUser = await getCurrentUser();
  if (!currentUser) return { ok: false, error: "unauthorized" };

  // Explicit application-layer tenant authorization proof
  const authProof = await proveTenantPermission(
    organizationId,
    "tenant.users.manage",
    currentUser.id,
  );
  if (!authProof.ok) return { ok: false, error: authProof.error };

  if (currentUser.id === userId) {
    return { ok: false, error: "cannot_remove_self" };
  }

  const adminClient = createAdminClient();

  // Verify target user belongs to the exact organization
  const { data: targetMembership, error: targetMemErr } = await adminClient
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetMemErr || !targetMembership) {
    return { ok: false, error: "target_not_member" };
  }

  // Prevent removing the last active TENANT_OWNER
  const isLast = await isLastTenantOwner(adminClient, organizationId, userId);
  if (isLast) {
    return { ok: false, error: "cannot_remove_last_tenant_owner" };
  }

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

  // Write audit trail
  await logAuditTrail(adminClient, {
    actor_id: currentUser.id,
    organization_id: organizationId,
    action: "user.removed",
    entity_type: "user",
    entity_id: userId,
    safe_change_summary: { removed_at: new Date().toISOString() },
  });

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}
