"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";

const updateProfileSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  defaultCurrency: z.string().length(3),
});

export async function updateOrganizationProfile(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    defaultCurrency: formData.get("defaultCurrency"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, default_currency: parsed.data.defaultCurrency })
    .eq("id", parsed.data.organizationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/admin", "page");
  return { ok: true };
}

const createResortSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z.string().min(1).max(20),
  timezone: z.string().min(1).max(60).default("Africa/Cairo"),
});

export async function createResortAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createResortSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone") || "Africa/Cairo",
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_resort", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
    p_timezone: parsed.data.timezone,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/admin/resorts", "page");
  return { ok: true };
}

const inviteMemberSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  roleKey: z.string().min(1),
});

export async function inviteMemberAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inviteMemberSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
    roleKey: formData.get("roleKey"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  // Permission is (re-)enforced inside add_organization_member below; this
  // admin client call only creates/invites the auth user, which has no
  // organization concept of its own to authorize against.
  const adminClient = createAdminClient();
  const { data: invited, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(parsed.data.email);

  if (inviteError || !invited.user) {
    return { ok: false, error: inviteError?.message ?? "invite_failed" };
  }

  const supabase = await createClient();
  const { error: membershipError } = await supabase.rpc("add_organization_member", {
    p_organization_id: parsed.data.organizationId,
    p_user_id: invited.user.id,
    p_role_key: parsed.data.roleKey,
  });

  if (membershipError) {
    return { ok: false, error: membershipError.message };
  }

  revalidatePath("/[locale]/admin/users", "page");
  return { ok: true };
}
