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
): Promise<(key?: PermissionKey) => boolean> {
  const distinct = [...new Set(keys)];
  if (distinct.length === 0) return () => true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return () => false;

  const results = await Promise.all(
    distinct.map(async (key) => {
      const { data, error } = await supabase.rpc("has_permission", {
        p_user_id: user.id,
        p_organization_id: organizationId,
        p_permission_key: key,
      });
      // A failed check is not a granted one. Erring towards hiding a link is
      // recoverable; erring towards showing it is not.
      return [key, error ? false : Boolean(data)] as const;
    }),
  );

  const granted = new Map(results);

  // An item with no key is unrestricted on purpose -- the dashboard, the
  // user's own profile. Absence of a key means "everyone", never "nobody".
  return (key?: PermissionKey) => (key ? granted.get(key) === true : true);
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
