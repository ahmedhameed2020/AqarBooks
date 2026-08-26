import "server-only";

/**
 * Demo funnel instrumentation.
 *
 * WHY THERE IS NO VENDOR HERE
 * The repository has no analytics vendor today -- no PostHog, no Plausible, no
 * gtag, nothing. Adding one to measure a demo funnel would introduce a third-
 * party script on a marketing surface, a consent obligation, and a dependency,
 * for a question we can answer with the logging we already pay for. Cloudflare
 * Workers observability is enabled in wrangler.jsonc, so a structured line on
 * stdout is queryable without any of that.
 *
 * WHAT IT DELIBERATELY DOES NOT RECORD
 * No user id, no email, no session identifier, no IP, no query text, and no
 * financial figures. A demo event says which surface was reached and in which
 * locale. That is enough to answer "which module precedes a pricing click"
 * and not enough to profile a visitor -- and since every visitor shares one
 * underlying account, per-user attribution would be meaningless anyway.
 *
 * These events describe the PUBLIC DEMO ONLY. Nothing here runs for a real
 * tenant; every call site is behind an isDemo check.
 */

export type DemoEventName =
  | "demo_entry"
  | "demo_entry_failed"
  | "demo_entry_rate_limited"
  | "demo_exit"
  | "demo_dashboard_view"
  | "demo_feature_view"
  | "demo_walkthrough_started"
  | "demo_walkthrough_completed"
  | "demo_ai_used"
  | "demo_ai_rate_limited"
  | "demo_write_blocked"
  | "demo_pricing_clicked"
  | "demo_contact_clicked"
  | "demo_founding_program_clicked";

export type DemoEventProps = {
  locale?: string;
  /** Module or screen slug, e.g. "treasury", "cam", "audit". Never a URL with ids. */
  feature?: string;
  /** Why an entry or a write was refused. A stable slug, never a raw error. */
  reason?: string;
};

export function recordDemoEvent(name: DemoEventName, props: DemoEventProps = {}): void {
  // One line, one JSON object, a fixed prefix to filter on. Never throws:
  // instrumentation must not be able to break the surface it measures.
  try {
    console.log(
      JSON.stringify({
        evt: name,
        source: "public_demo",
        ...props,
      }),
    );
  } catch {
    // Ignored on purpose.
  }
}
