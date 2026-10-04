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
    ...overrides,
  };
  return { auth, created };
}

const noEmail: Deps["email"] = { configured: false, send: async () => ({ ok: false, error: "x" }) };

function deps(parts: Partial<Deps> & { rpc: Rpc }): Deps {
  return {
    adminRpc: parts.adminRpc ?? parts.rpc,
    auth: parts.auth ?? makeAuth().auth,
    email: parts.email ?? noEmail,
    siteUrl: "https://aqarbooks.com",
    ...parts,
  };
}

const issuedRow = {
  token_id: "tok-1",
  raw_token: "T".repeat(43),
  expires_at: "2026-10-07T10:00:00.000Z",
  member_email: "owner@example.com",
  member_name: "Owner",
  organization_id: "org",
};

describe("errorCode", () => {
  it("extracts the SQL error code", () => {
    expect(errorCode("FORBIDDEN_PORTAL_ACCESS: لا تملك صلاحية")).toBe("FORBIDDEN_PORTAL_ACCESS");
    expect(errorCode("NO_ACTIVE_OWNERSHIP")).toBe("NO_ACTIVE_OWNERSHIP");
    expect(errorCode("permission denied for function x")).toBe("UNKNOWN");
    expect(errorCode(undefined)).toBe("UNKNOWN");
  });
});

describe("issueActivation: never claims an email was sent when it was not", () => {
  it("reports sent only when the provider accepts the message", async () => {
    const { rpc, calls } = rpcFrom({
      issue_member_activation: { data: [issuedRow] },
      record_activation_delivery: { data: null },
    });
    const send = vi.fn(async () => ({ ok: true as const }));
    const res = await issueActivation(deps({ rpc, email: { configured: true, send } }), "m1", "ar");
    expect(res).toMatchObject({ ok: true, emailStatus: "sent", activationUrl: `https://aqarbooks.com/activate/${"T".repeat(43)}` });
    expect(send).toHaveBeenCalledWith("owner@example.com", expect.any(String), expect.stringContaining("T".repeat(43)), expect.any(String));
    expect(calls.find((c) => c.fn === "record_activation_delivery")?.args).toMatchObject({ p_token_id: "tok-1", p_status: "sent" });
  });

  it("reports failed when the provider rejects, and still returns the link", async () => {
    const { rpc, calls } = rpcFrom({ issue_member_activation: { data: [issuedRow] }, record_activation_delivery: {} });
    const res = await issueActivation(
      deps({ rpc, email: { configured: true, send: async () => ({ ok: false, error: "Resend 422" }) } }),
      "m1",
      "en",
    );
    expect(res).toMatchObject({ ok: true, emailStatus: "failed" });
    expect(calls.find((c) => c.fn === "record_activation_delivery")?.args).toMatchObject({ p_status: "failed", p_detail: "Resend 422" });
  });

  it("reports not_sent without calling a provider when email is not configured", async () => {
    const { rpc, calls } = rpcFrom({ issue_member_activation: { data: [issuedRow] }, record_activation_delivery: {} });
    const send = vi.fn();
    const res = await issueActivation(deps({ rpc, email: { configured: false, send } }), "m1", "ar");
    expect(res).toMatchObject({ ok: true, emailStatus: "not_sent" });
    expect(send).not.toHaveBeenCalled();
    expect(calls.find((c) => c.fn === "record_activation_delivery")?.args).toMatchObject({ p_status: "not_sent" });
  });

  it("surfaces database refusals as codes and sends nothing", async () => {
    const { rpc } = rpcFrom({ issue_member_activation: { error: "NO_ACTIVE_OWNERSHIP: x" } });
    const send = vi.fn();
    const res = await issueActivation(deps({ rpc, email: { configured: true, send } }), "m1", "ar");
    expect(res).toEqual({ ok: false, error: "NO_ACTIVE_OWNERSHIP" });
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
  it("bans only identities the database says may be banned, then signs them out", async () => {
    const { auth } = makeAuth();
    const { rpc, calls } = rpcFrom({
      suspend_member_portal: { data: [{ auth_user_id: "u1", should_ban: true }] },
      revoke_member_portal_sessions: { data: 3 },
    });
    const res = await suspendPortal(deps({ rpc, auth }), "m1", "non-payment");
    expect(res).toEqual({ ok: true, warnings: [], sessionsRevoked: 3 });
    expect(auth.updateUserById).toHaveBeenCalledWith("u1", { ban_duration: "876000h" });
    expect(calls.map((c) => c.fn)).toEqual(["suspend_member_portal", "revoke_member_portal_sessions"]);
  });

  it("never bans a shared staff identity", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({
      suspend_member_portal: { data: [{ auth_user_id: "staff", should_ban: false }] },
      revoke_member_portal_sessions: { data: 1 },
    });
    await suspendPortal(deps({ rpc, auth }), "m1", null);
    expect(auth.updateUserById).not.toHaveBeenCalled();
  });

  it("treats a failed ban as a warning because the database suspension already holds", async () => {
    const { auth } = makeAuth({ updateUserById: vi.fn(async () => ({ error: { message: "boom" } })) });
    const { rpc } = rpcFrom({
      suspend_member_portal: { data: [{ auth_user_id: "u1", should_ban: true }] },
      revoke_member_portal_sessions: { error: "x" },
    });
    expect(await suspendPortal(deps({ rpc, auth }), "m1", null)).toEqual({
      ok: true,
      warnings: ["ban_failed", "sessions_not_revoked"],
      sessionsRevoked: undefined,
    });
  });

  it("does nothing outside the database when suspension is refused", async () => {
    const { auth } = makeAuth();
    const { rpc } = rpcFrom({ suspend_member_portal: { error: "FORBIDDEN_PORTAL_ACCESS: x" } });
    expect(await suspendPortal(deps({ rpc, auth }), "m1", null)).toEqual({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
    expect(auth.updateUserById).not.toHaveBeenCalled();
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

  it("sign-out-everywhere reports how many sessions were revoked", async () => {
    const { rpc } = rpcFrom({ revoke_member_portal_sessions: { data: 4 } });
    expect(await signOutEverywhere(deps({ rpc }), "m1")).toEqual({ ok: true, warnings: [], sessionsRevoked: 4 });
    const denied = rpcFrom({ revoke_member_portal_sessions: { error: "FORBIDDEN_PORTAL_ACCESS: x" } });
    expect(await signOutEverywhere(deps({ rpc: denied.rpc }), "m1")).toEqual({ ok: false, error: "FORBIDDEN_PORTAL_ACCESS" });
  });
});

describe("activation by link", () => {
  const validInspect = {
    state: "valid",
    member_name: "Owner",
    organization_name: "Org",
    email: "owner@example.com",
    existing_account: false,
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
