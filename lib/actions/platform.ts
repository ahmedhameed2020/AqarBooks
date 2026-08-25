"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { denyIfDemo } from "@/lib/demo/guard";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const createOrganizationSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(80).optional(),
  defaultCurrency: z.string().length(3).default("EGP"),
  planKey: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]).nullable(),
});

export type ActionResult<T extends object = object> =
  // `id` is optional and only set by actions whose forms need to link
  // somewhere after success (e.g. CreateUnitForm's toast action button) --
  // every other `{ ok: true }` caller is unaffected. `T` lets an action carry
  // extra success payload, under `data`, without every caller having to know
  // about it.
  | { ok: true; id?: string; data?: T }
  | { ok: false; error: string };

export async function createOrganization(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    defaultCurrency: formData.get("defaultCurrency") || "EGP",
    planKey: (formData.get("planKey") as string) || null,
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug || slugify(parsed.data.name),
    p_default_currency: parsed.data.defaultCurrency,
    p_plan_key: parsed.data.planKey,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/platform/organizations", "page");
  return { ok: true };
}

const statusSchema = z.object({
  organizationId: z.string().uuid(),
  status: z.enum(["TRIAL", "ACTIVE", "SUSPENDED", "ARCHIVED"]),
  reason: z.string().max(500).optional(),
});

export async function setOrganizationStatus(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = statusSchema.safeParse({
    organizationId: formData.get("organizationId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organization_status", {
    p_organization_id: parsed.data.organizationId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/platform/organizations", "page");
  revalidatePath("/[locale]/platform/organizations/[id]", "page");
  return { ok: true };
}

const subscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planKey: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]),
});

export async function assignSubscription(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = subscriptionSchema.safeParse({
    organizationId: formData.get("organizationId"),
    planKey: formData.get("planKey"),
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_subscription", {
    p_organization_id: parsed.data.organizationId,
    p_plan_key: parsed.data.planKey,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/platform/organizations/[id]", "page");
  return { ok: true };
}
