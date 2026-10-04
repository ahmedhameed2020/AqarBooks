import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env/server";
import type { Deps, Rpc } from "./orchestrate";

/**
 * Resend over one fetch (no SDK; this runs on the Workers runtime). Returns
 * ok only when the provider ACCEPTED the message -- callers must never report
 * an email as sent on any other outcome.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv.RESEND_FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "network error" };
  }
}

/** Dependencies for staff-initiated actions: the caller's own session for RPCs. */
export async function staffDeps(): Promise<Deps> {
  const session = await createClient();
  const admin = createAdminClient();
  return {
    rpc: toRpc(session),
    adminRpc: toRpc(admin),
    auth: adminAuth(admin),
    email: { configured: Boolean(serverEnv.RESEND_API_KEY), send: sendEmail },
    siteUrl: serverEnv.NEXT_PUBLIC_SITE_URL,
  };
}

/** Dependencies for the unauthenticated activation endpoints (no staff session exists). */
export function activationDeps(): Pick<Deps, "adminRpc" | "auth"> {
  const admin = createAdminClient();
  return {
    adminRpc: toRpc(admin),
    auth: adminAuth(admin),
  };
}

// The new functions are not in the generated Database types until the
// migration has been applied to the hosted project and types are regenerated,
// so they are called through this narrow, untyped seam.
function toRpc(client: { rpc: (fn: never, args: never) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Rpc {
  return async (fn, args) => {
    const { data, error } = await client.rpc(fn as never, (args ?? {}) as never);
    return { data, error };
  };
}

function adminAuth(admin: ReturnType<typeof createAdminClient>): Deps["auth"] {
  return {
    createUser: (attrs) => admin.auth.admin.createUser(attrs) as never,
    updateUserById: async (id, attrs) => ({ error: (await admin.auth.admin.updateUserById(id, attrs)).error }),
    deleteUser: async (id) => ({ error: (await admin.auth.admin.deleteUser(id)).error }),
    getUser: (jwt) => admin.auth.getUser(jwt) as never,
  };
}
