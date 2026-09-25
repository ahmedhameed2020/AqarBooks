import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ env: { CRON_SECRET: "cron-secret" as string | undefined }, rpc: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ serverEnv: state.env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/gates/hardware/process-command", () => ({ processGateHardwareCommand: state.process }));
import { POST } from "@/app/api/cron/gate-hardware/route";
const request = (authorization?: string) => new NextRequest("http://localhost/api/cron/gate-hardware?limit=9999", { method: "POST", headers: authorization ? { authorization } : {} });
describe("hardware cron", () => {
  beforeEach(() => { vi.clearAllMocks(); state.env.CRON_SECRET = "cron-secret"; state.rpc.mockResolvedValue({ data: [], error: null }); });
  it.each([undefined, "bad", "cron-secret", "Bearer bad", "Bearer cron-secreX"])("rejects unauthorized input %s before database access", async (header) => {
    expect((await POST(request(header))).status).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("fails closed without a configured secret", async () => {
    state.env.CRON_SECRET = undefined; expect((await POST(request("Bearer cron-secret"))).status).toBe(503); expect(state.rpc).not.toHaveBeenCalled();
  });
  it("caps the claim and returns counts only while isolating per-command failures", async () => {
    state.rpc.mockResolvedValue({ data: [{ id: "secret-id" }, { id: "other" }, { id: "failed" }], error: null });
    state.process.mockResolvedValueOnce("DEAD").mockResolvedValueOnce("ACKNOWLEDGED").mockRejectedValueOnce(new Error("secret"));
    const response = await POST(request("Bearer cron-secret"));
    expect(state.rpc).toHaveBeenCalledWith("claim_gate_hardware_commands", { p_limit: 50 });
    expect(await response.json()).toEqual({ claimed: 3, acknowledged: 1, dead: 1, retryable: 0, stale: 0, failed: 1 });
  });
  it("redacts claim errors", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    const response = await POST(request("Bearer cron-secret")); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "claim_failed" });
  });
});
