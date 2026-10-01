"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createHash } from "node:crypto";
import { generateDeviceSecret } from "@/lib/gates/device-credentials";
import { createClient } from "@/lib/supabase/server";

const directionSchema = z.enum(["ENTRY", "EXIT", "BOTH"]);
const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const createEnrollmentSchema = z.object({
  gateId: z.string().uuid(),
  direction: directionSchema,
});

const redeemEnrollmentSchema = z.object({
  installationId: secretSchema.optional(),
  enrollmentId: z.string().uuid(),
  code: secretSchema,
  displayName: z.string().trim().min(1).max(120),
});

const revokeDeviceSchema = z.object({
  deviceId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

type GateDeviceActionFailure = { ok: false; error: string };

export type CreateGateDeviceEnrollmentResult =
  | {
      ok: true;
      enrollmentId: string;
      code: string;
      hint: string;
      expiresAt: string;
    }
  | GateDeviceActionFailure;

export type RedeemGateDeviceEnrollmentResult =
  | {
      ok: true;
      deviceId: string;
      installationId: string;
      deviceCredential: string;
      gateId: string;
      allowedDirection: "ENTRY" | "EXIT" | "BOTH";
      displayName: string;
    }
  | GateDeviceActionFailure;

export type RevokeGateDeviceResult = { ok: true } | GateDeviceActionFailure;

export async function releaseGateDeviceAction(deviceId: string, credential: string): Promise<RevokeGateDeviceResult> {
  if (!z.string().uuid().safeParse(deviceId).success || !secretSchema.safeParse(credential).success) return { ok: false, error: "invalid_input" };
  const db = await createClient();
  const { error } = await db.rpc("release_gate_device", { p_device_id: deviceId, p_credential: credential });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

function mapGateDeviceError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("NOT_AUTHORIZED") || message.includes("GATE_DEVICE_NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("GATE_DEVICE_ALREADY_REVOKED")) return "already_revoked";
  if (message.includes("ENROLLMENT_EXPIRED") || message.includes("ENROLLMENT_ALREADY_REDEEMED")) {
    return "enrollment_unavailable";
  }
  if (message.includes("NOT_FOUND")) return "not_found";
  if (message.includes("INVALID_DEVICE_DIRECTION")) return "invalid_direction";
  if (message.includes("INVALID_")) return "invalid_input";
  return "failed";
}

function revalidateGateDevices() {
  revalidatePath("/[locale]/operations/gates", "page");
}

export async function createGateDeviceEnrollmentAction(
  input: z.input<typeof createEnrollmentSchema>,
): Promise<CreateGateDeviceEnrollmentResult> {
  const parsed = createEnrollmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const code = generateDeviceSecret();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_gate_device_enrollment", {
    p_gate_id: parsed.data.gateId,
    p_direction: parsed.data.direction,
    p_code_hash: code.sha256,
    p_expires_at: expiresAt,
  });

  if (error || !data) {
    console.error("[createGateDeviceEnrollmentAction] failed:", mapGateDeviceError(error?.message));
    return { ok: false, error: mapGateDeviceError(error?.message) };
  }

  revalidateGateDevices();
  return {
    ok: true,
    enrollmentId: data,
    code: code.raw,
    hint: code.hint,
    expiresAt,
  };
}

export async function redeemGateDeviceEnrollmentAction(
  input: z.input<typeof redeemEnrollmentSchema>,
): Promise<RedeemGateDeviceEnrollmentResult> {
  const parsed = redeemEnrollmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const installation = parsed.data.installationId
    ? { raw: parsed.data.installationId, sha256: createHash("sha256").update(parsed.data.installationId).digest("hex") }
    : generateDeviceSecret();
  const credential = generateDeviceSecret();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_gate_device_enrollment", {
    p_enrollment_id: parsed.data.enrollmentId,
    p_code: parsed.data.code,
    p_installation_id_hash: installation.sha256,
    p_credential_hash: credential.sha256,
    p_display_name: parsed.data.displayName,
  });

  if (error || !data) {
    console.error("[redeemGateDeviceEnrollmentAction] failed:", mapGateDeviceError(error?.message));
    return { ok: false, error: mapGateDeviceError(error?.message) };
  }

  revalidateGateDevices();
  return {
    ok: true,
    deviceId: data.id,
    installationId: installation.raw,
    deviceCredential: credential.raw,
    gateId: data.gate_id,
    allowedDirection: data.allowed_direction,
    displayName: data.display_name,
  };
}

export async function revokeGateDeviceAction(
  input: z.input<typeof revokeDeviceSchema>,
): Promise<RevokeGateDeviceResult> {
  const parsed = revokeDeviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_gate_device", {
    p_device_id: parsed.data.deviceId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    console.error("[revokeGateDeviceAction] failed:", mapGateDeviceError(error.message));
    return { ok: false, error: mapGateDeviceError(error.message) };
  }

  revalidateGateDevices();
  return { ok: true };
}
