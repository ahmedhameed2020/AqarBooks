import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processGateHardwareCommand } from "@/lib/gates/hardware/process-command";
import type { ClaimedGateHardwareCommand } from "@/lib/gates/hardware/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const configured = serverEnv.CRON_SECRET;
  if (!configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const provided = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(provided), digest(configured))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_gate_hardware_commands" as never, { p_limit: 50 } as never);
  if (error) return NextResponse.json({ error: "claim_failed" }, { status: 500 });
  const commands = (data ?? []) as ClaimedGateHardwareCommand[];
  const counts = { claimed: commands.length, acknowledged: 0, dead: 0, retryable: 0, stale: 0, failed: 0 };
  for (const command of commands) {
    try {
      const result = await processGateHardwareCommand(command);
      if (result === "ACKNOWLEDGED") counts.acknowledged++;
      else if (result === "DEAD") counts.dead++;
      else if (result === "FAILED") counts.retryable++;
      else counts.stale++;
    } catch { counts.failed++; }
  }
  return NextResponse.json(counts);
}
