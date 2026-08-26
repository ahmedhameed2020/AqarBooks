"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/platform";

/**
 * Public assisted-onboarding request submission.
 *
 * WHY THIS NEVER PROVISIONS ANYTHING
 * This action creates two things and nothing else: a Supabase Auth account
 * for the requester (so they have an identity to become TENANT_OWNER of
 * later) and one `onboarding_requests` row with status PENDING_APPROVAL. No
 * organization, membership, or role assignment is created here -- that only
 * ever happens inside approve_onboarding_request() (lib/actions/platform.ts),
 * which only a platform Super Admin can invoke. This mirrors exactly what
 * create_organization_onboarding's revoked authenticated grant used to do in
 * one step, now split into "anyone can ask" and "only an admin can grant".
 *
 * WHY A SERVICE-ROLE ADMIN CLIENT, NOT auth.signUp
 * `onboarding_requests` has no anon/authenticated INSERT policy at all (same
 * shape as demo_leads/contact_requests -- see the migration). The public
 * caller has no session, so admin.auth.admin.createUser() is used instead of
 * the browser-facing signUp() flow, and email_confirm is set true so the
 * requester doesn't need a confirmation click before they can eventually log
 * in once approved.
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

const submitSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    workEmail: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).optional(),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
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
    // Honeypot: a real visitor never fills this hidden field. Matches
    // lib/actions/leads.ts -- a filled honeypot must return the same success
    // shape as a real submission so a bot can't distinguish rejection from
    // acceptance, and must not be allowed to reach account creation.
    website: z.string().max(0).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "password_mismatch",
    path: ["confirmPassword"],
  })
  .refine((data) => data.entityType !== "OTHER" || Boolean(data.entityTypeCustomLabel), {
    message: "custom_label_required",
    path: ["entityTypeCustomLabel"],
  });

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

export async function submitOnboardingRequestAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = submitSchema.safeParse({
    fullName: formData.get("fullName"),
    workEmail: formData.get("workEmail"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
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
    website: formData.get("website") || "",
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const locale = (routing.locales as readonly string[]).includes(parsed.data.locale)
    ? (parsed.data.locale as Locale)
    : routing.defaultLocale;

  // Honeypot tripped: pretend success, create nothing.
  if (parsed.data.website) {
    return redirect({ href: "/get-started/submitted", locale });
  }

  const admin = createAdminClient();

  const clientKey = await resolveClientKey();
  const { data: allowed, error: rateLimitError } = await admin.rpc("check_and_record_rate_limit", {
    p_action: "onboarding_request_submit",
    p_client_key: clientKey,
    p_limit: 5,
    p_window_seconds: 3_600,
  });
  // Fails closed, same as checkDemoEntryRateLimit: a DB error is treated as
  // "not allowed", never as an open door.
  if (rateLimitError || allowed !== true) {
    return { ok: false, error: "rate_limited" };
  }

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email: parsed.data.workEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createUserError || !created?.user) {
    if (createUserError?.message?.toLowerCase().includes("already")) {
      return { ok: false, error: "email_already_registered" };
    }
    return { ok: false, error: "submission_failed" };
  }

  const { data: inserted, error: insertError } = await admin
    .from("onboarding_requests")
    .insert({
      requester_user_id: created.user.id,
      full_name: parsed.data.fullName,
      work_email: parsed.data.workEmail,
      phone: parsed.data.phone || null,
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

  if (insertError || !inserted) {
    // Don't leave an orphaned, request-less auth account behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "submission_failed" };
  }

  await admin.from("onboarding_request_events").insert({
    request_id: inserted.id,
    event_type: "SUBMITTED",
    actor_id: created.user.id,
  });

  return redirect({ href: "/get-started/submitted", locale });
}
