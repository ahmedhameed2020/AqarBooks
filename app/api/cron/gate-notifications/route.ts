import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configured = serverEnv.CRON_SECRET;
  if (!configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const provided = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(provided), digest(configured))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("process_gate_notifications" as never, { p_limit: 100 } as never);
    // The SQL count measures attempted rows, including retryable delivery failures.
    if (error || !Number.isInteger(data) || typeof data !== "number" || data < 0 || data > 100) {
      return NextResponse.json({ error: "drain_failed" }, { status: 500 });
    }
    return NextResponse.json({ processed: data });
  } catch {
    return NextResponse.json({ error: "drain_failed" }, { status: 500 });
  }
}
