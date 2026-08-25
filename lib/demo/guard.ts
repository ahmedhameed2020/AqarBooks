import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { isDemoOrganization } from "@/lib/demo/config";

/**
 * The public demo's server-side write barrier.
 *
 * WHERE THIS SITS IN THE STACK
 * It is the middle of three layers, and it is the only one that is here purely
 * for this feature:
 *
 *   1. UI      -- controls are absent, because the nav and page guards already
 *                 prune by permission and the demo account holds none of the
 *                 manage/create keys.
 *   2. SERVER  -- this module. Mutating server actions and mutating API routes
 *                 refuse before they reach Supabase.
 *   3. DATABASE-- the demo account's role is a tenant clone of the AUDITOR
 *                 template, which carries only `.view`/`.read` permissions.
 *                 Every write RPC calls has_permission() itself, and the write
 *                 RLS policies are permission-keyed, so the database refuses
 *                 independently of anything above it.
 *
 * Layer 3 is the one that actually holds. This layer exists for two reasons
 * that layer 3 cannot serve:
 *
 *   - It produces a deliberate, translated "this is a demo" refusal instead of
 *     a raw Postgres permission error surfacing in a toast.
 *   - It covers the small number of write policies that are NOT permission-
 *     keyed. Auditing the baseline turned up nine; all but one are platform-
 *     admin-only or own-row, and the exception is
 *     `property_import_logs_insert_member`, which any org member may insert.
 *     Layer 3 would let that one through.
 *
 * WHY IT DOES NOT TRUST A COOKIE
 * Demo-ness is derived from the organization resolved from the session, never
 * from a marker the browser holds. A visitor can delete or forge any cookie
 * they like; they cannot change which organization their Supabase session is a
 * member of.
 */

export type DemoContext = {
  isDemo: boolean;
  organizationId: string | null;
};

/**
 * Resolved once per request. `cache` is React's per-request memo, so a page
 * that guards in several places pays for one round trip, not several.
 */
export const getDemoContext = cache(async function getDemoContext(): Promise<DemoContext> {
  const user = await getCurrentUser();
  if (!user) return { isDemo: false, organizationId: null };

  const organization = await getPrimaryOrganization(user.id);
  const organizationId = organization?.id ?? null;

  return { isDemo: isDemoOrganization(organizationId), organizationId };
});

/** Convenience for UI code that only needs the boolean. */
export async function isDemoSession(): Promise<boolean> {
  return (await getDemoContext()).isDemo;
}

/**
 * The error code every refused mutation reports. It is a stable slug, mapped
 * to bilingual copy in lib/actions/error-messages.ts, so a caller can special-
 * case it (to show the "view plans" prompt) without string-matching prose.
 */
export const DEMO_READ_ONLY = "demo_read_only";

/**
 * For server actions returning `ActionResult`. Returns the refusal to hand
 * straight back, or null when the caller may proceed.
 *
 *   const refusal = await denyIfDemo();
 *   if (refusal) return refusal;
 */
export async function denyIfDemo(): Promise<{ ok: false; error: string } | null> {
  const { isDemo } = await getDemoContext();
  return isDemo ? { ok: false, error: DEMO_READ_ONLY } : null;
}

/**
 * Raised by `assertNotDemo`. Carries no detail beyond the code -- a refusal
 * should not describe the guard that produced it.
 */
export class DemoReadOnlyError extends Error {
  readonly code = DEMO_READ_ONLY;
  constructor() {
    super("This action is not available in the AqarBooks demo environment.");
    this.name = "DemoReadOnlyError";
  }
}

/**
 * For code paths that throw rather than return a result -- route handlers that
 * already have a try/catch, and actions that call `redirect` on success.
 */
export async function assertNotDemo(): Promise<void> {
  const { isDemo } = await getDemoContext();
  if (isDemo) throw new DemoReadOnlyError();
}

/**
 * For Route Handlers. Returns a 403 Response to return directly, or null.
 * Kept here rather than in each route so the status and body shape cannot
 * drift between the seven AI endpoints.
 */
export async function demoForbiddenResponse(): Promise<Response | null> {
  const { isDemo } = await getDemoContext();
  if (!isDemo) return null;
  return Response.json({ error: DEMO_READ_ONLY }, { status: 403 });
}
