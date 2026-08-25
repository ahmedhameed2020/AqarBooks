"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/platform";
import { denyIfDemo } from "@/lib/demo/guard";

const schema = z.object({
  leaseId: z.string().uuid(),
  eventType: z.enum(["RECEIVED", "REFUNDED", "DEDUCTED"]),
  amount: z.coerce.number().positive(),
  settlementAccountId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  eventDate: z.string().min(1),
});

export async function recordDepositEvent(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = schema.safeParse({
    leaseId: formData.get("leaseId"),
    eventType: formData.get("eventType"),
    amount: formData.get("amount"),
    settlementAccountId: formData.get("settlementAccountId"),
    reason: (formData.get("reason") as string) || undefined,
    eventDate: formData.get("eventDate"),
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const d = parsed.data;

  // Mirrors the database check so the operator is told before a round trip.
  if (d.eventType !== "RECEIVED" && !d.reason?.trim()) {
    return { ok: false, error: "reason_required" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_lease_deposit_event", {
    p_lease_id: d.leaseId,
    p_event_type: d.eventType,
    p_amount: d.amount,
    p_settlement_account_id: d.settlementAccountId,
    p_reason: d.reason ?? null,
    p_event_date: d.eventDate,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/[locale]/property/[unitId]", "page");
  return { ok: true };
}
