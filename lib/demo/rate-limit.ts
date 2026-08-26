import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Durable rate limiting for public demo entry.
 *
 * WHY THIS EXISTS
 * Before this module, enterDemoAction called auth.signInWithPassword on every
 * submission with no limit at all -- not an insufficient in-memory one,
 * literally none. Any client could invoke it without bound.
 *
 * WHY THIS IS DURABLE, NOT PROCESS-LOCAL
 * The check runs entirely in Postgres, via check_and_record_rate_limit
 * (migration 20260826072010_public_action_rate_limits.sql). This module holds
 * no JS-level counter of its own -- no Map, no closured variable -- so there is
 * nothing here for a Cloudflare Workers cold start to discard and nothing that
 * could diverge between isolates. Every isolate reads and writes the same
 * database rows the rest of the app already depends on.
 *
 * WHY THE SERVICE-ROLE CLIENT
 * The migration revokes EXECUTE on the RPC from anon and authenticated --
 * matching how demo_leads/contact_requests are written (see lib/actions/leads.ts)
 * -- so this can only be called from trusted server code, never from the
 * browser.
 */

const DEMO_ENTRY_ACTION = "demo_entry";
const DEMO_ENTRY_LIMIT = 5;
const DEMO_ENTRY_WINDOW_SECONDS = 60;

/**
 * Best-effort client identifier for an anonymous visitor.
 *
 * Cloudflare sets CF-Connecting-IP on every request that reaches the Worker,
 * so that is the primary signal. x-forwarded-for is a fallback for local dev
 * (`next dev`, no Cloudflare in front) and takes only the first hop, which is
 * the only part a client this close to the server could not itself forge past.
 * A missing IP still resolves to a stable, non-empty key rather than throwing,
 * so a request without either header shares one bucket instead of bypassing
 * the limit entirely -- the safe direction for something that fails to block
 * an abusive pattern, not the safe direction for correctness of attribution.
 */
async function resolveClientKey(): Promise<string> {
  const h = await headers();
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwardedFor = h.get("x-forwarded-for");
  const firstHop = forwardedFor?.split(",")[0]?.trim();
  if (firstHop) return firstHop;

  return "unknown";
}

export type RateLimitResult = { allowed: true } | { allowed: false };

/**
 * Checks and records one demo-entry attempt for the current request's client.
 * Fails closed: if the durable check itself errors (e.g. a transient DB
 * issue), the attempt is treated as NOT allowed rather than silently letting
 * an unbounded sign-in through. A real visitor sees the same "try again
 * shortly" message either way; the difference matters only for what an
 * attacker can do with a database outage.
 */
export async function checkDemoEntryRateLimit(): Promise<RateLimitResult> {
  const clientKey = await resolveClientKey();
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("check_and_record_rate_limit", {
    p_action: DEMO_ENTRY_ACTION,
    p_client_key: clientKey,
    p_limit: DEMO_ENTRY_LIMIT,
    p_window_seconds: DEMO_ENTRY_WINDOW_SECONDS,
  });

  if (error) {
    console.error("[demo] rate-limit check failed, failing closed:", error.message);
    return { allowed: false };
  }

  return data === true ? { allowed: true } : { allowed: false };
}
