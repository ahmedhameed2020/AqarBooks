import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env/server";
import { runDailyDigest } from "@/lib/alerts/digest";

// Scheduled entry point for the nightly alert digest.
//
// This route reads every active organization through the service role, so it is
// the single most sensitive endpoint in the app. Two things guard it:
//
//   1. A shared secret in the Authorization header. Compared in constant time,
//      because a timing-distinguishable compare on a bearer token is a real
//      (if slow) oracle.
//   2. A refusal to run at all when CRON_SECRET is unset. An unset secret must
//      never mean "no check required" -- that is how an internal job becomes a
//      public one.
//
// It is invoked by .github/workflows/alert-digest.yml rather than a Cloudflare
// Cron Trigger: OpenNext generates the worker entry, so adding a `scheduled`
// handler would mean owning generated output. A workflow that posts here is
// visible, retryable and leaves a log.

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
    console.error("[alert-digest] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!timingSafeEqual(provided, configured)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const outcomes = await runDailyDigest();

    const summary = {
      organizations: outcomes.length,
      sent: outcomes.filter((o) => o.status === "SENT").length,
      skipped: outcomes.filter((o) => o.status === "SKIPPED").length,
      failed: outcomes.filter((o) => o.status === "FAILED").length,
    };

    // Failures are surfaced as a non-200 so the workflow goes red instead of
    // reporting a green run that mailed nobody.
    const status = summary.failed > 0 ? 500 : 200;
    return NextResponse.json({ ...summary, outcomes }, { status });
  } catch (err) {
    console.error("[alert-digest] run failed:", (err as Error).message);
    return NextResponse.json({ error: "run_failed" }, { status: 500 });
  }
}
