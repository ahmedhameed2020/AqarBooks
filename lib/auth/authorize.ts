import "server-only";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";

export async function requirePlatformAdmin(locale: Locale) {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }
  const admin = user && (await isPlatformAdmin(user.id));
  if (!admin) {
    redirect({ href: "/dashboard", locale });
  }
  return user!;
}

export async function hasPermission(
  organizationId: string,
  permissionKey: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("has_permission", {
    p_user_id: user.id,
    p_organization_id: organizationId,
    p_permission_key: permissionKey,
  });
  if (error) return false;
  return Boolean(data);
}

/**
 * Proves tenant-scoped authorization for an action without relying on public.is_platform_admin() bypass.
 *
 * AUTHORIZATION MODEL:
 * - Temporary Legacy-Compatible Model:
 *   Tenant authorization accepts organization-owned cloned roles (roles.organization_id = organizationId)
 *   as well as legacy global tenant template roles (roles.organization_id IS NULL, e.g. seeded TENANT_ADMIN / TENANT_OWNER)
 *   ONLY when the user_role_assignments row is strictly scoped to the exact organizationId.
 *   PLATFORM_SUPER_ADMIN is explicitly and categorically banned from this path.
 *
 * - Future Normalization Path (post DB-01):
 *   Once all organizations have completed cloned tenant role backfilling, this will transition to the
 *   Preferred Final Model where ONLY roles with roles.organization_id = organizationId are permitted.
 *
 * Explicitly verifies:
 * 1. Caller is authenticated.
 * 2. Caller has an ACTIVE membership in the specific organization.
 * 3. Caller has a tenant-scoped role assignment (ura.organization_id = organizationId).
 * 4. Assigned role belongs to this org (or is a legacy global template, excluding PLATFORM_SUPER_ADMIN).
 * 5. Permission is granted to that role and matches the requested key.
 */
export async function proveTenantPermission(
  organizationId: string,
  permissionKey: string,
  callerUserId?: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  let userId = callerUserId;
  if (!userId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };
    userId = user.id;
  }

  const adminClient = (await import("@/lib/supabase/admin")).createAdminClient();

  // 1. Verify ACTIVE membership in exact organization
  const { data: membership, error: memErr } = await adminClient
    .from("organization_memberships")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr || !membership || membership.status !== "active") {
    return { ok: false, error: "unauthorized" };
  }

  // 2. Fetch tenant-scoped role assignments for caller in this organization
  const { data: assignments, error: assignErr } = await adminClient
    .from("user_role_assignments")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (assignErr || !assignments || assignments.length === 0) {
    return { ok: false, error: "forbidden" };
  }

  const roleIds = assignments.map((a) => a.role_id);

  // 3. Find roles belonging to this org (or org-scoped)
  const { data: roles, error: roleErr } = await adminClient
    .from("roles")
    .select("id, organization_id, is_system, key")
    .in("id", roleIds);

  if (roleErr || !roles || roles.length === 0) {
    return { ok: false, error: "forbidden" };
  }

  // Only consider roles valid for this organization:
  // Must belong to this org, or if system role, cannot be PLATFORM_SUPER_ADMIN
  const validOrgRoles = roles.filter(
    (r) => r.key !== "PLATFORM_SUPER_ADMIN" && (r.organization_id === organizationId || r.organization_id === null)
  );

  if (validOrgRoles.length === 0) {
    return { ok: false, error: "forbidden" };
  }

  const validRoleIds = validOrgRoles.map((r) => r.id);

  // 4. Verify permission is granted through that tenant-scoped role
  const { data: grants, error: grantErr } = await adminClient
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", validRoleIds);

  if (grantErr || !grants || grants.length === 0) {
    return { ok: false, error: "forbidden" };
  }

  const permissionIds = grants.map((g) => g.permission_id);

  const { data: permMatch, error: permErr } = await adminClient
    .from("permissions")
    .select("id")
    .in("id", permissionIds)
    .eq("key", permissionKey)
    .maybeSingle();

  if (permErr || !permMatch) {
    return { ok: false, error: "forbidden" };
  }

  return { ok: true, userId };
}
