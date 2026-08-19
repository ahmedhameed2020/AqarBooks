"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/assets";

/**
 * Authorization lives in the database, not here: the insert is gated by the
 * `fixed_assets_manage` RLS policy and the run is gated inside
 * `post_depreciation_for_period`. Re-checking in the action would be a second
 * copy of the rule, and the second copy is the one that drifts.
 */

const assetSchema = z.object({
  organizationId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  code: z.string().min(1).max(40),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  assetAccountId: z.string().uuid(),
  accumulatedAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  acquisitionDate: z.string().min(1),
  // Coerced because a form always sends strings. The bounds that actually
  // matter (salvage below cost, positive life) are database constraints, so
  // they cannot be bypassed by calling the action directly.
  acquisitionCost: z.coerce.number().positive(),
  salvageValue: z.coerce.number().min(0),
  usefulLifeMonths: z.coerce.number().int().positive(),
});

export async function createFixedAsset(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = assetSchema.safeParse({
    organizationId: formData.get("organizationId"),
    propertyId: (formData.get("propertyId") as string) || undefined,
    code: formData.get("code"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    assetAccountId: formData.get("assetAccountId"),
    accumulatedAccountId: formData.get("accumulatedAccountId"),
    expenseAccountId: formData.get("expenseAccountId"),
    acquisitionDate: formData.get("acquisitionDate"),
    acquisitionCost: formData.get("acquisitionCost"),
    salvageValue: formData.get("salvageValue") || 0,
    usefulLifeMonths: formData.get("usefulLifeMonths"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("fixed_assets").insert({
    organization_id: d.organizationId,
    property_id: d.propertyId ?? null,
    code: d.code,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    asset_account_id: d.assetAccountId,
    accumulated_depreciation_account_id: d.accumulatedAccountId,
    depreciation_expense_account_id: d.expenseAccountId,
    acquisition_date: d.acquisitionDate,
    acquisition_cost: d.acquisitionCost,
    salvage_value: d.salvageValue,
    useful_life_months: d.usefulLifeMonths,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

const runSchema = z.object({
  organizationId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
});

export async function runDepreciation(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = runSchema.safeParse({
    organizationId: formData.get("organizationId"),
    fiscalPeriodId: formData.get("fiscalPeriodId"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_depreciation_for_period", {
    p_organization_id: parsed.data.organizationId,
    p_fiscal_period_id: parsed.data.fiscalPeriodId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  // The count travels back so the screen can say "posted 3" or "nothing to
  // post" -- a run that legitimately posts nothing must not look like a
  // failure, because re-running a closed month is the normal case.
  return { ok: true, id: String(data ?? 0) };
}
