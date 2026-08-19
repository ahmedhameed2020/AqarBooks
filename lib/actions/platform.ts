"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
  ownerEmail: z.string().email().optional().or(z.literal("")),
  ownerFullName: z.string().max(150).optional().or(z.literal("")),
});

export type ActionResult<T extends object = object> =
  | { ok: true; id?: string; data?: T }
  | { ok: false; error: string };

export async function createOrganization(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ownerEmailRaw = formData.get("ownerEmail");
  const ownerFullNameRaw = formData.get("ownerFullName");

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    defaultCurrency: formData.get("defaultCurrency") || "EGP",
    planKey: (formData.get("planKey") as string) || null,
    ownerEmail: ownerEmailRaw ? String(ownerEmailRaw).trim() : undefined,
    ownerFullName: ownerFullNameRaw ? String(ownerFullNameRaw).trim() : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createClient();
  const { data: newOrgId, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug || slugify(parsed.data.name),
    p_default_currency: parsed.data.defaultCurrency,
    p_plan_key: parsed.data.planKey,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // If client owner email is provided, send invitation and setup organization admin
  if (parsed.data.ownerEmail && newOrgId) {
    const admin = createAdminClient();
    const email = parsed.data.ownerEmail.toLowerCase();
    let ownerUserId: string | null = null;

    // 1. Try to invite via Supabase Auth email dispatch
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: parsed.data.ownerFullName || parsed.data.name },
    });

    if (inviteData?.user) {
      ownerUserId = inviteData.user.id;
    } else {
      // User might already exist in auth, look them up
      const { data: listData } = await admin.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email);

      if (existing) {
        ownerUserId = existing.id;
      } else {
        // Fallback create user directly
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: parsed.data.ownerFullName || parsed.data.name },
        });
        if (created?.user) {
          ownerUserId = created.user.id;
        }
      }
    }

    if (ownerUserId) {
      // 2. Add membership
      await admin
        .from("organization_memberships")
        .upsert({
          organization_id: newOrgId,
          user_id: ownerUserId,
          status: "active",
        });

      // 3. Find ORG_ADMIN role for this organization
      const { data: roleData } = await admin
        .from("roles")
        .select("id")
        .eq("organization_id", newOrgId)
        .eq("key", "ORG_ADMIN")
        .maybeSingle();

      if (roleData) {
        await admin
          .from("user_role_assignments")
          .insert({
            organization_id: newOrgId,
            user_id: ownerUserId,
            role_id: roleData.id,
          });
      }

      // 4. Update profile name
      if (parsed.data.ownerFullName) {
        await admin
          .from("profiles")
          .upsert({
            id: ownerUserId,
            full_name: parsed.data.ownerFullName,
          });
      }
    }
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
