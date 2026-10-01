import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), org: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/org-context", () => ({ getPrimaryOrganization: mocks.org }));
vi.mock("@/lib/auth/authorize", () => ({ hasPermission: mocks.permission }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveGateLongStayPolicy } from "@/lib/actions/gate-long-stay-policy";
import { getGateLongStayPolicy, type PolicyClient } from "@/lib/gates/long-stay-policy";

describe("long-stay policy", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "manager" }); mocks.org.mockResolvedValue({ id: "tenant" });
    mocks.permission.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ error: null });
  });
  it.each([0,169,1.5,Number.NaN])("rejects invalid threshold %s before mutation", async (hours) => {
    expect(await saveGateLongStayPolicy(hours,true)).toEqual({ ok: false }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires manager permission and server-derived organization", async () => {
    mocks.permission.mockResolvedValue(false);
    expect(await saveGateLongStayPolicy(24,true)).toEqual({ ok: false }); expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.permission.mockResolvedValue(true);
    expect(await saveGateLongStayPolicy(24,true)).toEqual({ ok: true });
    expect(mocks.permission).toHaveBeenCalledWith("tenant","operations.gates.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("set_gate_long_stay_policy",{ p_organization_id:"tenant",p_threshold_hours:24,p_notifications_enabled:true });
  });
  it("redacts mutation failures and avoids revalidation", async () => {
    mocks.rpc.mockResolvedValue({ error:{ message:"private" } });
    expect(await saveGateLongStayPolicy(24,true)).toEqual({ ok:false }); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reads the tenant threshold and defaults notifications to disabled for absent policy", async () => {
    const query = { select:vi.fn(),eq:vi.fn(),limit:vi.fn() };
    query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
    query.limit.mockResolvedValue({data:[{threshold_hours:36,notifications_enabled:true}],error:null});
    const client={from:vi.fn(() => query)};
    expect(await getGateLongStayPolicy(client as unknown as PolicyClient,"tenant")).toEqual({thresholdHours:36,notificationsEnabled:true});
    expect(query.eq).toHaveBeenCalledWith("organization_id","tenant");
    query.limit.mockResolvedValue({data:[],error:null});
    expect(await getGateLongStayPolicy(client as unknown as PolicyClient,"tenant")).toEqual({thresholdHours:12,notificationsEnabled:false});
  });
});
