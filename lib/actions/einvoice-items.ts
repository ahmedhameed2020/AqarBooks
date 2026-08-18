"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/einvoice-items";

/**
 * Authorization lives in the RPCs, not here: each re-checks
 * finance.einvoice.manage against the organization that owns the row, so a
 * forged id in the form body cannot reach another tenant.
 */

const itemSchema = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(1).max(64),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  unitCode: z.string().min(1).max(10),
  // Code and its type travel together; the database refuses one without the
  // other, and the form mirrors that rather than silently dropping one.
  itemCodeType: z.enum(["EGS", "GS1"]).optional(),
  itemCode: z.string().max(64).optional(),
});

export async function saveCatalogueItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = itemSchema.safeParse({
    organizationId: formData.get("organizationId"),
    code: formData.get("code"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    unitCode: (formData.get("unitCode") as string) || "EA",
    itemCodeType: (formData.get("itemCodeType") as string) || undefined,
    itemCode: (formData.get("itemCode") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_catalogue_item", {
    p_organization_id: d.organizationId,
    p_code: d.code,
    p_name_ar: d.nameAr,
    p_name_en: d.nameEn,
    p_unit_code: d.unitCode,
    p_item_code_type: d.itemCodeType ?? null,
    p_item_code: d.itemCode ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function linkDueTypeToItem(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const dueTypeId = formData.get("dueTypeId");
  const itemId = (formData.get("catalogueItemId") as string) || null;
  if (typeof dueTypeId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_due_type_catalogue_item", {
    p_due_type_id: dueTypeId,
    p_catalogue_item_id: itemId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
