import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Liveness probe for CI and uptime monitoring.
//
// The point is to prove the worker can still act with its service-role
// credentials. Checking that the env var is merely *present* would pass on a
// key that has been rotated or revoked, so this performs a real privileged
// call instead. listUsers is chosen deliberately: the auth admin API is
// reachable only with the service role, so an anon/publishable key cannot
// fake a pass the way a plain table read under a permissive RLS policy could.
//
// Excluded from the i18n middleware by the `api` term in middleware.ts's
// matcher -- without that, a probe would get a 307 to /en/api/health and any
// assertion on the status code would be measuring the redirect, not health.

// Route handlers are not cached by default in current Next versions, but this
// is one line of insurance against a future config change baking a build-time
// 200 into the bundle. A cached health check is worse than none.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });

    if (error) {
      // Logged server-side only. The response body stays generic: this
      // endpoint is unauthenticated, and naming which backend component
      // failed would hand a probe a map of the internals.
      console.error("[health] privileged call failed:", error.message);
      return NextResponse.json({ status: "unavailable" }, { status: 503 });
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (cause) {
    console.error("[health] unexpected failure:", cause);
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
