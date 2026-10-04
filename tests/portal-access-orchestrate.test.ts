import { describe, expect, it, vi } from "vitest";
import {
  completeActivation,
  errorCode,
  inspectActivation,
  issueActivation,
  issueTemporaryAccess,
  reactivatePortal,
  signOutEverywhere,
  suspendPortal,
  type Deps,
  type Rpc,
} from "@/lib/portal-access/orchestrate";

type Reply = { data?: unknown; error?: string };

function rpcFrom(replies: Record<string, Reply | ((args: Record<string, unknown>) => Reply)>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc: Rpc = async (fn, args = {}) => {
    calls.push({ fn, args });
    const r = replies[fn];
    const reply = typeof r === "function" ? r(args) : r;
    if (!reply) return { data: null, error: { message: `unexpected rpc ${fn}` } };
    return { data: reply.data ?? null, error: reply.error ? { message: reply.error } : null };
  };
  return { rpc, calls };
}

function makeAuth(overrides: Partial<Deps["auth"]> = {}) {
  const created: Array<{ email: string; password: string }> = [];
  const auth: Deps["auth"] = {
    createUser: vi.fn(async (attrs) => {
      created.push({ email: attrs.email, password: attrs.password });
      return { data: { user: { id: "new-user" } }, error: null };
    }),
    updateUserById: vi.fn(async () => ({ error: null })),
    deleteUser: vi.fn(async () => ({ error: null })),
    getUser: vi.fn(async () => ({ data: { user: null }, error: { message: "no" } })),
    revokeAllSessions: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  return { auth, created };
}

const noEmail: Deps["email"] = { configured: false, send: async () => ({ ok: false, error: "x" }) };

function deps(parts: Partial<Deps> & { rpc: Rpc }): Deps {
  return {
    actorId: "staff-1",
    adminRpc: parts.adminRpc ?? parts.rpc,
    auth: parts.auth ?? makeAuth().auth,
    email: parts.email ?? noEmail,
    siteUrl: "https://aqarbooks.com",
    ...parts,
  };
}

describe("errorCode", () => {
  it("extracts the SQL error code", () => {
    expect(errorCode("FORBIDDEN_PORTAL_ACCESS: لا تملك صلاحية")).toBe("FORBIDDEN_PORTAL_ACCESS");
    expect(errorCode("NO_ACTIVE_OWNERSHIP")).toBe("NO_ACTIVE_OWNERSHIP");
    expect(errorCode("permission denied for function x")).toBe("UNKNOWN");
    expect(errorCode(undefined)).toBe("UNKNOWN");
  });
});

describe("issueActivation: the link is proof of the mailbox only if it travels by email", () => {
  const requestRow = { member_email: "owner@example.com", member_name: "Owner", organization_id: "org" };
  const mintedRow = {
    token_id: "tok-1",
    raw_token: "T".repeat(43),
    expires_at: "2026-10-07T10:00:00.000Z",
    member_email: "owner@example.com",
    member_name: "Owner",
    organization_id: "org",
  };

  it("mints on the server, mails the link, records delivery, and returns no link or token to staff", async () => {
    const staff = rpcFrom({ request_member_activation: { data: [requestRow] } });
    const admin = rpcFrom({ mint_member_activation_token: { data: [mintedRow] }, mark_member_activation_delivery: {} });
    const send = vi.fn(async () => ({ ok: true as const }));
    const res = await issueActivation(deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: true, send } }), "m1", "ar");

    expect(res).toEqual({ ok: true, email: "owner@example.com", emailStatus: "sent", pendingEmailVerification: false });
    expect(send).toHaveBeenCalledWith("owner@example.com", expect.any(String), expect.stringContaining(`https://aqarbooks.com/activate/${"T".repeat(43)}`), expect.any(String));
    expect(JSON.stringify(res)).not.toContain("T".repeat(43));
    expect(JSON.stringify(res)).not.toContain("activate");
    expect(JSON.stringify(staff.calls)).not.toContain("T".repeat(43));
    expect(admin.calls.find((c) => c.fn === "mint_member_activation_token")?.args).toEqual({ p_member_id: "m1", p_actor: "staff-1", p_valid_hours: 72 });
    expect(admin.calls.find((c) => c.fn === "mark_member_activation_delivery")?.args).toMatchObject({ p_token_id: "tok-1", p_status: "sent" });
  });

  it("when the provider rejects the email the owner stays PENDING_EMAIL_VERIFICATION and the token is revoked", async () => {
    const staff = rpcFrom({ request_member_activation: { data: [requestRow] } });
    const admin = rpcFrom({ mint_member_activation_token: { data: [mintedRow] }, mark_member_activation_delivery: {} });
    const res = await issueActivation(
      deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: true, send: async () => ({ ok: false, error: "Resend 422" }) } }),
      "m1",
      "en",
    );
    expect(res).toEqual({ ok: true, email: "owner@example.com", emailStatus: "failed", pendingEmailVerification: true });
    expect(admin.calls.find((c) => c.fn === "mark_member_activation_delivery")?.args).toMatchObject({ p_status: "failed", p_detail: "Resend 422" });
    expect(JSON.stringify(res)).not.toContain("T".repeat(43));
  });

  it("with no email provider nothing is minted at all, and the path stays pending", async () => {
    const staff = rpcFrom({ request_member_activation: { data: [requestRow] } });
    const admin = rpcFrom({});
    const send = vi.fn();
    const res = await issueActivation(deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: false, send } }), "m1", "ar");
    expect(res).toEqual({ ok: true, email: "owner@example.com", emailStatus: "not_sent", pendingEmailVerification: true });
    expect(send).not.toHaveBeenCalled();
    expect(admin.calls).toEqual([]);
  });

  it("if delivery cannot be recorded the email is not reported as a success", async () => {
    const staff = rpcFrom({ request_member_activation: { data: [requestRow] } });
    const admin = rpcFrom({ mint_member_activation_token: { data: [mintedRow] }, mark_member_activation_delivery: { error: "boom" } });
    const res = await issueActivation(
      deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: true, send: async () => ({ ok: true }) } }),
      "m1",
      "ar",
    );
    expect(res).toMatchObject({ ok: true, emailStatus: "failed", pendingEmailVerification: true });
  });

  it("surfaces database refusals as codes and mints / sends nothing", async () => {
    const staff = rpcFrom({ request_member_activation: { error: "NO_ACTIVE_OWNERSHIP: x" } });
    const admin = rpcFrom({});
    const send = vi.fn();
    const res = await issueActivation(deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: true, send } }), "m1", "ar");
    expect(res).toEqual({ ok: false, error: "NO_ACTIVE_OWNERSHIP" });
    expect(send).not.toHaveBeenCalled();
    expect(admin.calls).toEqual([]);
  });

  it("a mint refused by the database (address edited, access suspended) sends nothing", async () => {
    const staff = rpcFrom({ request_member_activation: { data: [requestRow] } });
    const admin = rpcFrom({ mint_member_activation_token: { error: "ACTIVATION_NOT_ALLOWED" } });
    const send = vi.fn();
    expect(await issueActivation(deps({ rpc: staff.rpc, adminRpc: admin.rpc, email: { configured: true, send } }), "m1", "ar")).toEqual({
      ok: false,
      error: "ACTIVATION_NOT_ALLOWED",
    });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("issueTemporaryAccess", () => {
  const begin = {
    client_id: "MB-10482",
    alias_email: "mb-10482@client.aqarbooks.local",
    auth_user_id: null,
    member_name: "Owner",
    is_regeneration: false,
  };

  it("creates the identity, commits, and returns the password once", async () => {
    const { auth, created } = makeAuth();
    const { rpc, calls } = rpcFrom({
      begin_member_temp_access: { data: [begin] },
      finish_member_temp_access: { data: "2026-10-07T10:00:00.000Z" },
    });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(res).toMatchObject({ ok: true, clientId: "MB-10482", regenerated: false, expiresAt: "2026-10-07T10:00:00.000Z" });
    if (!res.ok) throw new Error();
    expect(created).toEqual([{ email: "mb-10482@client.aqarbooks.local", password: res.temporaryPassword }]);
    expect(res.whatsappText).toContain(res.temporaryPassword);
    expect(res.whatsappText).not.toContain("client.aqarbooks.local");
    // The plaintext password must never be sent to the database.
    expect(JSON.stringify(calls)).not.toContain(res.temporaryPassword);
    expect(calls.find((c) => c.fn === "finish_member_temp_access")?.args).toEqual({
      p_member_id: "m1",
      p_auth_user_id: "new-user",
      p_valid_hours: 72,
    });
  });

  it("regenerates by updating the existing identity, not creating another", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({
      begin_member_temp_access: { data: [{ ...begin, auth_user_id: "existing", is_regeneration: true }] },
      finish_member_temp_access: { data: "2026-10-07T10:00:00.000Z" },
    });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "en");
    expect(res).toMatchObject({ ok: true, regenerated: true });
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(auth.updateUserById).toHaveBeenCalledWith("existing", { password: expect.any(String) });
  });

  it("adopts an orphaned identity left by an earlier failed attempt", async () => {
    const { auth } = makeAuth({
      createUser: vi.fn(async () => ({ data: { user: null }, error: { message: "A user with this email address has already been registered" } })),
    });
    const { rpc } = rpcFrom({
      begin_member_temp_access: { data: [begin] },
      portal_find_auth_user: { data: "orphan-id" },
      finish_member_temp_access: { data: "2026-10-07T10:00:00.000Z" },
    });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(res.ok).toBe(true);
    expect(auth.updateUserById).toHaveBeenCalledWith("orphan-id", { password: expect.any(String) });
  });

  it("does not hunt for an orphan when creation failed for another reason", async () => {
    const { auth } = makeAuth({
      createUser: vi.fn(async () => ({ data: { user: null }, error: { message: "Database error" } })),
    });
    const { rpc, calls } = rpcFrom({ begin_member_temp_access: { data: [begin] } });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(res).toEqual({ ok: false, error: "AUTH_CREATE_FAILED" });
    expect(calls.some((c) => c.fn === "portal_find_auth_user")).toBe(false);
  });

  it("removes a freshly created identity when the commit step fails", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({
      begin_member_temp_access: { data: [begin] },
      finish_member_temp_access: { error: "AUTH_USER_MISMATCH" },
    });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(res).toEqual({ ok: false, error: "AUTH_USER_MISMATCH" });
    expect(auth.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("keeps an existing identity when the commit step fails on regeneration", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({
      begin_member_temp_access: { data: [{ ...begin, auth_user_id: "existing", is_regeneration: true }] },
      finish_member_temp_access: { error: "PORTAL_SUSPENDED" },
    });
    await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses and touches Auth not at all when the database refuses", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ begin_member_temp_access: { error: "FORBIDDEN_PORTAL_ACCESS: x" } });
    const res = await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar");
    expect(res).toEqual({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(auth.updateUserById).not.toHaveBeenCalled();
  });

  it("aborts if the reserved alias does not match the client number", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ begin_member_temp_access: { data: [{ ...begin, alias_email: "someone@example.com" }] } });
    expect(await issueTemporaryAccess(deps({ rpc, auth }), "m1", "ar")).toEqual({ ok: false, error: "ALIAS_MISMATCH" });
    expect(auth.createUser).not.toHaveBeenCalled();
  });
});

describe("suspend / reactivate / sign out", () => {
  it("ends sessions through the Auth API and THEN bans an identity that exists for the owner alone", async () => {
    const { auth } = makeAuth();
    const order: string[] = [];
    (auth.revokeAllSessions as ReturnType<typeof vi.fn>).mockImplementation(async () => (order.push("revoke"), { ok: true }));
    (auth.updateUserById as ReturnType<typeof vi.fn>).mockImplementation(async () => (order.push("ban"), { error: null }));
    const staff = rpcFrom({ suspend_member_portal: { data: [{ auth_user_id: "u1", should_ban: true }] } });
    const admin = rpcFrom({ log_member_portal_event: {} });
    const res = await suspendPortal(deps({ rpc: staff.rpc, adminRpc: admin.rpc, auth }), "m1", "non-payment");
    expect(res).toEqual({ ok: true, warnings: [] });
    expect(order).toEqual(["revoke", "ban"]);
    expect(auth.updateUserById).toHaveBeenCalledWith("u1", { ban_duration: "876000h" });
    expect(admin.calls[0]).toMatchObject({ fn: "log_member_portal_event", args: { p_action: "member_portal.sessions_revoked", p_actor: "staff-1" } });
  });

  it("NEVER bans or signs out a shared staff identity: suspending the owner side must not touch work access", async () => {
    const { auth } = makeAuth();
    const staff = rpcFrom({ suspend_member_portal: { data: [{ auth_user_id: "staff", should_ban: false }] } });
    const admin = rpcFrom({ log_member_portal_event: {} });
    const res = await suspendPortal(deps({ rpc: staff.rpc, adminRpc: admin.rpc, auth }), "m1", null);
    expect(res).toEqual({ ok: true, warnings: [] });
    expect(auth.updateUserById).not.toHaveBeenCalled();
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    expect(admin.calls).toEqual([]);
  });

  it("treats failures after the database suspension as warnings because RLS already closes the owner side", async () => {
    const { auth } = makeAuth({
      updateUserById: vi.fn(async () => ({ error: { message: "boom" } })),
      revokeAllSessions: vi.fn(async () => ({ ok: false as const, error: "signout_failed" })),
    });
    const staff = rpcFrom({ suspend_member_portal: { data: [{ auth_user_id: "u1", should_ban: true }] } });
    const admin = rpcFrom({ log_member_portal_event: {} });
    expect(await suspendPortal(deps({ rpc: staff.rpc, adminRpc: admin.rpc, auth }), "m1", null)).toEqual({
      ok: true,
      warnings: ["sessions_not_revoked", "ban_failed"],
    });
    expect(admin.calls[0].args).toMatchObject({ p_action: "member_portal.sessions_revoke_failed" });
  });

  it("does nothing outside the database when suspension is refused", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ suspend_member_portal: { error: "FORBIDDEN_PORTAL_ACCESS: x" } });
    expect(await suspendPortal(deps({ rpc, auth }), "m1", null)).toEqual({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
    expect(auth.updateUserById).not.toHaveBeenCalled();
    expect(auth.revokeAllSessions).not.toHaveBeenCalled();
  });

  it("reactivation lifts the ban only when asked to", async () => {
    const a = makeAuth();
    const { rpc } = rpcFrom({ reactivate_member_portal: { data: [{ auth_user_id: "u1", should_unban: true }] } });
    await reactivatePortal(deps({ rpc, auth: a.auth }), "m1");
    expect(a.auth.updateUserById).toHaveBeenCalledWith("u1", { ban_duration: "none" });

    const b = makeAuth();
    const shared = rpcFrom({ reactivate_member_portal: { data: [{ auth_user_id: "staff", should_unban: false }] } });
    await reactivatePortal(deps({ rpc: shared.rpc, auth: b.auth }), "m1");
    expect(b.auth.updateUserById).not.toHaveBeenCalled();
  });

  describe("sign out of all devices", () => {
    it("authorizes in the database, ends sessions through the Auth API, and records the outcome", async () => {
      const { auth } = makeAuth();
      const staff = rpcFrom({ begin_member_signout: { data: [{ auth_user_id: "u1", is_banned: false }] } });
      const admin = rpcFrom({ log_member_portal_event: {} });
      expect(await signOutEverywhere(deps({ rpc: staff.rpc, adminRpc: admin.rpc, auth }), "m1")).toEqual({ ok: true, warnings: [] });
      expect(auth.revokeAllSessions).toHaveBeenCalledWith("u1");
      expect(admin.calls[0].args).toMatchObject({ p_action: "member_portal.sessions_revoked", p_actor: "staff-1" });
    });

    it("never calls the Auth API when the database refuses (other tenant, no permission)", async () => {
      const { auth } = makeAuth();
      const { rpc } = rpcFrom({ begin_member_signout: { error: "FORBIDDEN_PORTAL_ACCESS: x" } });
      expect(await signOutEverywhere(deps({ rpc, auth }), "m1")).toEqual({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    });

    it("a failed revocation is an error and is recorded as failed, never reported as done", async () => {
      const { auth } = makeAuth({ revokeAllSessions: vi.fn(async () => ({ ok: false as const, error: "signout_failed" })) });
      const staff = rpcFrom({ begin_member_signout: { data: [{ auth_user_id: "u1", is_banned: false }] } });
      const admin = rpcFrom({ log_member_portal_event: {} });
      expect(await signOutEverywhere(deps({ rpc: staff.rpc, adminRpc: admin.rpc, auth }), "m1")).toEqual({ ok: false, error: "SESSION_REVOKE_FAILED" });
      expect(admin.calls[0].args).toMatchObject({ p_action: "member_portal.sessions_revoke_failed" });
    });

    it("a banned (suspended) owner cannot refresh any session, so nothing needs revoking", async () => {
      const { auth } = makeAuth();
      const staff = rpcFrom({ begin_member_signout: { data: [{ auth_user_id: "u1", is_banned: true }] } });
      expect(await signOutEverywhere(deps({ rpc: staff.rpc, auth }), "m1")).toEqual({ ok: true, warnings: ["already_blocked"] });
      expect(auth.revokeAllSessions).not.toHaveBeenCalled();
    });
  });
});

describe("activation by link", () => {
  const validInspect = {
    state: "valid",
    member_name: "Owner",
    organization_name: "Org",
    email: "owner@example.com",
    existing_account: false,
    existing_unverified: false,
    existing_in_use: false,
    expires_at: "2026-10-07T10:00:00.000Z",
  };
  const token = "T".repeat(43);

  it("inspect maps every state and never returns more for a dead token", async () => {
    for (const state of ["expired", "used", "revoked", "not_found"] as const) {
      const { rpc } = rpcFrom({ inspect_member_activation: { data: { state } } });
      expect(await inspectActivation({ adminRpc: rpc }, token)).toEqual({ state });
    }
    const { rpc } = rpcFrom({ inspect_member_activation: { data: validInspect } });
    expect(await inspectActivation({ adminRpc: rpc }, token)).toMatchObject({ state: "valid", email: "owner@example.com", existingAccount: false });
    const broken = rpcFrom({ inspect_member_activation: { error: "boom" } });
    expect(await inspectActivation({ adminRpc: broken.rpc }, token)).toEqual({ state: "not_found" });
  });

  it("creates the identity with the chosen password and completes", async () => {
    const { auth, created } = makeAuth();
    const { rpc, calls } = rpcFrom({
      inspect_member_activation: { data: validInspect },
      complete_member_activation: { data: { ok: true } },
    });
    const res = await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" });
    expect(res).toEqual({ ok: true, email: "owner@example.com" });
    expect(created).toEqual([{ email: "owner@example.com", password: "correct-horse-9" }]);
    expect(calls.find((c) => c.fn === "complete_member_activation")?.args).toEqual({
      p_token: token,
      p_auth_user_id: "new-user",
      p_origin: "provisioned",
    });
    expect(JSON.stringify(calls)).not.toContain("correct-horse-9");
  });

  it.each(["expired", "used", "revoked"] as const)("refuses a %s link without touching Auth", async (state) => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ inspect_member_activation: { data: { state } } });
    expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: state });
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("maps an unknown token to invalid_token", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ inspect_member_activation: { data: { state: "not_found" } } });
    expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("rejects a weak password before creating anything", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ inspect_member_activation: { data: validInspect } });
    for (const password of [undefined, "", "short1", "abcdefghijkl", "0123456789"]) {
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, password })).toEqual({ ok: false, reason: "weak_password" });
    }
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("rolls the new identity back when the database refuses the completion", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({
      inspect_member_activation: { data: validInspect },
      complete_member_activation: { data: { ok: false, reason: "used" } },
    });
    expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: "used" });
    expect(auth.deleteUser).toHaveBeenCalledWith("new-user");
  });

  it("asks to sign in when an identity appeared first, but reports other creation errors honestly", async () => {
    const exists = makeAuth({ createUser: vi.fn(async () => ({ data: { user: null }, error: { message: "User already registered" } })) });
    const { rpc } = rpcFrom({ inspect_member_activation: { data: validInspect } });
    expect(await completeActivation({ adminRpc: rpc, auth: exists.auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: "needs_signin" });
    const other = makeAuth({ createUser: vi.fn(async () => ({ data: { user: null }, error: { message: "Password is too weak" } })) });
    expect(await completeActivation({ adminRpc: rpc, auth: other.auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: "server_error" });
  });

  describe("an UNVERIFIED identity already holds the address", () => {
    const unverified = { ...validInspect, existing_unverified: true };

    it("is taken over by the mailbox holder, never linked as-is and never duplicated", async () => {
      const { auth } = makeAuth();
      const { rpc, calls } = rpcFrom({
        inspect_member_activation: { data: unverified },
        portal_find_auth_user: { data: "squatter-id" },
        complete_member_activation: { data: { ok: true } },
      });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" })).toEqual({ ok: true, email: "owner@example.com" });
      expect(auth.createUser).not.toHaveBeenCalled();
      expect(auth.updateUserById).toHaveBeenCalledWith("squatter-id", { password: "correct-horse-9", email_confirm: true });
      expect(auth.revokeAllSessions).toHaveBeenCalledWith("squatter-id");
      expect(calls.find((c) => c.fn === "complete_member_activation")?.args).toEqual({
        p_token: token,
        p_auth_user_id: "squatter-id",
        p_origin: "provisioned",
      });
    });

    it("needs a strong password before anything is changed", async () => {
      const { auth } = makeAuth();
      const { rpc } = rpcFrom({ inspect_member_activation: { data: unverified } });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "short" })).toEqual({ ok: false, reason: "weak_password" });
      expect(auth.updateUserById).not.toHaveBeenCalled();
    });

    it("never modifies an unverified identity that belongs to an organization", async () => {
      const { auth } = makeAuth();
      const { rpc, calls } = rpcFrom({
        inspect_member_activation: { data: { ...unverified, existing_in_use: true } },
        portal_find_auth_user: { data: "invited-staff" },
      });
      const res = await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" });
      expect(res).toEqual({ ok: false, reason: "identity_in_use" });
      expect(auth.updateUserById).not.toHaveBeenCalled();
      expect(auth.createUser).not.toHaveBeenCalled();
      expect(calls.some((c) => c.fn === "complete_member_activation")).toBe(false);
    });
  });

  describe("an email that already has an identity (staff who are also owners)", () => {
    const existing = { ...validInspect, existing_account: true };

    it("demands a signed-in session and never creates a second identity", async () => {
      const { auth } = makeAuth();
      const { rpc } = rpcFrom({ inspect_member_activation: { data: existing } });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, password: "correct-horse-9" })).toEqual({ ok: false, reason: "needs_signin" });
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it("links the identity the bearer token proves", async () => {
      const { auth } = makeAuth({ getUser: vi.fn(async () => ({ data: { user: { id: "staff-1", email: "OWNER@example.com" } }, error: null })) });
      const { rpc, calls } = rpcFrom({ inspect_member_activation: { data: existing }, complete_member_activation: { data: { ok: true } } });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, bearerJwt: "jwt" })).toEqual({ ok: true, email: "owner@example.com" });
      expect(calls.find((c) => c.fn === "complete_member_activation")?.args).toMatchObject({ p_auth_user_id: "staff-1", p_origin: "linked_existing" });
      expect(auth.createUser).not.toHaveBeenCalled();
    });

    it("refuses a session that belongs to a different email", async () => {
      const { auth } = makeAuth({ getUser: vi.fn(async () => ({ data: { user: { id: "other", email: "other@example.com" } }, error: null })) });
      const { rpc, calls } = rpcFrom({ inspect_member_activation: { data: existing } });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, bearerJwt: "jwt" })).toEqual({ ok: false, reason: "email_mismatch" });
      expect(calls.some((c) => c.fn === "complete_member_activation")).toBe(false);
    });

    it("refuses an invalid session", async () => {
      const { auth } = makeAuth();
      const { rpc } = rpcFrom({ inspect_member_activation: { data: existing } });
      expect(await completeActivation({ adminRpc: rpc, auth }, { token, bearerJwt: "bad" })).toEqual({ ok: false, reason: "needs_signin" });
    });
  });
});
