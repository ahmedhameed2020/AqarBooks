import { beforeEach, describe, expect, it, vi } from "vitest";

const adminRpc = vi.fn();
const auth = {
  createUser: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  getUser: vi.fn(),
};

vi.mock("@/lib/portal-access/server", () => ({
  activationDeps: () => ({ adminRpc, auth }),
}));

import { POST as inspect } from "@/app/api/portal-activation/inspect/route";
import { POST as complete } from "@/app/api/portal-activation/complete/route";

const token = "T".repeat(43);
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://aqarbooks.com${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/portal-activation/inspect", () => {
  it("answers not_found for malformed tokens without touching the database", async () => {
    for (const bad of ["", "short", "../../x".padEnd(30, "a"), 42, null]) {
      const res = await inspect(post("/api/portal-activation/inspect", { token: bad }));
      expect(await res.json()).toEqual({ state: "not_found" });
    }
    const garbage = await inspect(post("/api/portal-activation/inspect", "not json"));
    expect(await garbage.json()).toEqual({ state: "not_found" });
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("returns the member-facing facts for a valid token and is never cached", async () => {
    adminRpc.mockResolvedValue({
      data: { state: "valid", member_name: "Owner", organization_name: "Org", email: "o@example.com", existing_account: false, expires_at: "2026-10-07T10:00:00Z" },
      error: null,
    });
    const res = await inspect(post("/api/portal-activation/inspect", { token }));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      state: "valid",
      memberName: "Owner",
      organizationName: "Org",
      email: "o@example.com",
      existingAccount: false,
      existingUnverified: false,
      existingInUse: false,
      expiresAt: "2026-10-07T10:00:00Z",
    });
  });

  it("returns only the state for a used, expired or revoked token", async () => {
    adminRpc.mockResolvedValue({ data: { state: "used" }, error: null });
    expect(await (await inspect(post("/api/portal-activation/inspect", { token }))).json()).toEqual({ state: "used" });
  });
});

describe("POST /api/portal-activation/complete", () => {
  const valid = { state: "valid", member_name: "Owner", organization_name: "Org", email: "o@example.com", existing_account: false, expires_at: "x" };

  it("rejects malformed input with 400 and no side effects", async () => {
    const res = await complete(post("/api/portal-activation/complete", { token: "bad", password: "correct-horse-9" }));
    expect(res.status).toBe(400);
    const huge = await complete(post("/api/portal-activation/complete", { token, password: "a".repeat(500) }));
    expect(huge.status).toBe(400);
    expect(adminRpc).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("completes and returns the login email", async () => {
    adminRpc.mockImplementation(async (fn: string) =>
      fn === "inspect_member_activation" ? { data: valid, error: null } : { data: { ok: true }, error: null },
    );
    auth.createUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await complete(post("/api/portal-activation/complete", { token, password: "correct-horse-9" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "o@example.com" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["expired", 410],
    ["used", 410],
    ["revoked", 410],
  ])("maps a %s token to %i", async (state, status) => {
    adminRpc.mockResolvedValue({ data: { state }, error: null });
    const res = await complete(post("/api/portal-activation/complete", { token, password: "correct-horse-9" }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ ok: false, reason: state });
  });

  it("answers 404 for an unknown token and 422 for a weak password", async () => {
    adminRpc.mockResolvedValue({ data: { state: "not_found" }, error: null });
    expect((await complete(post("/api/portal-activation/complete", { token, password: "correct-horse-9" }))).status).toBe(404);
    adminRpc.mockResolvedValue({ data: valid, error: null });
    const weak = await complete(post("/api/portal-activation/complete", { token, password: "short" }));
    expect(weak.status).toBe(422);
    expect(await weak.json()).toEqual({ ok: false, reason: "weak_password" });
  });

  it("passes the bearer token through for an existing identity and answers 401 without it", async () => {
    adminRpc.mockImplementation(async (fn: string) =>
      fn === "inspect_member_activation" ? { data: { ...valid, existing_account: true }, error: null } : { data: { ok: true }, error: null },
    );
    const anon = await complete(post("/api/portal-activation/complete", { token }));
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({ ok: false, reason: "needs_signin" });

    auth.getUser.mockResolvedValue({ data: { user: { id: "staff", email: "o@example.com" } }, error: null });
    const ok = await complete(post("/api/portal-activation/complete", { token }, { Authorization: "Bearer jwt-123" }));
    expect(ok.status).toBe(200);
    expect(auth.getUser).toHaveBeenCalledWith("jwt-123");
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("returns 403 when the signed-in identity is somebody else", async () => {
    adminRpc.mockResolvedValue({ data: { ...valid, existing_account: true }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: { id: "x", email: "other@example.com" } }, error: null });
    const res = await complete(post("/api/portal-activation/complete", { token }, { Authorization: "Bearer jwt" }));
    expect(res.status).toBe(403);
  });
});

describe("app link association files", () => {
  it("assetlinks.json is empty without fingerprints and exact with them", async () => {
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    vi.stubEnv("ANDROID_APP_SHA256_FINGERPRINTS", "");
    expect(await (await GET()).json()).toEqual([]);
    const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");
    vi.stubEnv("ANDROID_APP_SHA256_FINGERPRINTS", `${fp}, not-a-fingerprint`);
    const body = await (await GET()).json();
    expect(body).toHaveLength(1);
    expect(body[0].target).toMatchObject({ namespace: "android_app", package_name: "com.aqarbooks.app", sha256_cert_fingerprints: [fp] });
    vi.unstubAllEnvs();
  });

  it("apple-app-site-association scopes links to /activate/* only", async () => {
    const { GET } = await import("@/app/.well-known/apple-app-site-association/route");
    vi.stubEnv("IOS_TEAM_ID", "ABCDE12345");
    const body = await (await GET()).json();
    expect(body.applinks.details[0]).toEqual({
      appIDs: ["ABCDE12345.com.aqarbooks.aqarbooksMobile"],
      components: [{ "/": "/activate/*" }],
    });
    vi.stubEnv("IOS_TEAM_ID", "");
    expect((await (await GET()).json()).applinks.details).toEqual([]);
    vi.unstubAllEnvs();
  });
});
