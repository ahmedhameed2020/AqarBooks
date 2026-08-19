"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const PATH = "/[locale]/finance/dunning";

/**
 * Every rule here lives in the database: which stage a debt has reached, the
 * minimum worth chasing, one notice per stage, and the refusal to call a notice
 * delivered without a real time and channel. None is re-checked in this file,
 * because a second copy of a rule is the one that drifts.
 */

const policySchema = z.object({
  organizationId: z.string().uuid(),
  stage: z.coerce.number().int().positive(),
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  daysOverdue: z.coerce.number().int().min(0),
  minimumAmount: z.coerce.number().min(0),
});

export async function saveDunningPolicy(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = policySchema.safeParse({
    organizationId: formData.get("organizationId"),
    stage: formData.get("stage"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    daysOverdue: formData.get("daysOverdue"),
    minimumAmount: formData.get("minimumAmount") || 0,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  const supabase = await createClient();
  // Upsert on (organization, stage): editing stage 2 must change stage 2, not
  // add a second one -- the unique constraint would refuse it anyway, and an
  // error where the operator expected an edit is a worse answer than an edit.
  const { error } = await supabase.from("dunning_policies").upsert(
    {
      organization_id: d.organizationId,
      stage: d.stage,
      name_ar: d.nameAr,
      name_en: d.nameEn,
      days_overdue: d.daysOverdue,
      minimum_amount: d.minimumAmount,
    },
    { onConflict: "organization_id,stage" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

const raiseSchema = z.object({
  organizationId: z.string().uuid(),
  stage: z.coerce.number().int().positive(),
});

export async function raiseDunningStage(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = raiseSchema.safeParse({
    organizationId: formData.get("organizationId"),
    stage: formData.get("stage"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("raise_dunning_notices", {
    p_organization_id: parsed.data.organizationId,
    p_stage: parsed.data.stage,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  // The count comes back so the screen can say how many were raised, or say
  // plainly that there was nothing to raise -- which is a success, not a fault.
  return { ok: true, id: String(data ?? 0) };
}

const deliverySchema = z.object({
  noticeId: z.string().uuid(),
  // Only channels a HUMAN can perform. There is no automated sender in this
  // system, so there is no value here that the software could claim on its own.
  channel: z.enum([
    "PRINTED",
    "HAND_DELIVERED",
    "PHONE",
    "EMAIL_EXTERNAL",
    "WHATSAPP_EXTERNAL",
    "POST",
  ]),
  reference: z.string().max(200).optional(),
});

export async function recordDunningDelivery(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deliverySchema.safeParse({
    noticeId: formData.get("noticeId"),
    channel: formData.get("channel"),
    reference: (formData.get("reference") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_dunning_delivery", {
    p_notice_id: parsed.data.noticeId,
    p_channel: parsed.data.channel,
    p_reference: parsed.data.reference ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
