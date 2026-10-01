"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const reason = z.string().trim().min(1).max(500);
const manualExceptionSchema = z.object({
  gateId: z.string().uuid(),
  invitationId: z.string().uuid().nullish(),
  direction: z.enum(["ENTRY", "EXIT"]),
  outcome: z.enum(["ENTERED", "EXITED", "DENIED"]),
  category: z.enum(["POLICY_EXCEPTION", "EMERGENCY", "CONNECTIVITY_FAILURE", "MISSED_SCAN", "OTHER"]),
  reason,
  sourceEventId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
}).refine((value) => value.outcome === "DENIED"
  || (value.direction === "ENTRY" && value.outcome === "ENTERED")
  || (value.direction === "EXIT" && value.outcome === "EXITED"));
const approvalSchema = z.object({ exceptionId: z.string().uuid(), reason });
const reconciliationSchema = z.object({
  gateId: z.string().uuid(),
  invitationId: z.string().uuid(),
  isInside: z.boolean(),
  category: z.enum(["MISSED_SCAN", "STATE_CORRECTION", "OTHER"]),
  reason,
});

export type GateSupervisionResult = { ok: true; id: string } | { ok: false; error: string };

function result(data: string | null, error: { message: string } | null): GateSupervisionResult {
  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("NOT_AUTHENTICATED")) return { ok: false, error: "unauthenticated" };
    if (message.includes("NOT_AUTHORIZED")) return { ok: false, error: "forbidden" };
    if (message.includes("SELF_APPROVAL")) return { ok: false, error: "self_approval" };
    if (message.includes("ALREADY_APPROVED")) return { ok: false, error: "already_approved" };
    if (message.includes("STATE_UNCHANGED")) return { ok: false, error: "state_unchanged" };
    if (message.includes("INVALID_")) return { ok: false, error: "invalid_input" };
    return { ok: false, error: "failed" };
  }
  revalidatePath("/[locale]/operations/gates", "page");
  revalidatePath("/[locale]/operations/access-events", "page");
  revalidatePath("/[locale]/operations/gate/occupancy", "page");
  return { ok: true, id: data };
}

export async function createGateManualExceptionAction(input: z.input<typeof manualExceptionSchema>): Promise<GateSupervisionResult> {
  const parsed = manualExceptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const db = await createClient();
  const { data, error } = await db.rpc("create_gate_manual_exception", {
    p_gate_id: parsed.data.gateId, p_invitation_id: parsed.data.invitationId ?? null,
    p_direction: parsed.data.direction, p_outcome: parsed.data.outcome,
    p_category: parsed.data.category, p_reason: parsed.data.reason,
    p_source_event_id: parsed.data.sourceEventId, p_device_id: parsed.data.deviceId,
  });
  return result(data, error);
}

export async function approveGateManualExceptionAction(input: z.input<typeof approvalSchema>): Promise<GateSupervisionResult> {
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const db = await createClient();
  const { data, error } = await db.rpc("approve_gate_manual_exception", {
    p_exception_id: parsed.data.exceptionId, p_reason: parsed.data.reason,
  });
  return result(data, error);
}

export async function reconcileVisitorAccessStateAction(input: z.input<typeof reconciliationSchema>): Promise<GateSupervisionResult> {
  const parsed = reconciliationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const db = await createClient();
  const { data, error } = await db.rpc("reconcile_visitor_access_state", {
    p_gate_id: parsed.data.gateId, p_invitation_id: parsed.data.invitationId,
    p_is_inside: parsed.data.isInside, p_category: parsed.data.category, p_reason: parsed.data.reason,
  });
  return result(data, error);
}
