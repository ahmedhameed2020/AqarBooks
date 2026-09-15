"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const usagePolicySchema = z.enum(["SINGLE_USE", "MULTI_USE"]);

const createInvitationSchema = z.object({
  unitId: z.string().uuid(),
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().max(40).optional(),
  guestNote: z.string().trim().max(500).optional(),
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
  usagePolicy: usagePolicySchema.default("SINGLE_USE"),
});

const invitationIdSchema = z.object({
  invitationId: z.string().uuid(),
});

const qrPayloadSchema = z.object({
  qrPayload: z.string().trim().min(20).max(220),
});

export type VisitorInvitationActionResult =
  | {
      ok: true;
      invitationId: string;
      qrPayload: string;
    }
  | { ok: false; error: string };

export type VisitorActionResult = { ok: true } | { ok: false; error: string };

export type VisitorValidationResult =
  | {
      ok: true;
      valid: boolean;
      reasonCode: string;
      invitationId: string | null;
      organizationId: string | null;
      propertyId: string | null;
      unitId: string | null;
      usagePolicy: "SINGLE_USE" | "MULTI_USE" | null;
      validFrom: string | null;
      validUntil: string | null;
      guestName: string | null;
    }
  | { ok: false; error: string };

function mapVisitorError(message: string | undefined): string {
  if (!message) return "failed";
  if (message.includes("NOT_AUTHENTICATED")) return "unauthenticated";
  if (message.includes("VISITOR_MANAGEMENT_NOT_ENTITLED")) return "not_entitled";
  if (message.includes("UNIT_NOT_AUTHORIZED") || message.includes("VISITOR_INVITATION_NOT_AUTHORIZED")) return "forbidden";
  if (message.includes("UNIT_NOT_FOUND") || message.includes("VISITOR_INVITATION_NOT_FOUND")) return "not_found";
  if (message.includes("INVALID_VISITOR_TOKEN")) return "invalid_token";
  if (message.includes("INVALID_VISITOR_GUEST_NAME")) return "invalid_guest_name";
  if (message.includes("INVALID_VISITOR_GUEST_PHONE")) return "invalid_guest_phone";
  if (message.includes("INVALID_VISITOR_GUEST_NOTE")) return "invalid_guest_note";
  if (message.includes("INVALID_VISITOR_USAGE_POLICY")) return "invalid_usage_policy";
  if (
    message.includes("INVALID_VISITOR_VALIDITY_WINDOW") ||
    message.includes("VISITOR_PASS_ALREADY_EXPIRED") ||
    message.includes("VISITOR_PASS_WINDOW_TOO_LONG")
  ) return "invalid_validity_window";
  if (message.includes("ORGANIZATION_INACTIVE")) return "organization_inactive";
  return "failed";
}

function generateVisitorSecret() {
  return randomBytes(32).toString("base64url");
}

function hashVisitorSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function buildQrPayload(invitationId: string, secret: string) {
  return `AQP1.${invitationId}.${secret}`;
}

function parseQrPayload(payload: string): { invitationId: string; secret: string } | null {
  const [prefix, invitationId, secret] = payload.split(".");
  if (prefix !== "AQP1" || !invitationId || !secret) return null;
  if (!z.string().uuid().safeParse(invitationId).success) return null;
  return { invitationId, secret };
}

export async function createVisitorInvitationAction(
  input: z.input<typeof createInvitationSchema>,
): Promise<VisitorInvitationActionResult> {
  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const secret = generateVisitorSecret();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_visitor_invitation", {
    p_unit_id: parsed.data.unitId,
    p_token_hash: hashVisitorSecret(secret),
    p_token_hint: secret.slice(-8),
    p_guest_name: parsed.data.guestName,
    p_guest_phone: parsed.data.guestPhone || null,
    p_guest_note: parsed.data.guestNote || null,
    p_valid_from: parsed.data.validFrom,
    p_valid_until: parsed.data.validUntil,
    p_usage_policy: parsed.data.usagePolicy,
  });

  if (error || !data) {
    console.error("[createVisitorInvitationAction] failed:", error?.message);
    return { ok: false, error: mapVisitorError(error?.message) };
  }

  revalidatePath("/[locale]/portal/visitors", "page");
  revalidatePath("/[locale]/operations/visitors", "page");
  return { ok: true, invitationId: data, qrPayload: buildQrPayload(data, secret) };
}

export async function revokeVisitorInvitationAction(
  input: z.input<typeof invitationIdSchema>,
): Promise<VisitorActionResult> {
  const parsed = invitationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_visitor_invitation", {
    p_invitation_id: parsed.data.invitationId,
  });

  if (error) {
    console.error("[revokeVisitorInvitationAction] failed:", error.message);
    return { ok: false, error: mapVisitorError(error.message) };
  }

  revalidatePath("/[locale]/portal/visitors", "page");
  revalidatePath("/[locale]/portal/visitors/[invitationId]", "page");
  revalidatePath("/[locale]/operations/visitors", "page");
  revalidatePath("/[locale]/operations/visitors/[invitationId]", "page");
  return { ok: true };
}

export async function validateVisitorPassTokenAction(
  input: z.input<typeof qrPayloadSchema>,
): Promise<VisitorValidationResult> {
  const parsed = qrPayloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const payload = parseQrPayload(parsed.data.qrPayload);
  if (!payload) return { ok: false, error: "invalid_qr_payload" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("validate_visitor_pass_token", {
    p_invitation_id: payload.invitationId,
    p_raw_secret: payload.secret,
  });

  const result = data?.[0];
  if (error || !result) {
    console.error("[validateVisitorPassTokenAction] failed:", error?.message);
    return { ok: false, error: mapVisitorError(error?.message) };
  }

  return {
    ok: true,
    valid: result.valid,
    reasonCode: result.reason_code,
    invitationId: result.invitation_id,
    organizationId: result.organization_id,
    propertyId: result.property_id,
    unitId: result.unit_id,
    usagePolicy: result.usage_policy,
    validFrom: result.valid_from,
    validUntil: result.valid_until,
    guestName: result.guest_name,
  };
}
