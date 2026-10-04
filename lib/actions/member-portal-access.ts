"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { staffDeps } from "@/lib/portal-access/server";
import {
  issueActivation,
  issueTemporaryAccess,
  reactivatePortal,
  signOutEverywhere,
  suspendPortal,
  errorCode,
  type ActivationIssued,
  type Failure,
  type Lifecycle,
  type TempAccessIssued,
} from "@/lib/portal-access/orchestrate";

// Thin wrappers: authenticate, validate input, delegate. Authorization itself
// (permission + tenant) is enforced inside the database functions, so there is
// no code path here that could skip it.

const memberIdSchema = z.string().uuid();
const langSchema = z.enum(["ar", "en"]);

const UNAUTHENTICATED: Failure = { ok: false, error: "UNAUTHENTICATED" };
const INVALID_INPUT: Failure = { ok: false, error: "INVALID_INPUT" };

export type PortalAccessState = {
  status: "not_activated" | "pending" | "active" | "suspended";
  login_method: "email" | "client_id" | null;
  client_id: string | null;
  activated_at: string | null;
  last_sign_in_at: string | null;
  units_count: number;
  eligible: boolean;
  has_email: boolean;
  member_email: string | null;
  member_phone: string | null;
  must_change_password: boolean;
  temp_password_expires_at: string | null;
  temp_expired: boolean;
  suspended_at: string | null;
  pending_activation_expires_at: string | null;
  activation_link_expired: boolean;
  last_delivery_status: "not_sent" | "sent" | "failed" | null;
  email_verification: "verified" | "pending_email_verification" | null;
  shared_identity: boolean;
  legacy_linked: boolean;
  can_manage: boolean;
};

export async function getPortalAccessAction(
  memberId: string,
): Promise<{ ok: true; state: PortalAccessState } | Failure> {
  if (!memberIdSchema.safeParse(memberId).success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  const deps = await staffDeps();
  const res = await deps.rpc("get_member_portal_access", { p_member_id: memberId });
  if (res.error) return { ok: false, error: errorCode(res.error.message) };
  return { ok: true, state: res.data as PortalAccessState };
}

export async function issueActivationAction(memberId: string, lang: string): Promise<ActivationIssued | Failure> {
  const l = langSchema.safeParse(lang);
  if (!memberIdSchema.safeParse(memberId).success || !l.success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return issueActivation(await staffDeps(), memberId, l.data);
}

export async function issueTemporaryAccessAction(memberId: string, lang: string): Promise<TempAccessIssued | Failure> {
  const l = langSchema.safeParse(lang);
  if (!memberIdSchema.safeParse(memberId).success || !l.success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return issueTemporaryAccess(await staffDeps(), memberId, l.data);
}

export async function revokeActivationLinkAction(memberId: string): Promise<{ ok: true } | Failure> {
  if (!memberIdSchema.safeParse(memberId).success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  const deps = await staffDeps();
  const res = await deps.rpc("revoke_member_activation", { p_member_id: memberId });
  return res.error ? { ok: false, error: errorCode(res.error.message) } : { ok: true };
}

export async function suspendPortalAction(memberId: string, reason?: string): Promise<Lifecycle> {
  if (!memberIdSchema.safeParse(memberId).success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return suspendPortal(await staffDeps(), memberId, reason?.trim() ? reason.trim().slice(0, 200) : null);
}

export async function reactivatePortalAction(memberId: string): Promise<Lifecycle> {
  if (!memberIdSchema.safeParse(memberId).success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return reactivatePortal(await staffDeps(), memberId);
}

export async function signOutEverywhereAction(memberId: string): Promise<Lifecycle> {
  if (!memberIdSchema.safeParse(memberId).success) return INVALID_INPUT;
  if (!(await getCurrentUser())) return UNAUTHENTICATED;
  return signOutEverywhere(await staffDeps(), memberId);
}
