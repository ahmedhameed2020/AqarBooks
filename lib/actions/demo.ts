"use server";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { startDemoSession, endDemoSession } from "@/lib/demo/session";
import { checkDemoEntryRateLimit } from "@/lib/demo/rate-limit";
import { recordDemoEvent } from "@/lib/demo/analytics";
import type { ActionResult } from "@/lib/actions/platform";

function toLocale(value: FormDataEntryValue | null): Locale {
  const candidate = typeof value === "string" ? value : "";
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
}

/**
 * The public entry point: sign the visitor into the curated demo tenant and
 * drop them on the dashboard.
 *
 * The redirect is intentionally outside the failure branch -- `redirect()`
 * signals by throwing, so wrapping it would swallow the navigation and leave
 * the visitor on a form that reported success and did nothing.
 */
export async function enterDemoAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const locale = toLocale(formData.get("locale"));

  // Checked BEFORE startDemoSession, not after: a rate-limited request must
  // never reach auth.signInWithPassword at all, so the limit actually bounds
  // sign-in volume rather than just bounding how often the UI reports success.
  const rateLimit = await checkDemoEntryRateLimit();
  if (!rateLimit.allowed) {
    recordDemoEvent("demo_entry_rate_limited", { locale });
    return { ok: false, error: "demo_rate_limited" };
  }

  const result = await startDemoSession();

  if (!result.ok) {
    recordDemoEvent("demo_entry_failed", { locale, reason: result.error });
    return { ok: false, error: result.error };
  }

  recordDemoEvent("demo_entry", { locale });
  return redirect({ href: "/dashboard", locale });
}

/** Leaves the demo and returns to the marketing entry page. */
export async function exitDemoAction(formData: FormData): Promise<void> {
  const locale = toLocale(formData.get("locale"));
  await endDemoSession();
  recordDemoEvent("demo_exit", { locale });
  redirect({ href: "/demo", locale });
}
