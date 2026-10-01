import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), org: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/org-context", () => ({ getPrimaryOrganization: mocks.org }));
vi.mock("@/lib/auth/authorize", () => ({ hasPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveGateCompletionPolicy } from "@/lib/actions/gate-completion-policy";
import { getGateCompletionEnabled } from "@/lib/gates/completion-policy";

describe("completion rollout application boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "manager" }); mocks.org.mockResolvedValue({ id: "tenant" });
    mocks.permission.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ error: null, data: true });
  });
  it("uses server-derived tenant and exact manager permission", async () => {
    expect(await saveGateCompletionPolicy(false)).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith("tenant", "operations.gates.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("set_gate_completion_policy", { p_organization_id: "tenant", p_enabled: false });
  });
  it("rejects unauthenticated, unauthorized and invalid inputs before writes", async () => {
    mocks.user.mockResolvedValue(null);
    expect(await saveGateCompletionPolicy(true)).toEqual({ ok: false });
    mocks.user.mockResolvedValue({ id: "manager" }); mocks.permission.mockResolvedValue(false);
    expect(await saveGateCompletionPolicy(true)).toEqual({ ok: false });
    expect(await saveGateCompletionPolicy("true" as unknown as boolean)).toEqual({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on missing policy and throws on inaccessible policy", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await getGateCompletionEnabled({ rpc: mocks.rpc }, "tenant")).toBe(false);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    await expect(getGateCompletionEnabled({ rpc: mocks.rpc }, "tenant")).rejects.toThrow("gate_completion_policy_unavailable");
  });
  it("redacts write failures and does not revalidate", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "private" } });
    expect(await saveGateCompletionPolicy(true)).toEqual({ ok: false });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
