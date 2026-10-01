import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ env: { CRON_SECRET: "cron-secret" as string | undefined }, rpc: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ serverEnv: state.env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: state.admin }));
import { POST } from "@/app/api/cron/gate-notifications/route";

const request = (authorization?: string) => new NextRequest("http://localhost/api/cron/gate-notifications?limit=9999", {
  method: "POST", headers: authorization ? { authorization } : {}, body: '{"p_limit":9999}',
});

describe("notification cron boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.env.CRON_SECRET = "cron-secret";
    state.admin.mockReturnValue({ rpc: state.rpc });
    state.rpc.mockResolvedValue({ data: 0, error: null });
  });
  it.each([undefined, "bad", "cron-secret", "Bearer bad", "Bearer cron-secreX", "Bearer cron-secret-extra"])("rejects %s before admin access", async (header) => {
    const response = await POST(request(header));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("fails closed without configuration", async () => {
    state.env.CRON_SECRET = undefined;
    expect((await POST(request("Bearer cron-secret"))).status).toBe(503);
    expect(state.admin).not.toHaveBeenCalled();
  });
  it.each([0, 3, 100])("returns only the attempted count %s with a fixed batch", async (count) => {
    state.rpc.mockResolvedValue({ data: count, error: null });
    const response = await POST(request("bearer cron-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: count });
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("process_gate_notifications", { p_limit: 100 });
  });
  it.each([null, -1, 101, 1.5, "secret-data", { recipient: "private" }])("redacts unexpected SQL return %j", async (data) => {
    state.rpc.mockResolvedValue({ data, error: null });
    const response = await POST(request("Bearer cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "drain_failed" });
  });
  it("redacts database errors", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "private credential" } });
    const response = await POST(request("Bearer cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "drain_failed" });
  });
  it.each(["rpc", "admin"])("redacts thrown %s failures", async (source) => {
    if (source === "rpc") state.rpc.mockRejectedValue(new Error("private credential"));
    else state.admin.mockImplementation(() => { throw new Error("private credential"); });
    const response = await POST(request("Bearer cron-secret"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "drain_failed" });
  });
});
