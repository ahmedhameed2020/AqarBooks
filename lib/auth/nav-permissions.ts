import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SidebarWorkspace } from "@/components/app-sidebar";

// Navigation was built unconditionally: all 53 destinations, for everyone.
// Someone whose role only covers property saw thirty-odd finance links that
// would bounce them the moment they clicked, and the menu itself disclosed
// which modules exist and at exactly which routes.
//
// Filtering happens on the server, before the tree reaches the browser, so a
// hidden branch is genuinely absent rather than merely not rendered.
//
// One resolution per DISTINCT key, not per link. The tree names far fewer
// permissions than it has entries, and has_permission is a round trip each
// time.

export type PermissionKey = string;

/**
 * Resolves every permission the navigation asks about, in parallel, once.
 * Returns a predicate the tree builder can call freely.
 */
export async function buildPermissionChecker(
  organizationId: string,
  keys: PermissionKey[],
  userId?: string,
): Promise<(key?: PermissionKey) => boolean> {
  const distinct = [...new Set(keys)];
  if (distinct.length === 0) return () => true;

  const supabase = await createClient();
  let resolvedUserId = userId;

  // App-shell callers already resolved the authenticated user. Reusing that
  // identity avoids a second remote auth.getUser() on every navigation while
  // preserving the safe fallback for standalone callers.
  if (!resolvedUserId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    resolvedUserId = user?.id;
  }

  if (!resolvedUserId) return () => false;

  // Resolve the complete grant set with ordinary RLS-protected reads instead
  // of one has_permission RPC per navigation key. This turns dozens of network
  // round trips into a small, fixed query set. Platform admins retain the same
  // bypass semantics as has_permission().
  const [{ data: platformAdmin }, { data: assignments, error: assignmentError }] =
    await Promise.all([
      supabase.rpc("is_platform_admin", { p_user_id: resolvedUserId }),
      supabase
        .from("user_role_assignments")
        .select("role_id")
        .eq("user_id", resolvedUserId)
        .eq("organization_id", organizationId),
    ]);

  if (platformAdmin) return () => true;
  if (assignmentError || !assignments?.length) return (key?: PermissionKey) => !key;

  const roleIds = [...new Set(assignments.map((row) => row.role_id))];
  const { data: grants, error: grantError } = await supabase
    .from("role_permissions")
    .select("permissions!inner(key)")
    .in("role_id", roleIds);

  if (grantError) return (key?: PermissionKey) => !key;

  const granted = new Set<string>();
  for (const row of grants ?? []) {
    const permission = Array.isArray(row.permissions)
      ? row.permissions[0]
      : row.permissions;
    const key = permission?.key;
    if (key && distinct.includes(key)) granted.add(key);
  }

  // An item with no key is unrestricted on purpose -- the dashboard, the
  // user's own profile. Absence of a key means "everyone", never "nobody".
  return (key?: PermissionKey) => (key ? granted.has(key) : true);
}


/** Every permission key the tree mentions, for a single batched resolution. */
export function collectNavPermissionKeys(workspaces: SidebarWorkspace[]): string[] {
  const keys: string[] = [];
  for (const workspace of workspaces) {
    for (const group of workspace.groups) {
      for (const item of group.items) {
        if (item.permission) keys.push(item.permission);
        for (const sub of item.subItems ?? []) {
          if (sub.permission) keys.push(sub.permission);
        }
      }
    }
  }
  return keys;
}

/**
 * Prunes the tree to what this viewer may actually open.
 *
 * Pruning cascades upward: an item whose every sub-entry is hidden is itself
 * removed, and a group left with no items goes too. Otherwise the menu keeps
 * dead branches that expand into nothing, which reads as a broken product
 * rather than a restricted one.
 */
export function filterNavByPermission(
  workspaces: SidebarWorkspace[],
  can: (key?: string) => boolean,
): SidebarWorkspace[] {
  return workspaces
    .map((workspace) => ({
      ...workspace,
      groups: workspace.groups
        .map((group) => ({
          ...group,
          items: group.items
            .map((item) => {
              const subItems = item.subItems?.filter((sub) => can(sub.permission));

              // An item that only ever existed as a container for links the
              // viewer cannot open has nothing left to show.
              if (item.subItems && item.subItems.length > 0 && (!subItems || subItems.length === 0)) {
                return null;
              }
              if (!can(item.permission)) return null;

              return subItems ? { ...item, subItems } : item;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((workspace) => workspace.groups.length > 0);
}
