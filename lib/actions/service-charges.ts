"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const LIST_PATH = "/[locale]/finance/service-charges";
const DETAIL_PATH = "/[locale]/finance/service-charges/[levyId]";

const createLevySchema = z.object({
  organizationId: z.string().uuid(),
  propertyId: z.string().uuid(),
  name: z.string().min(1).max(200),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  allocationBasis: z.enum(["AREA", "EQUAL", "CUSTOM"]),
  dueTypeId: z.string().uuid(),
  receivableAccountId: z.string().uuid(),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  note: z.string().max(500).optional(),
});

export async function createServiceChargeLevy(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createLevySchema.safeParse({
    organizationId: formData.get("organizationId"),
    propertyId: formData.get("propertyId"),
    name: formData.get("name"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    totalAmount: formData.get("totalAmount"),
    allocationBasis: formData.get("allocationBasis"),
    dueTypeId: formData.get("dueTypeId"),
    receivableAccountId: formData.get("receivableAccountId"),
    issueDate: formData.get("issueDate"),
    dueDate: formData.get("dueDate"),
    note: (formData.get("note") as string) || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;
  if (d.periodEnd < d.periodStart) return { ok: false, error: "period_order" };
  if (d.dueDate < d.issueDate) return { ok: false, error: "due_order" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_charge_levies")
    .insert({
      organization_id: d.organizationId,
      property_id: d.propertyId,
      name: d.name,
      period_start: d.periodStart,
      period_end: d.periodEnd,
      total_amount: d.totalAmount,
      allocation_basis: d.allocationBasis,
      due_type_id: d.dueTypeId,
      receivable_account_id: d.receivableAccountId,
      issue_date: d.issueDate,
      due_date: d.dueDate,
      note: d.note ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(LIST_PATH, "page");
  return { ok: true, id: data.id };
}

export async function computeAllocations(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const levyId = formData.get("levyId");
  if (typeof levyId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("compute_service_charge_allocations", {
    p_levy_id: levyId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(DETAIL_PATH, "page");
  return { ok: true };
}

/**
 * Edit one unit's weight under a CUSTOM basis. Shares are NOT recalculated
 * here -- the operator adjusts weights, then recomputes once, so a half-edited
 * weight set never produces a split that looks authoritative.
 */
export async function setAllocationWeight(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const allocationId = formData.get("allocationId");
  const weight = Number(formData.get("basisValue"));
  if (typeof allocationId !== "string") return { ok: false, error: "invalid_input" };
  if (!Number.isFinite(weight) || weight < 0) return { ok: false, error: "invalid_weight" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_charge_allocations")
    .update({ basis_value: weight })
    .eq("id", allocationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(DETAIL_PATH, "page");
  return { ok: true };
}

export async function issueLevy(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const levyId = formData.get("levyId");
  if (typeof levyId !== "string") return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_service_charge_levy", { p_levy_id: levyId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(DETAIL_PATH, "page");
  revalidatePath(LIST_PATH, "page");
  return { ok: true };
}
