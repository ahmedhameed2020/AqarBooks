import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Scheduled entry point for lease rent generation.
//
// WHY THIS ROUTE EXISTS
// run_lease_rent_generation() used to be invoked from the render path of
// /finance/dues (`adminClient.rpc(...)` inside that page's Promise.all). That
// meant:
//
//   1. Rendering a page performed a financial mutation. A GET that posts dues
//      is not a read, and nothing about opening a screen should advance the
//      ledger.
//   2. The mutation was cross-tenant. The sweep loops every ACTIVE lease in
//      every organization, so whoever happened to open their own dues screen
//      billed rent for every other tenant too -- under the service role, with
//      no permission check anywhere in the path.
//   3. It was load-bearing but invisible. Rent generation happened only if
//      somebody looked at a screen; nobody looking meant no rent billed.
//
// Moving it here makes the schedule explicit and auditable, and leaves the
// dues page a pure read. The database is the authoritative guard for demo
// tenants (run_lease_rent_generation excludes organizations.is_demo), so a
// frozen demo ledger cannot be advanced from here either.
//
// Guarded exactly like the alert digest: a constant-time shared-secret compare,
// and a refusal to run at all when CRON_SECRET is unset -- an unset secret must
// never mean "no check required".

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const configured = serverEnv.CRON_SECRET;

  if (!configured) {
    console.error("[lease-rent] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(provided, configured)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("run_lease_rent_generation");

    if (error) {
      console.error("[lease-rent] run_lease_rent_generation failed:", error.message);
      return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
    }

    // The RPC counts its own outcomes per lease and swallows per-lease errors
    // so one bad lease cannot abort the sweep. Surface `errored` as a non-200
    // so a partially failing run goes red rather than reporting success.
    const summary = (data ?? {}) as Record<string, number>;
    const status = (summary.errored ?? 0) > 0 ? 500 : 200;
    return NextResponse.json(summary, { status });
  } catch (err) {
    console.error("[lease-rent] unexpected failure:", err);
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
