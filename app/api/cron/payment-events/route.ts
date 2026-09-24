import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPaymentEvent } from "@/lib/payments/process-event";

export const dynamic = "force-dynamic";
const MAX_BATCH = 50;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const configured = serverEnv.CRON_SECRET;
  if (!configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(provided, configured)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("online_payment_events")
    .select("id")
    .in("processing_status", ["RECEIVED", "RETRYABLE_ERROR"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);
  if (error) return NextResponse.json({ error: "claim_failed" }, { status: 500 });

  const counts = { claimed: data?.length ?? 0, processed: 0, idempotent: 0, quarantined: 0, retryable: 0, failed: 0 };
  for (const row of data ?? []) {
    try {
      const result = await processPaymentEvent(row.id);
      if (result.status === "PROCESSED" || result.status === "IGNORED") counts.processed += 1;
      else if (result.status === "IDEMPOTENT") counts.idempotent += 1;
      else if (result.status === "QUARANTINED") counts.quarantined += 1;
      else if (result.status === "RETRYABLE_ERROR") counts.retryable += 1;
    } catch {
      counts.failed += 1;
    }
  }
  return NextResponse.json(counts);
}
