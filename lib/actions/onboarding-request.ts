"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/platform";

/**
 * Assisted-onboarding: account establishment (Step 1) + request submission
 * (Step 4), as two separate, independently-committed actions joined by a
 * real authenticated session -- not one all-or-nothing transaction.
 *
 * WHY TWO ACTIONS, NOT ONE
 * The original design created the Auth account and the onboarding_requests
 * row in the same call, which meant every failure after account creation
 * needed a compensating delete, and gave no way to tell "a new visitor" from
 * "an existing, already-logged-in customer requesting a second entity"
 * before the account-creation step had already run. Splitting the flow so
 * that Step 1 ends with a real, signed-in session (whether that session is
 * brand new or already existed) removes the need for that coupling
 * entirely: every state after Step 1 -- signed in, zero requests yet -- is a
 * safe, ordinary, resumable state, identical to any incomplete signup.
 * Nothing downstream needs to know or care whether the session is minutes
 * or months old.
 *
 * WHY THIS NEVER PROVISIONS ANYTHING
 * No organization, membership, or role assignment is created by either
 * action here. That only ever happens inside approve_onboarding_request()
 * (lib/actions/platform.ts), which only a platform Super Admin can invoke.
 */

const ENTITY_TYPES = [
  "DEVELOPER",
  "FACILITY_MANAGEMENT",
  "OWNERS_ASSOCIATION",
  "INDIVIDUAL_OWNER",
  "TOURIST_RESORT",
  "TOURIST_VILLAGE",
  "RESIDENTIAL_COMPOUND",
  "OTHER",
] as const;

const PLAN_KEYS = ["STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

function resolveLocale(value: unknown): Locale {
  const candidate = typeof value === "string" ? value : "";
  return (routing.locales as readonly string[]).includes(candidate)
    ? (candidate as Locale)
    : routing.defaultLocale;
}

/**
 * Best-effort client identifier for an anonymous visitor. Independent copy
 * of the same resolution used by lib/demo/rate-limit.ts -- see that file's
 * doc comment for why CF-Connecting-IP is primary and a missing IP still
 * resolves to a shared, non-empty key rather than bypassing the limit.
 */
async function resolveClientKey(): Promise<string> {
  const h = await headers();
  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwardedFor = h.get("x-forwarded-for");
  const firstHop = forwardedFor?.split(",")[0]?.trim();
  if (firstHop) return firstHop;

  return "unknown";
}

// ---------------------------------------------------------------------
// Step 1: establish the requester's identity.
// ---------------------------------------------------------------------

const accountSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    workEmail: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
    locale: z.string(),
    // Honeypot: a real visitor never fills this hidden field. A filled one
    // returns the same success shape as a real submission (matching
    // lib/actions/leads.ts) so a bot can't distinguish rejection from
    // acceptance -- and, critically, never reaches createUser at all.
    website: z.string().max(0).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  });

/**
 * Case A (new email): rate-limited, then creates a real Auth account and
 * signs it in.
 * Case B (already authenticated): this action is a defensive no-op --
 * app/[locale]/get-started/page.tsx redirects an authenticated visitor
 * straight to /get-started/company without ever rendering the form that
 * calls this action, so reaching here already-authenticated means the
 * visitor bypassed the normal navigation. Reusing their existing session
 * is still the correct, safe response rather than an error.
 * Case C (existing email, not authenticated): admin.auth.admin.createUser
 * refuses (the real, load-bearing mechanism is auth.users'
 * users_email_partial_key unique index, not application logic), and the
 * UI's job is to route them to /login?redirect_to=/get-started/company --
 * signing in from there resumes this same flow as Case B. Nothing about
 * the account is reset, overwritten, or otherwise touched.
 */
export async function startOnboardingAccountAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = accountSchema.safeParse({
    fullName: formData.get("fullName"),
    workEmail: formData.get("workEmail"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    locale: formData.get("locale"),
    website: formData.get("website") || "",
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  if (parsed.data.website) {
    return redirect({ href: "/get-started/company", locale });
  }

  const supabase = await createClient();
  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();
  if (existingUser) {
    return redirect({ href: "/get-started/company", locale });
  }

  const admin = createAdminClient();
  const clientKey = await resolveClientKey();

  // Rate-limited BEFORE createUser -- a denied attempt must never reach the
  // Admin Auth API, so the limit bounds account-creation volume rather than
  // just bounding how often the UI reports success.
  const { data: allowed, error: rateLimitError } = await admin.rpc("check_and_record_rate_limit", {
    p_action: "onboarding_account_create",
    p_client_key: clientKey,
    p_limit: 5,
    p_window_seconds: 3_600,
  });
  if (rateLimitError || allowed !== true) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: parsed.data.workEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName, phone: parsed.data.phone || null },
  });

  if (createUserError || !created?.user) {
    if (createUserError?.message?.toLowerCase().includes("already")) {
      return { ok: false, error: "email_already_registered" };
    }
    return { ok: false, error: "submission_failed" };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.workEmail,
    password: parsed.data.password,
  });

  if (signInError) {
    // This account is known, certainly, to be brand new -- created a moment
    // ago inside this same call -- so removing it here can never touch a
    // pre-existing customer's account.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "submission_failed" };
  }

  return redirect({ href: "/get-started/company", locale });
}

// ---------------------------------------------------------------------
// Step 4: submit the entity-activation request for the CURRENT session.
// ---------------------------------------------------------------------

const requestSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(200),
    entityType: z.enum(ENTITY_TYPES),
    entityTypeCustomLabel: z.string().trim().max(200).optional(),
    country: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    expectedPropertiesCount: z.coerce.number().int().min(0).max(100_000).optional(),
    expectedUnitsCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    notes: z.string().trim().max(2_000).optional(),
    requestedPlanKey: z.enum(PLAN_KEYS),
    locale: z.string(),
  })
  .refine((data) => data.entityType !== "OTHER" || Boolean(data.entityTypeCustomLabel), {
    message: "custom_label_required",
    path: ["entityTypeCustomLabel"],
  });

/**
 * The requester is always the CURRENT session's user -- never a value from
 * the form -- so this only ever creates a request for whoever is actually
 * signed in, whether that's the account Step 1 just created or an existing
 * customer requesting a second entity. Idempotency is enforced by
 * onboarding_requests_one_actionable_per_requester (a partial unique index,
 * not application logic): a double-click, retry, or replay that races this
 * call hits a real unique_violation (Postgres code 23505), which is treated
 * as the same success as the first call -- same confirmation page, not a
 * second row and not a user-facing error.
 */
export async function submitOnboardingRequestAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse({
    organizationName: formData.get("organizationName"),
    entityType: formData.get("entityType"),
    entityTypeCustomLabel: formData.get("entityTypeCustomLabel") || undefined,
    country: formData.get("country") || undefined,
    city: formData.get("city") || undefined,
    expectedPropertiesCount: formData.get("expectedPropertiesCount") || undefined,
    expectedUnitsCount: formData.get("expectedUnitsCount") || undefined,
    notes: formData.get("notes") || undefined,
    requestedPlanKey: formData.get("requestedPlanKey"),
    locale: formData.get("locale"),
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Not reachable via the real UI -- every path into this page requires a
    // session established in Step 1. Defensive only.
    return { ok: false, error: "not_authenticated" };
  }

  const admin = createAdminClient();
  const clientKey = await resolveClientKey();

  const { data: allowed, error: rateLimitError } = await admin.rpc("check_and_record_rate_limit", {
    p_action: "onboarding_request_submit",
    p_client_key: clientKey,
    p_limit: 5,
    p_window_seconds: 3_600,
  });
  if (rateLimitError || allowed !== true) {
    return { ok: false, error: "rate_limited" };
  }

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() || user.email || "Unknown";
  const phone = (user.user_metadata?.phone as string | undefined) || null;

  const { data: inserted, error: insertError } = await admin
    .from("onboarding_requests")
    .insert({
      requester_user_id: user.id,
      full_name: fullName,
      work_email: user.email!,
      phone,
      organization_name: parsed.data.organizationName,
      entity_type: parsed.data.entityType,
      entity_type_custom_label: parsed.data.entityType === "OTHER" ? parsed.data.entityTypeCustomLabel! : null,
      country: parsed.data.country || null,
      city: parsed.data.city || null,
      expected_properties_count: parsed.data.expectedPropertiesCount ?? null,
      expected_units_count: parsed.data.expectedUnitsCount ?? null,
      notes: parsed.data.notes || null,
      requested_plan_key: parsed.data.requestedPlanKey,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Idempotent: this requester already has an actionable request (a
      // double-click, a retry, or a replay of this exact call). Land them on
      // the same confirmation page a fresh success would -- not an error.
      return redirect({ href: "/get-started/submitted", locale });
    }
    return { ok: false, error: "submission_failed" };
  }

  await admin.from("onboarding_request_events").insert({
    request_id: inserted.id,
    event_type: "SUBMITTED",
    actor_id: user.id,
  });

  return redirect({ href: "/get-started/submitted", locale });
}
