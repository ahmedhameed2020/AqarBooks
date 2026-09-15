"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const directionSchema = z.enum(["ENTRY", "EXIT"]);
const gateDirectionSchema = z.enum(["ENTRY", "EXIT", "BOTH"]);

const gateInputSchema = z.object({
  propertyId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  directionMode: gateDirectionSchema.default("BOTH"),
});

const updateGateInputSchema = z.object({
  gateId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  directionMode: gateDirectionSchema.default("BOTH"),
  isActive: z.boolean(),
});

const scanInputSchema = z.object({
  gateId: z.string().uuid(),
  qrPayload: z.string().trim().min(20).max(220),
  direction: directionSchema,
  clientScanId: z.string().uuid(),
});

export type GateActionResult =
  | { ok: true; gateId?: string }
  | { ok: false; error: string };

export type GateScanDecision = "ALLOW" | "DENY";

export type GateScanResult =
  | {
      ok: true;
      decision: GateScanDecision;
      reasonCode: string;
      eventId: string;
      guestName: string | null;
      invitationNo: string | null;
      unitId: string | null;
      invitationId: string | null;
      usagePolicy: "SINGLE_USE" | "MULTI_USE" | null;
      validUntil: string | null;
      isInside: boolean | null;
      gateId: string;
      propertyId: string;
      occurredAt: string;
    }
  | { ok: false; error: string };

function mapGateError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("NOT_ENTITLED")) return "not_entitled";
  if (message.includes("NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("NOT_FOUND")) return "not_found";
  if (message.includes("INVALID_GATE_CODE")) return "invalid_code";
  if (message.includes("INVALID_GATE_NAME")) return "invalid_name";
  if (message.includes("INVALID_GATE_DIRECTION")) return "invalid_direction";
  if (message.includes("INVALID_GATE_SCAN_INPUT")) return "invalid_input";
  if (message.includes("ORGANIZATION_INACTIVE")) return "organization_inactive";
  return "failed";
}

function parseQrPayload(payload: string): { invitationId: string; secret: string } | null {
  const [prefix, invitationId, secret] = payload.split(".");
  if (prefix !== "AQP1" || !invitationId || !secret) return null;
  if (!z.string().uuid().safeParse(invitationId).success) return null;
  return { invitationId, secret };
}

export async function createGateAction(
  input: z.input<typeof gateInputSchema>,
): Promise<GateActionResult> {
  const parsed = gateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_gate", {
    p_property_id: parsed.data.propertyId,
    p_code: parsed.data.code,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
    p_direction_mode: parsed.data.directionMode,
  });

  if (error || !data) {
    console.error("[createGateAction] failed:", error?.message);
    return { ok: false, error: mapGateError(error?.message) };
  }

  revalidatePath("/[locale]/operations/gates", "page");
  revalidatePath("/[locale]/operations/gate", "page");
  return { ok: true, gateId: data };
}

export async function updateGateAction(
  input: z.input<typeof updateGateInputSchema>,
): Promise<GateActionResult> {
  const parsed = updateGateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_gate", {
    p_gate_id: parsed.data.gateId,
    p_code: parsed.data.code,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
    p_direction_mode: parsed.data.directionMode,
    p_is_active: parsed.data.isActive,
  });

  if (error) {
    console.error("[updateGateAction] failed:", error.message);
    return { ok: false, error: mapGateError(error.message) };
  }

  revalidatePath("/[locale]/operations/gates", "page");
  revalidatePath("/[locale]/operations/gate", "page");
  return { ok: true, gateId: parsed.data.gateId };
}

export async function processVisitorGateScanAction(
  input: z.input<typeof scanInputSchema>,
): Promise<GateScanResult> {
  const parsed = scanInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const payload = parseQrPayload(parsed.data.qrPayload);
  if (!payload) return { ok: false, error: "invalid_qr_payload" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("process_visitor_gate_scan", {
    p_gate_id: parsed.data.gateId,
    p_invitation_id: payload.invitationId,
    p_raw_secret: payload.secret,
    p_direction: parsed.data.direction,
    p_client_scan_id: parsed.data.clientScanId,
  });

  const result = data?.[0];
  if (error || !result) {
    console.error("[processVisitorGateScanAction] failed:", error?.message);
    return { ok: false, error: mapGateError(error?.message) };
  }

  revalidatePath("/[locale]/operations/gate", "page");
  revalidatePath("/[locale]/operations/access-events", "page");
  return {
    ok: true,
    decision: result.decision as GateScanDecision,
    reasonCode: result.reason_code,
    eventId: result.event_id,
    guestName: result.guest_name,
    invitationNo: result.invitation_no,
    unitId: result.unit_id,
    invitationId: result.invitation_id,
    usagePolicy: result.usage_policy,
    validUntil: result.valid_until,
    isInside: result.is_inside,
    gateId: result.gate_id,
    propertyId: result.property_id,
    occurredAt: result.occurred_at,
  };
}
