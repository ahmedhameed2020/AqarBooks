import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const configured = serverEnv.CRON_SECRET;
  if (!configured) {
    console.error("[lease-expiry] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(provided, configured)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("run_lease_expiry_alerts");
    if (error) {
      console.error("[lease-expiry] sweep failed:", error.message);
      return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
    }
    return NextResponse.json(data ?? { candidates: 0, dispatched: 0, idempotent: 0 });
  } catch (error) {
    console.error("[lease-expiry] unexpected failure:", error);
    return NextResponse.json({ error: "unexpected" }, { status: 500 });
  }
}
