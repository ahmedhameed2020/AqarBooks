"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const PATH = "/[locale]/finance/tax-mapping";

/**
 * لا تحمل هذه الإجراءات أي تصريح بنفسها. التصريح كله في الـRPC، الذي يعيد فحص
 * `finance.tax_mapping.manage` مقابل المؤسسة المالكة لنوع المستحق — فمعرّف
 * مزوَّر في جسم النموذج لا يصل إلى مستأجر آخر.
 */

const setSchema = z.object({
  dueTypeId: z.string().uuid(),
  revenueNature: z.string().min(1).max(64),
  notes: z.string().max(500).optional(),
});

export async function setDueTypeRevenueNature(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = setSchema.safeParse({
    dueTypeId: formData.get("dueTypeId"),
    revenueNature: formData.get("revenueNature"),
    notes: (formData.get("notes") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_due_type_revenue_nature", {
    p_due_type_id: parsed.data.dueTypeId,
    p_revenue_nature: parsed.data.revenueNature,
    p_notes: parsed.data.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function approveDueTypeRevenueNature(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const mappingId = formData.get("mappingId");
  if (typeof mappingId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_due_type_revenue_nature", {
    p_mapping_id: mappingId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}

export async function revokeDueTypeRevenueNatureApproval(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const mappingId = formData.get("mappingId");
  const reason = (formData.get("reason") as string) || null;
  if (typeof mappingId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_due_type_revenue_nature_approval", {
    p_mapping_id: mappingId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(PATH, "page");
  return { ok: true };
}
