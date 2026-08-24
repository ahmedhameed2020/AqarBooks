"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/platform";
import { UNIT_RANGE_LABELS, demoLeadSchema } from "@/lib/actions/leads-schema";

// Server-side only. The browser never has a path to insert into demo_leads
// or contact_requests directly -- both tables have no client-facing INSERT
// RLS policy at all, so the service-role client below is the only writer.

// `ActionResult`'s initial value in the form is a bare `{ ok: true }`, so a
// success return has to be distinguishable from "not submitted yet" -- hence
// the `data` payload rather than another bare `{ ok: true }`.
const DEMO_LEAD_SUBMITTED: ActionResult<{ submitted: true }> = {
  ok: true,
  data: { submitted: true },
};

export async function submitDemoLeadAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult<{ submitted: true }>> {
  const parsed = demoLeadSchema.safeParse({
    fullName: formData.get("fullName"),
    company: formData.get("company") || undefined,
    roleTitle: formData.get("roleTitle") || undefined,
    organizationName: formData.get("organizationName") || undefined,
    unitsCount: formData.get("unitsCount") || undefined,
    entityType: formData.get("entityType") || undefined,
    unitRange: formData.get("unitRange") || undefined,
    gatesCount: formData.get("gatesCount") || undefined,
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    preferredContactMethod: formData.get("preferredContactMethod") || undefined,
    message: formData.get("message") || undefined,
    website: formData.get("website") || "",
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  // Honeypot tripped: pretend success, insert nothing. The shape has to match
  // the real success return exactly, otherwise the difference is a signal.
  if (parsed.data.website) {
    return DEMO_LEAD_SUBMITTED;
  }

  const admin = createAdminClient();

  // DB-backed rate limit: one submission per email per hour. Survives
  // restarts and works across instances, unlike an in-memory counter.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("demo_leads")
    .select("id", { count: "exact", head: true })
    .eq("email", parsed.data.email)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "rate_limited" };
  }

  // `demo_leads` has no column for entity type or unit range and this task is
  // explicitly not allowed to change the schema, so the two qualification
  // answers are prepended to `message` as a stable machine-readable header.
  // See the deferred backend note in the pricing implementation report: giving
  // these their own columns needs a migration and sign-off.
  const qualification: string[] = [];
  if (parsed.data.entityType) {
    qualification.push(`Entity type: ${parsed.data.entityType}`);
  }
  if (parsed.data.unitRange) {
    qualification.push(`Units: ${UNIT_RANGE_LABELS[parsed.data.unitRange]}`);
  }

  const composedMessage =
    [qualification.join("\n"), parsed.data.message?.trim()]
      .filter(Boolean)
      .join("\n\n") || null;

  const { error } = await admin.from("demo_leads").insert({
    full_name: parsed.data.fullName,
    company: parsed.data.company || null,
    role_title: parsed.data.roleTitle || null,
    organization_name: parsed.data.organizationName || null,
    units_count: parsed.data.unitsCount ?? null,
    gates_count: parsed.data.gatesCount ?? null,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    preferred_contact_method: parsed.data.preferredContactMethod || null,
    message: composedMessage,
  });

  if (error) {
    // Never leak database internals to the client.
    return { ok: false, error: "submission_failed" };
  }

  return DEMO_LEAD_SUBMITTED;
}

const contactRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(1).max(2000),
  website: z.string().max(0).optional(),
});

export async function submitContactRequestAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contactRequestSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    message: formData.get("message"),
    website: formData.get("website") || "",
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  if (parsed.data.website) {
    return { ok: true };
  }

  const admin = createAdminClient();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("contact_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", parsed.data.email)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "rate_limited" };
  }

  const { error } = await admin.from("contact_requests").insert({
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    message: parsed.data.message,
  });

  if (error) {
    return { ok: false, error: "submission_failed" };
  }

  return { ok: true };
}
