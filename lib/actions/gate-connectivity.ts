"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const gateConnectivityIncidentSchema = z.object({
  deviceId: z.string().uuid(),
  deviceCredential: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/),
  gateId: z.string().uuid(),
  direction: z.enum(["ENTRY", "EXIT"]),
  clientScanId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  payloadFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  errorCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
});

export type GateConnectivityIncidentInput = z.input<typeof gateConnectivityIncidentSchema>;

export type GateConnectivityIncidentResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "not_authorized" | "failed" };

function mapConnectivityError(
  message: string | undefined,
): "invalid_input" | "not_authorized" | "failed" {
  if (message?.includes("NOT_AUTHENTICATED") || message?.includes("NOT_AUTHORIZED")) {
    return "not_authorized";
  }
  if (message?.includes("INVALID_GATE_CONNECTIVITY_INCIDENT")) return "invalid_input";
  return "failed";
}

export async function recordGateConnectivityIncidentAction(
  input: GateConnectivityIncidentInput,
): Promise<GateConnectivityIncidentResult> {
  const parsed = gateConnectivityIncidentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_gate_connectivity_incident" as never, {
    p_device_id: parsed.data.deviceId,
    p_device_credential: parsed.data.deviceCredential,
    p_gate_id: parsed.data.gateId,
    p_direction: parsed.data.direction,
    p_client_scan_id: parsed.data.clientScanId,
    p_occurred_at: parsed.data.occurredAt,
    p_payload_fingerprint: parsed.data.payloadFingerprint,
    p_error_code: parsed.data.errorCode,
  } as never);

  if (error) {
    console.error("[recordGateConnectivityIncidentAction] failed:", error.message);
    return { ok: false, error: mapConnectivityError(error.message) };
  }
  return { ok: true };
}
