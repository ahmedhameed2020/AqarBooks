import "server-only";
import { getDemoContext } from "@/lib/demo/guard";
import { checkDemoAiRateLimit, clientKeyFromRequest } from "@/lib/demo/rate-limit";
import { recordDemoEvent } from "@/lib/demo/analytics";

/**
 * One gate in front of every AI route, so the demo's AI policy is decided in a
 * single place rather than drifting across seven handlers.
 *
 * WHAT THE DEMO IS ALLOWED TO REACH, AND WHY
 * The rule is spec §9 and §33 together: AI may explain and propose, never act,
 * and the demo must not imply capability the product has not certified. The
 * certification bundle in lib/ai/kill-switch.ts still reads
 * PRE_PRODUCTION_CERTIFIED, which is a further reason to expose the narrow
 * read-only surface rather than the full suite.
 *
 *   ask_aqarbooks      ALLOW  -- answers questions about data already on screen.
 *   financial_insights ALLOW  -- narrates figures the dashboard already shows.
 *   reconcile_match    ALLOW  -- scores candidate matches; posts nothing. This
 *                               is the strongest demonstration of the product's
 *                               real-estate treasury work, and it is inert.
 *
 *   invoice_ocr        DENY   -- takes an upload. A public endpoint that runs a
 *                               vision model over anything a stranger sends is
 *                               the single most expensive thing here, and §10
 *                               forbids arbitrary uploads outright.
 *   import_mapping     DENY   -- the front half of a write flow whose back half
 *                               the demo cannot perform.
 *   journal_copilot    DENY   -- proposing entries that can never be posted is a
 *                               dead end, and showing it risks implying the
 *                               product lets AI post to the ledger.
 *   smart_dunning      DENY   -- drafts outbound messages to members. Nothing
 *                               addressed to a person should originate from a
 *                               public demo, even in draft.
 *
 * A DENY is not a failure the visitor caused: it returns 403 with a stable
 * slug the client can render as "not part of the demo".
 */
export type DemoAiFeature =
  | "ask_aqarbooks"
  | "financial_insights"
  | "reconcile_match"
  | "invoice_ocr"
  | "import_mapping"
  | "journal_copilot"
  | "smart_dunning";

const ALLOWED_IN_DEMO: ReadonlySet<DemoAiFeature> = new Set<DemoAiFeature>([
  "ask_aqarbooks",
  "financial_insights",
  "reconcile_match",
]);

/**
 * Returns a Response to send back, or null to continue.
 *
 * For a real tenant this is a no-op beyond one cached session lookup: it
 * returns null before consulting the allowlist or the limiter, so no paying
 * customer is ever rate-limited by demo policy.
 */
export async function demoAiGate(
  req: Request,
  feature: DemoAiFeature,
): Promise<Response | null> {
  const { isDemo } = await getDemoContext();
  if (!isDemo) return null;

  if (!ALLOWED_IN_DEMO.has(feature)) {
    recordDemoEvent("demo_write_blocked", { feature });
    return Response.json({ error: "demo_feature_unavailable" }, { status: 403 });
  }

  const decision = checkDemoAiRateLimit(clientKeyFromRequest(req));
  if (!decision.allowed) {
    recordDemoEvent("demo_ai_rate_limited", { feature });
    return Response.json(
      { error: "demo_rate_limited", retryAfterSeconds: decision.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
    );
  }

  recordDemoEvent("demo_ai_used", { feature });
  return null;
}
