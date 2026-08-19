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
  taxJurisdiction: z.enum(["EG", "SA", "AE", "EG_ETA", "SA_ZATCA", "AE_PEPPOL"]).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  entityType: z.string().max(100).optional().nullable(),
});

export async function updateOrganizationProfile(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    defaultCurrency: formData.get("defaultCurrency") || "EGP",
    taxJurisdiction: formData.get("taxJurisdiction") || undefined,
    taxId: formData.get("taxId") || undefined,
    address: formData.get("address") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    entityType: formData.get("entityType") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  
  // Normalize jurisdiction
  let jur = parsed.data.taxJurisdiction || "EG";
  if (jur === "EG_ETA") jur = "EG";
  if (jur === "SA_ZATCA") jur = "SA";
  if (jur === "AE_PEPPOL") jur = "AE";

  const eInvoiceJur = jur === "EG" ? "EG_ETA" : jur === "SA" ? "SA_ZATCA" : "AE_PEPPOL";

  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      default_currency: parsed.data.defaultCurrency,
      tax_jurisdiction: jur,
      tax_id: parsed.data.taxId || null,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      entity_type: parsed.data.entityType || null,
    })
    .eq("id", parsed.data.organizationId);

  if (error) return { ok: false, error: error.message };

  // Automated Tax Integration Sync:
  // Automatically upsert or update the corresponding E-Invoice profile for this jurisdiction
  if (parsed.data.taxId) {
    try {
      await supabase.rpc("upsert_einvoice_profile", {
        p_organization_id: parsed.data.organizationId,
        p_jurisdiction: eInvoiceJur,
        p_environment: "SANDBOX",
        p_taxpayer_id: parsed.data.taxId,
        p_branch_code: "0",
        p_activity_code: null,
      });
    } catch {
      // Non-blocking sync fallback
    }
  }

  revalidatePath("/[locale]/admin", "page");
  revalidatePath("/[locale]/finance/einvoice", "page");
  return { ok: true };
}

const createResortSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z.string().min(1).max(20),
  timezone: z.string().min(1).max(60).default("Africa/Cairo"),
  propertyType: z.enum(["resort", "building", "residential_unit", "commercial_unit"]).default("resort"),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
});

export async function createResortAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const addressVal = formData.get("address");
  const phoneVal = formData.get("phone");

  const parsed = createResortSchema.safeParse({
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone") || "Africa/Cairo",
    propertyType: formData.get("propertyType") || "resort",
    address: addressVal ? String(addressVal) : null,
    phone: phoneVal ? String(phoneVal) : null,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data: newResortId, error } = await supabase.rpc("create_resort", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
    p_timezone: parsed.data.timezone,
    p_address: parsed.data.address ?? null,
    p_phone: parsed.data.phone ?? null,
  });

  if (error) return { ok: false, error: error.message };

  if (newResortId && parsed.data.propertyType) {
    await supabase
      .from("resorts")
      .update({ property_type: parsed.data.propertyType })
      .eq("id", newResortId);
  }

  revalidatePath("/[locale]/admin/resorts", "page");
  return { ok: true };
}

const updateResortSchema = z.object({
  resortId: z.string().uuid(),
  name: z.string().min(2).max(200),
  code: z.string().min(1).max(20),
  timezone: z.string().min(1).max(60).default("Africa/Cairo"),
  propertyType: z.enum(["resort", "building", "residential_unit", "commercial_unit"]).default("resort"),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
});

export async function updateResortAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const addressVal = formData.get("address");
  const phoneVal = formData.get("phone");

  const parsed = updateResortSchema.safeParse({
    resortId: formData.get("resortId"),
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone") || "Africa/Cairo",
    propertyType: formData.get("propertyType") || "resort",
    address: addressVal ? String(addressVal) : null,
    phone: phoneVal ? String(phoneVal) : null,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_resort", {
    p_resort_id: parsed.data.resortId,
    p_name: parsed.data.name,
    p_code: parsed.data.code,
    p_timezone: parsed.data.timezone,
    p_address: parsed.data.address ?? null,
    p_phone: parsed.data.phone ?? null,
  });

  if (error) return { ok: false, error: error.message };

  if (parsed.data.propertyType) {
    await supabase
      .from("resorts")
      .update({ property_type: parsed.data.propertyType })
      .eq("id", parsed.data.resortId);
  }

  revalidatePath("/[locale]/admin/resorts", "page");
  return { ok: true };
}

const deleteResortSchema = z.object({
  resortId: z.string().uuid(),
});

export async function deleteResortAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteResortSchema.safeParse({
    resortId: formData.get("resortId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_resort", {
    p_resort_id: parsed.data.resortId,
  });

  if (error) {
    if (error.message.includes("resort_has_units")) {
      return {
        ok: false,
        error: "لا يمكن حذف هذا الكيان العقاري لوجود وحدات مسجلة تحته. يرجى نقل أو حذف الوحدات أولاً.",
      };
    }
    return { ok: false, error: error.message };
  }

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
