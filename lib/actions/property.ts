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
