// Orchestration of owner portal access, written against small interfaces so it
// can be tested without a network. The database functions (see
// supabase/migrations/20261004120000_owner_portal_access.sql) are the
// authority on WHO may do WHAT; this layer only sequences them with the two
// things SQL cannot do: calling the Supabase Auth admin API and sending email.
//
// Rule kept throughout: the Auth admin API is only ever called AFTER a
// permission-checked RPC has succeeded for that member.

import { clientIdToAlias, generateTempPassword, isAcceptablePassword, buildActivationUrl } from "./identity";
import { activationEmail, temporaryAccessWhatsApp, type Lang } from "./messages";

type RpcResult = { data: unknown; error: { message: string } | null };
export type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export interface AuthAdmin {
  createUser(attrs: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata?: Record<string, unknown>;
  }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  updateUserById(
    id: string,
    attrs: { password?: string; ban_duration?: string; email_confirm?: boolean },
  ): Promise<{ error: { message: string } | null }>;
  deleteUser(id: string): Promise<{ error: { message: string } | null }>;
  getUser(jwt: string): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null }>;
  /**
   * Ends every session of an identity through the Auth Admin API (never by
   * writing to managed auth tables). Supabase only offers sign-out by a user's
   * own JWT, so the implementation mints a one-off session for the identity
   * and signs it out with the global scope. See lib/portal-access/server.ts.
   */
  revokeAllSessions(userId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface Deps {
  /** The signed-in staff member; recorded as the actor on server-side audit entries. */
  actorId: string;
  /** RPC as the signed-in staff member (their JWT: permission checks see them). */
  rpc: Rpc;
  /** RPC as the service role, for the few functions granted to nobody else. */
  adminRpc: Rpc;
  auth: AuthAdmin;
  email: { configured: boolean; send(to: string, subject: string, html: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> };
  siteUrl: string;
}

export type Failure = { ok: false; error: string };

/** `CODE: human text` raised by the SQL functions -> `CODE`. */
export function errorCode(message: string | undefined): string {
  const match = /^([A-Z][A-Z_]{2,})\b/.exec(message ?? "");
  return match ? match[1] : "UNKNOWN";
}

const alreadyExists = (message: string | undefined) => /already|registered|exists/i.test(message ?? "");

const first = <T>(data: unknown): T | null => (Array.isArray(data) ? ((data[0] as T) ?? null) : ((data as T) ?? null));

// ------------------------------------------------------------------ email link

export type ActivationIssued = {
  ok: true;
  email: string;
  /**
   * What actually happened to the email. "sent" only when the provider accepted
   * it. Anything else leaves the email path PENDING_EMAIL_VERIFICATION and the
   * link does not exist: it is never handed to staff to deliver some other way.
   */
  emailStatus: "sent" | "not_sent" | "failed";
  pendingEmailVerification: boolean;
};

/**
 * The activation link proves ownership of the mailbox ONLY because it travels
 * by email and nowhere else. So: staff are authorized by the database; the
 * token is minted on the server and mailed; staff get back the outcome and
 * nothing that could be used to activate. If the email cannot be sent the token
 * is revoked and the owner stays pending_email_verification (staff are pointed
 * to the client-ID fallback).
 */
export async function issueActivation(deps: Deps, memberId: string, lang: Lang): Promise<ActivationIssued | Failure> {
  void lang;
  const requested = await deps.rpc("request_member_activation", { p_member_id: memberId });
  if (requested.error) return { ok: false, error: errorCode(requested.error.message) };
  const req = first<{ member_email: string; member_name: string; organization_id: string }>(requested.data);
  if (!req) return { ok: false, error: "UNKNOWN" };

  const pending = (emailStatus: ActivationIssued["emailStatus"]): ActivationIssued => ({
    ok: true,
    email: req.member_email,
    emailStatus,
    pendingEmailVerification: emailStatus !== "sent",
  });

  // No outbound email, no token: nothing is minted that could be misused.
  if (!deps.email.configured) return pending("not_sent");

  const minted = await deps.adminRpc("mint_member_activation_token", {
    p_member_id: memberId,
    p_actor: deps.actorId,
    p_valid_hours: 72,
  });
  if (minted.error) return { ok: false, error: errorCode(minted.error.message) };
  const row = first<{ token_id: string; raw_token: string; expires_at: string; member_email: string; member_name: string }>(minted.data);
  if (!row) return { ok: false, error: "UNKNOWN" };

  const mail = activationEmail({
    name: row.member_name,
    organizationName: null,
    url: buildActivationUrl(deps.siteUrl, row.raw_token),
    expiresAt: row.expires_at,
  });
  const sent = await deps.email.send(row.member_email, mail.subject, mail.html, mail.text);
  const status: ActivationIssued["emailStatus"] = sent.ok ? "sent" : "failed";

  // Recording "sent" is what makes the token usable; "failed" revokes it.
  const marked = await deps.adminRpc("mark_member_activation_delivery", {
    p_token_id: row.token_id,
    p_status: status,
    p_detail: sent.ok ? null : sent.error,
  });
  // If we cannot record the delivery the token stays unusable (still
  // 'not_sent'), so report the email as not usable rather than as success.
  if (marked.error) return pending("failed");
  return pending(status);
}

// --------------------------------------------------------- client id + password

export type TempAccessIssued = {
  ok: true;
  clientId: string;
  /** Shown to staff exactly once. Never stored, never logged. */
  temporaryPassword: string;
  expiresAt: string;
  whatsappText: string;
  regenerated: boolean;
};

const TEMP_HOURS = 72;

export async function issueTemporaryAccess(
  deps: Deps,
  memberId: string,
  lang: Lang,
  random?: (n: number) => Uint8Array,
): Promise<TempAccessIssued | Failure> {
  const begun = await deps.rpc("begin_member_temp_access", { p_member_id: memberId });
  if (begun.error) return { ok: false, error: errorCode(begun.error.message) };
  const b = first<{
    client_id: string;
    alias_email: string;
    auth_user_id: string | null;
    member_name: string;
    is_regeneration: boolean;
  }>(begun.data);
  if (!b) return { ok: false, error: "UNKNOWN" };

  // Defence in depth: the alias the database reserved must be the one the
  // client number maps to, or something upstream is wrong.
  if (clientIdToAlias(b.client_id) !== b.alias_email.toLowerCase()) return { ok: false, error: "ALIAS_MISMATCH" };

  const password = generateTempPassword(random);
  let authUserId = b.auth_user_id;
  let createdHere = false;

  if (authUserId) {
    const updated = await deps.auth.updateUserById(authUserId, { password });
    if (updated.error) return { ok: false, error: "AUTH_UPDATE_FAILED" };
  } else {
    const created = await deps.auth.createUser({
      email: b.alias_email,
      password,
      email_confirm: true,
      user_metadata: { full_name: b.member_name, portal_client_id: b.client_id },
    });
    if (created.data.user) {
      authUserId = created.data.user.id;
      createdHere = true;
    } else {
      // An earlier attempt may have created the identity and failed before
      // linking it. Adopt that orphan instead of failing forever -- but only
      // when the failure really is "already exists", not any other error.
      if (!alreadyExists(created.error?.message)) return { ok: false, error: "AUTH_CREATE_FAILED" };
      const found = await deps.adminRpc("portal_find_auth_user", { p_email: b.alias_email });
      const existing = typeof found.data === "string" ? found.data : null;
      if (!existing) return { ok: false, error: "AUTH_CREATE_FAILED" };
      const updated = await deps.auth.updateUserById(existing, { password });
      if (updated.error) return { ok: false, error: "AUTH_UPDATE_FAILED" };
      authUserId = existing;
    }
  }

  const finished = await deps.rpc("finish_member_temp_access", {
    p_member_id: memberId,
    p_auth_user_id: authUserId,
    p_valid_hours: TEMP_HOURS,
  });
  if (finished.error || typeof finished.data !== "string") {
    // Do not leave a freshly created identity nobody can reach.
    if (createdHere && authUserId) await deps.auth.deleteUser(authUserId);
    return { ok: false, error: errorCode(finished.error?.message) };
  }

  const expiresAt = finished.data;
  return {
    ok: true,
    clientId: b.client_id,
    temporaryPassword: password,
    expiresAt,
    regenerated: b.is_regeneration,
    whatsappText: temporaryAccessWhatsApp({
      lang,
      name: b.member_name,
      clientId: b.client_id,
      password,
      expiresAt,
      appUrl: deps.siteUrl,
    }),
  };
}

// ---------------------------------------------------- suspend / reactivate / out

const BAN_FOREVER = "876000h";

export type Lifecycle = { ok: true; warnings: string[] } | Failure;

export async function suspendPortal(deps: Deps, memberId: string, reason: string | null): Promise<Lifecycle> {
  const res = await deps.rpc("suspend_member_portal", { p_member_id: memberId, p_reason: reason });
  if (res.error) return { ok: false, error: errorCode(res.error.message) };
  const row = first<{ auth_user_id: string | null; should_ban: boolean }>(res.data);
  const warnings: string[] = [];

  // The database suspension above is authoritative (current_member_id() is now
  // NULL for this owner). Ending sessions and banning are belts on top of it, so
  // a failure there is reported, not fatal.
  //
  // They apply ONLY to an identity that exists for the owner alone. A staff
  // member who is also an owner shares one Auth identity: banning it, or ending
  // its sessions, would lock the employee out of their job. For them the owner
  // side is closed by RLS and the work side is left exactly as it was.
  if (row?.auth_user_id && row.should_ban) {
    // Sessions first: a banned identity can no longer mint the one-off session
    // the Admin API needs to end the others.
    const out = await deps.auth.revokeAllSessions(row.auth_user_id);
    if (!out.ok) warnings.push("sessions_not_revoked");
    await logSessionOutcome(deps, memberId, out.ok);
    const banned = await deps.auth.updateUserById(row.auth_user_id, { ban_duration: BAN_FOREVER });
    if (banned.error) warnings.push("ban_failed");
  }
  return { ok: true, warnings };
}

async function logSessionOutcome(deps: Deps, memberId: string, ok: boolean) {
  await deps.adminRpc("log_member_portal_event", {
    p_member_id: memberId,
    p_action: ok ? "member_portal.sessions_revoked" : "member_portal.sessions_revoke_failed",
    p_actor: deps.actorId,
    p_summary: { method: "admin_global_signout" },
  });
}

export async function reactivatePortal(deps: Deps, memberId: string): Promise<Lifecycle> {
  const res = await deps.rpc("reactivate_member_portal", { p_member_id: memberId });
  if (res.error) return { ok: false, error: errorCode(res.error.message) };
  const row = first<{ auth_user_id: string | null; should_unban: boolean }>(res.data);
  const warnings: string[] = [];
  if (row?.auth_user_id && row.should_unban) {
    const unbanned = await deps.auth.updateUserById(row.auth_user_id, { ban_duration: "none" });
    if (unbanned.error) warnings.push("unban_failed");
  }
  return { ok: true, warnings };
}

export async function signOutEverywhere(deps: Deps, memberId: string): Promise<Lifecycle> {
  const res = await deps.rpc("begin_member_signout", { p_member_id: memberId });
  if (res.error) return { ok: false, error: errorCode(res.error.message) };
  const row = first<{ auth_user_id: string; is_banned: boolean }>(res.data);
  if (!row) return { ok: false, error: "UNKNOWN" };

  // A suspended owner whose identity is banned cannot refresh any session, so
  // there is nothing left to end; their last access token simply runs out.
  if (row.is_banned) return { ok: true, warnings: ["already_blocked"] };

  const out = await deps.auth.revokeAllSessions(row.auth_user_id);
  await logSessionOutcome(deps, memberId, out.ok);
  if (!out.ok) return { ok: false, error: "SESSION_REVOKE_FAILED" };
  return { ok: true, warnings: [] };
}

// ------------------------------------------------------- owner opens the link

export type InspectResult =
  | { state: "not_found" | "expired" | "used" | "revoked" }
  | {
      state: "valid";
      memberName: string;
      organizationName: string | null;
      email: string;
      /** The address already has a VERIFIED identity: it must sign in to be linked. */
      existingAccount: boolean;
      /** An unverified identity holds the address; the mailbox holder replaces it. */
      existingUnverified: boolean;
      /** The unverified identity belongs to an organization: it must never be taken over. */
      existingInUse: boolean;
      expiresAt: string;
    };

export async function inspectActivation(deps: Pick<Deps, "adminRpc">, token: string): Promise<InspectResult> {
  const res = await deps.adminRpc("inspect_member_activation", { p_token: token });
  const d = res.data as Record<string, unknown> | null;
  if (res.error || !d) return { state: "not_found" };
  if (d.state !== "valid") return { state: d.state as "not_found" | "expired" | "used" | "revoked" };
  return {
    state: "valid",
    memberName: String(d.member_name ?? ""),
    organizationName: (d.organization_name as string | null) ?? null,
    email: String(d.email ?? ""),
    existingAccount: d.existing_account === true,
    existingUnverified: d.existing_unverified === true,
    existingInUse: d.existing_in_use === true,
    expiresAt: String(d.expires_at ?? ""),
  };
}

export type CompleteResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason:
        | "invalid_token"
        | "expired"
        | "used"
        | "revoked"
        | "weak_password"
        | "needs_signin"
        | "email_mismatch"
        | "already_linked"
        | "identity_in_use"
        | "server_error";
    };

export async function completeActivation(
  deps: Pick<Deps, "adminRpc" | "auth">,
  input: { token: string; password?: string; bearerJwt?: string | null },
): Promise<CompleteResult> {
  const info = await inspectActivation(deps, input.token);
  if (info.state !== "valid") return { ok: false, reason: info.state === "not_found" ? "invalid_token" : info.state };

  const finish = async (userId: string, origin: "provisioned" | "linked_existing"): Promise<CompleteResult | null> => {
    const done = await deps.adminRpc("complete_member_activation", {
      p_token: input.token,
      p_auth_user_id: userId,
      p_origin: origin,
    });
    const d = done.data as { ok?: boolean; reason?: string } | null;
    if (done.error || !d) return { ok: false, reason: "server_error" };
    if (d.ok) return { ok: true, email: info.email };
    const known = ["invalid_token", "expired", "used", "revoked", "email_mismatch", "already_linked", "identity_in_use"] as const;
    return { ok: false, reason: (known as readonly string[]).includes(d.reason ?? "") ? (d.reason as (typeof known)[number]) : "server_error" };
  };

  // The email already has an Auth identity (typically a staff member who is
  // also an owner). One person, one identity: never create a second one, and
  // never link without proof that the caller IS that identity.
  if (info.existingAccount) {
    if (!input.bearerJwt) return { ok: false, reason: "needs_signin" };
    const who = await deps.auth.getUser(input.bearerJwt);
    const user = who.data.user;
    if (who.error || !user) return { ok: false, reason: "needs_signin" };
    if ((user.email ?? "").toLowerCase() !== info.email.toLowerCase()) return { ok: false, reason: "email_mismatch" };
    return (await finish(user.id, "linked_existing")) ?? { ok: false, reason: "server_error" };
  }

  if (!input.password || !isAcceptablePassword(input.password)) return { ok: false, reason: "weak_password" };

  // An UNVERIFIED identity already holds this address (someone registered it
  // without ever proving the mailbox). The token was delivered to the mailbox,
  // so its holder is the rightful owner of the address: take the identity over
  // (new password, now verified) instead of creating a duplicate or trusting
  // whoever registered it first.
  if (info.existingUnverified) {
    if (info.existingInUse) return { ok: false, reason: "identity_in_use" };
    const found = await deps.adminRpc("portal_find_auth_user", { p_email: info.email });
    const existingId = typeof found.data === "string" ? found.data : null;
    if (!existingId) return { ok: false, reason: "server_error" };
    const claimed = await deps.auth.updateUserById(existingId, { password: input.password, email_confirm: true });
    if (claimed.error) return { ok: false, reason: "server_error" };
    // Whoever registered the address first may hold sessions: end them (best effort).
    await deps.auth.revokeAllSessions(existingId);
    return (await finish(existingId, "provisioned")) ?? { ok: false, reason: "server_error" };
  }

  const created = await deps.auth.createUser({
    email: info.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: info.memberName },
  });
  if (!created.data.user) {
    // Someone (or a concurrent attempt) created the identity first; any other
    // failure is ours, not the owner's to fix by signing in.
    return { ok: false, reason: alreadyExists(created.error?.message) ? "needs_signin" : "server_error" };
  }

  const result = await finish(created.data.user.id, "provisioned");
  if (!result || !result.ok) await deps.auth.deleteUser(created.data.user.id);
  return result ?? { ok: false, reason: "server_error" };
}
