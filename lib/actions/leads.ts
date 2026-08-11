"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/actions/platform";

// Server-side only. The browser never has a path to insert into demo_leads
// or contact_requests directly -- both tables have no client-facing INSERT
// RLS policy at all, so the service-role client below is the only writer.

const demoLeadSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  company: z.string().trim().max(200).optional(),
  roleTitle: z.string().trim().max(120).optional(),
  organizationName: z.string().trim().max(200).optional(),
  unitsCount: z.coerce.number().int().nonnegative().max(1_000_000).optional(),
  gatesCount: z.coerce.number().int().nonnegative().max(1_000).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  preferredContactMethod: z.enum(["email", "phone"]).optional(),
  message: z.string().trim().max(2000).optional(),
  // Honeypot: real users never see or fill this field (hidden via CSS).
  website: z.string().max(0).optional(),
});

export async function submitDemoLeadAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = demoLeadSchema.safeParse({
    fullName: formData.get("fullName"),
    company: formData.get("company") || undefined,
    roleTitle: formData.get("roleTitle") || undefined,
    organizationName: formData.get("organizationName") || undefined,
    unitsCount: formData.get("unitsCount") || undefined,
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

  // Honeypot tripped: pretend success, insert nothing.
  if (parsed.data.website) {
    return { ok: true };
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
    message: parsed.data.message || null,
  });

  if (error) {
    // Never leak database internals to the client.
    return { ok: false, error: "submission_failed" };
  }

  return { ok: true };
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
