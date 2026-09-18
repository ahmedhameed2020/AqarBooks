"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";

const optionalDate = z.preprocess((value) => value === "" ? null : value, z.string().date().nullable());

const requestSchema = z.object({
  leaseId: z.string().uuid(),
  proposedStartsOn: optionalDate,
  proposedEndsOn: optionalDate,
  proposedRentAmount: z.preprocess(
    (value) => value === "" || value === null ? null : Number(value),
    z.number().positive().nullable(),
  ),
  proposedRentFrequency: z.preprocess(
    (value) => value === "" || value === null ? null : value,
    z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]).nullable(),
  ),
  note: z.preprocess((value) => value === "" || value === null ? null : value, z.string().trim().max(1000).nullable()),
});

export async function requestLeaseRenewalAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse({
    leaseId: formData.get("leaseId"),
    proposedStartsOn: formData.get("proposedStartsOn"),
    proposedEndsOn: formData.get("proposedEndsOn"),
    proposedRentAmount: formData.get("proposedRentAmount"),
    proposedRentFrequency: formData.get("proposedRentFrequency"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, error: "INVALID_RENEWAL_INPUT" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_lease_renewal", {
    p_lease_id: parsed.data.leaseId,
    p_proposed_starts_on: parsed.data.proposedStartsOn,
    p_proposed_ends_on: parsed.data.proposedEndsOn,
    p_proposed_rent_amount: parsed.data.proposedRentAmount,
    p_proposed_rent_frequency: parsed.data.proposedRentFrequency,
    p_note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/portal/leases", "layout");
  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true, id: data };
}

const decisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.preprocess((value) => value === "" || value === null ? null : value, z.string().trim().max(1000).nullable()),
});

export async function decideLeaseRenewalAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
  });
  if (!parsed.success || (parsed.data.decision === "REJECTED" && !parsed.data.reason)) {
    return { ok: false, error: "LEASE_RENEWAL_DECISION_REASON_REQUIRED" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_lease_renewal", {
    p_request_id: parsed.data.requestId,
    p_decision: parsed.data.decision,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/property/[unitId]", "page");
  revalidatePath("/[locale]/portal/leases", "layout");
  return { ok: true };
}
