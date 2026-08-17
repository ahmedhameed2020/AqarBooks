"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/platform";

const createUnitSchema = z
  .object({
    organizationId: z.string().uuid(),
    resortId: z.string().uuid(),
    code: z.string().min(1).max(50),
    unitType: z.enum(["VILLA", "CHALET", "APARTMENT", "SHOP", "OFFICE", "SERVICE", "OTHER"]),
    customTypeLabel: z.string().max(50).optional(),
    buildingId: z.string().uuid().optional(),
    zoneId: z.string().uuid().optional(),
    floorNumber: z.coerce.number().int().optional(),
    area: z.coerce.number().positive().optional(),
  })
  .refine((v) => v.unitType !== "OTHER" || Boolean(v.customTypeLabel?.trim()), {
    message: "custom_type_label_required",
    path: ["customTypeLabel"],
  });

export async function createUnitAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createUnitSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    code: formData.get("code"),
    unitType: formData.get("unitType"),
    customTypeLabel: formData.get("customTypeLabel") || undefined,
    buildingId: formData.get("buildingId") || undefined,
    zoneId: formData.get("zoneId") || undefined,
    floorNumber: formData.get("floorNumber") || undefined,
    area: formData.get("area") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("units").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    code: parsed.data.code,
    unit_type: parsed.data.unitType,
    custom_type_label: parsed.data.unitType === "OTHER" ? (parsed.data.customTypeLabel ?? null) : null,
    building_id: parsed.data.buildingId ?? null,
    zone_id: parsed.data.zoneId ?? null,
    floor_number: parsed.data.floorNumber ?? null,
    area: parsed.data.area ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property", "page");
  return { ok: true };
}

const createZoneSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional(),
});

export async function createZoneAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const nameAr = String(formData.get("nameAr") || "").trim();
  const nameEn = String(formData.get("nameEn") || "").trim() || nameAr;

  const parsed = createZoneSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    nameAr,
    nameEn,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("zones").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn || parsed.data.nameAr,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property", "page");
  return { ok: true };
}

const createBuildingSchema = z.object({
  organizationId: z.string().uuid(),
  resortId: z.string().uuid(),
  zoneId: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  nameAr: z.string().min(1).max(100),
  nameEn: z.string().max(100).optional(),
});

export async function createBuildingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const nameAr = String(formData.get("nameAr") || "").trim();
  const nameEn = String(formData.get("nameEn") || "").trim() || nameAr;

  const parsed = createBuildingSchema.safeParse({
    organizationId: formData.get("organizationId"),
    resortId: formData.get("resortId"),
    zoneId: formData.get("zoneId") || undefined,
    code: formData.get("code"),
    nameAr,
    nameEn,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("buildings").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    zone_id: parsed.data.zoneId ?? null,
    code: parsed.data.code,
    name_ar: parsed.data.nameAr,
    name_en: parsed.data.nameEn || parsed.data.nameAr,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property", "page");
  return { ok: true };
}

// Digits only, keeping a single leading "+" if present -- member_phones'
// normalized_phone column is used for the (member_id, normalized_phone)
// uniqueness check and the org-wide lookup index, so it needs to be
// consistent regardless of how a user formats the raw number (spaces,
// dashes, parentheses).
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

const phoneEntrySchema = z.object({
  number: z.string().min(7).max(30),
  label: z.enum(["PERSONAL", "WORK", "WHATSAPP", "HOME", "OTHER"]),
  whatsapp: z.boolean(),
  primary: z.boolean(),
});

const createMemberSchema = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal("")),
  isCompany: z.boolean(),
  phones: z.array(phoneEntrySchema),
});

export async function createMemberAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  let phonesRaw: unknown = [];
  try {
    phonesRaw = JSON.parse(String(formData.get("phones") ?? "[]"));
  } catch {
    return { ok: false, error: "invalid_input" };
  }

  const parsed = createMemberSchema.safeParse({
    organizationId: formData.get("organizationId"),
    fullName: formData.get("fullName"),
    email: formData.get("email") || undefined,
    isCompany: formData.get("isCompany") === "true",
    phones: phonesRaw,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  // Backward compat: members.phone (a single legacy column several other
  // views/exports/the WhatsApp reminder flow still read directly) is kept
  // populated with the primary number, even though member_phones is now
  // the source of truth for the full, multi-number, WhatsApp-flagged list.
  const primaryPhone = parsed.data.phones.find((p) => p.primary) ?? parsed.data.phones[0];

  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("members")
    .insert({
      organization_id: parsed.data.organizationId,
      full_name: parsed.data.fullName,
      email: parsed.data.email || null,
      phone: primaryPhone?.number || null,
      is_company: parsed.data.isCompany,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  if (parsed.data.phones.length > 0) {
    const { error: phonesError } = await supabase.from("member_phones").insert(
      parsed.data.phones.map((p) => ({
        organization_id: parsed.data.organizationId,
        member_id: member.id,
        phone_number: p.number,
        normalized_phone: normalizePhone(p.number),
        label: p.label,
        is_primary: p.primary,
        can_receive_whatsapp: p.whatsapp,
      })),
    );
    if (phonesError) {
      // The member row was already created -- clean it up rather than
      // leaving an orphaned member with none of the phone numbers the
      // user actually submitted.
      await supabase.from("members").delete().eq("id", member.id);
      return { ok: false, error: phonesError.message };
    }
  }

  revalidatePath("/[locale]/members", "page");
  return { ok: true };
}

const linkOwnershipSchema = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  memberId: z.string().uuid(),
  sharePercentage: z.coerce.number().positive().max(100).default(100),
  startDate: z.string().min(1).optional(),
});

export async function linkOwnershipAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = linkOwnershipSchema.safeParse({
    organizationId: formData.get("organizationId"),
    unitId: formData.get("unitId"),
    memberId: formData.get("memberId"),
    sharePercentage: formData.get("sharePercentage") || 100,
    startDate: formData.get("startDate") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.from("unit_ownerships").insert({
    organization_id: parsed.data.organizationId,
    unit_id: parsed.data.unitId,
    member_id: parsed.data.memberId,
    share_percentage: parsed.data.sharePercentage,
    start_date: parsed.data.startDate,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/members", "page");
  revalidatePath("/[locale]/property", "page");
  return { ok: true };
}

// Unit rental/occupancy (unit_leases). Every action below is a thin wrapper
// around a security-definer RPC that performs its own has_permission()
// check -- this file is never the authorization boundary, matching every
// other action here.

const createUnitLeaseSchema = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  tenantMemberId: z.string().uuid(),
  dueTypeId: z.string().uuid(),
  receivableAccountId: z.string().uuid(),
  rentAmount: z.coerce.number().positive(),
  rentFrequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  startsOn: z.string().min(1),
  endsOn: z.string().min(1).optional(),
  securityDepositAmount: z.coerce.number().min(0).default(0),
  billingRecipient: z.enum(["OWNER", "TENANT"]),
});

export async function createUnitLeaseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createUnitLeaseSchema.safeParse({
    organizationId: formData.get("organizationId"),
    unitId: formData.get("unitId"),
    tenantMemberId: formData.get("tenantMemberId"),
    dueTypeId: formData.get("dueTypeId"),
    receivableAccountId: formData.get("receivableAccountId"),
    rentAmount: formData.get("rentAmount"),
    rentFrequency: formData.get("rentFrequency"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn") || undefined,
    securityDepositAmount: formData.get("securityDepositAmount") || 0,
    billingRecipient: formData.get("billingRecipient"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_unit_lease", {
    p_organization_id: parsed.data.organizationId,
    p_unit_id: parsed.data.unitId,
    p_tenant_member_id: parsed.data.tenantMemberId,
    p_due_type_id: parsed.data.dueTypeId,
    p_receivable_account_id: parsed.data.receivableAccountId,
    p_rent_amount: parsed.data.rentAmount,
    p_rent_frequency: parsed.data.rentFrequency,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn ?? null,
    p_security_deposit_amount: parsed.data.securityDepositAmount,
    p_billing_recipient: parsed.data.billingRecipient,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const leaseIdSchema = z.object({ leaseId: z.string().uuid() });

export async function activateUnitLeaseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = leaseIdSchema.safeParse({ leaseId: formData.get("leaseId") });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_unit_lease", { p_lease_id: parsed.data.leaseId });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const endUnitLeaseSchema = z.object({
  leaseId: z.string().uuid(),
  endsOn: z.string().min(1),
  endReason: z.string().min(1),
});

export async function endUnitLeaseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = endUnitLeaseSchema.safeParse({
    leaseId: formData.get("leaseId"),
    endsOn: formData.get("endsOn"),
    endReason: formData.get("endReason"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_unit_lease", {
    p_lease_id: parsed.data.leaseId,
    p_ends_on: parsed.data.endsOn,
    p_end_reason: parsed.data.endReason,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const cancelUnitLeaseSchema = z.object({
  leaseId: z.string().uuid(),
  cancelReason: z.string().optional(),
});

export async function cancelUnitLeaseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cancelUnitLeaseSchema.safeParse({
    leaseId: formData.get("leaseId"),
    cancelReason: formData.get("cancelReason") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_unit_lease", {
    p_lease_id: parsed.data.leaseId,
    p_cancel_reason: parsed.data.cancelReason ?? null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const setBillingRecipientSchema = z.object({
  leaseId: z.string().uuid(),
  billingRecipient: z.enum(["OWNER", "TENANT"]),
});

export async function setUnitLeaseBillingRecipientAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setBillingRecipientSchema.safeParse({
    leaseId: formData.get("leaseId"),
    billingRecipient: formData.get("billingRecipient"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_unit_lease_billing_recipient", {
    p_lease_id: parsed.data.leaseId,
    p_billing_recipient: parsed.data.billingRecipient,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

// Unit purchase installment plans -- same pattern as the lease actions
// above: a thin zod-validated wrapper around a security-definer RPC that
// performs its own has_permission() check.

const createInstallmentPlanSchema = z.object({
  organizationId: z.string().uuid(),
  unitId: z.string().uuid(),
  buyerMemberId: z.string().uuid(),
  dueTypeId: z.string().uuid(),
  receivableAccountId: z.string().uuid(),
  totalPrice: z.coerce.number().positive(),
  downPayment: z.coerce.number().min(0).default(0),
  installmentCount: z.coerce.number().int().positive(),
  installmentFrequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  startsOn: z.string().min(1),
});

export async function createInstallmentPlanAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createInstallmentPlanSchema.safeParse({
    organizationId: formData.get("organizationId"),
    unitId: formData.get("unitId"),
    buyerMemberId: formData.get("buyerMemberId"),
    dueTypeId: formData.get("dueTypeId"),
    receivableAccountId: formData.get("receivableAccountId"),
    totalPrice: formData.get("totalPrice"),
    downPayment: formData.get("downPayment") || 0,
    installmentCount: formData.get("installmentCount"),
    installmentFrequency: formData.get("installmentFrequency"),
    startsOn: formData.get("startsOn"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_installment_plan", {
    p_organization_id: parsed.data.organizationId,
    p_unit_id: parsed.data.unitId,
    p_buyer_member_id: parsed.data.buyerMemberId,
    p_due_type_id: parsed.data.dueTypeId,
    p_receivable_account_id: parsed.data.receivableAccountId,
    p_total_price: parsed.data.totalPrice,
    p_down_payment: parsed.data.downPayment,
    p_installment_count: parsed.data.installmentCount,
    p_installment_frequency: parsed.data.installmentFrequency,
    p_starts_on: parsed.data.startsOn,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}

const cancelInstallmentPlanSchema = z.object({
  planId: z.string().uuid(),
  cancelReason: z.string().min(1),
});

export async function cancelInstallmentPlanAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cancelInstallmentPlanSchema.safeParse({
    planId: formData.get("planId"),
    cancelReason: formData.get("cancelReason"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_installment_plan", {
    p_plan_id: parsed.data.planId,
    p_cancel_reason: parsed.data.cancelReason,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}
