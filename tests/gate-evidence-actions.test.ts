import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getCurrentUser, getPrimaryOrganization, hasPermission, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryOrganization: vi.fn(),
  hasPermission: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/auth/org-context", () => ({ getPrimaryOrganization }));
vi.mock("@/lib/auth/authorize", () => ({ hasPermission }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/gates/long-stay-policy", () => ({ getGateLongStayPolicy: vi.fn(async () => ({ thresholdHours: 12, notificationsEnabled: false })) }));

import { listAccessEvidence, listCurrentVisitors, exportCurrentVisitorsCsvAction } from "../lib/actions/gate-evidence";

const organizationId = "11e0208c-7238-4522-bda4-536baeba6596";

describe("gate evidence actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "7c67062d-076c-45d1-818e-d944a8d34a4b" });
    getPrimaryOrganization.mockResolvedValue({ id: organizationId });
    hasPermission.mockResolvedValue(true);
    createClient.mockResolvedValue({ rpc });
  });

  it("returns the occupancy total from a count-only empty page and accepts offset 25050", async () => {
    rpc.mockResolvedValue({ data: [{ invitation_id: null, total_count: 137, count_only: true }], error: null });

    await expect(listCurrentVisitors({ page: "502", pageSize: "50" })).resolves.toEqual({
      ok: true,
      rows: [],
      total: 137,
      page: 502,
      pageSize: 50,
      longStayHours: 12,
    });
    expect(rpc).toHaveBeenCalledWith("list_gate_current_visitors", expect.objectContaining({
      p_offset: 25050,
      p_limit: 50,
    }));
  });
  it("exports a bounded authorized occupancy snapshot with safe display fields and formula escaping", async () => {
    rpc.mockResolvedValue({ data: { totalCount: 25001, truncated: true, rows: [{ invitation_no: "INV-1", guest_name: "=evil()", property_name: "Home", unit_code: "1", gate_code: "N", entered_at: "2026-10-01", valid_until: "2026-10-02", guest_phone: "private", token_hash: "private" }] }, error: null });
    const result = await exportCurrentVisitorsCsvAction({});
    expect(result.ok).toBe(true); if (!result.ok) throw Error("export");
    expect(result.csv).toContain("'=evil()"); expect(result.csv).not.toContain("private");
    expect(result.truncated).toBe(true);
    expect(rpc).toHaveBeenCalledWith("export_gate_current_visitors", expect.objectContaining({ p_organization_id: organizationId, p_limit: 5000 }));
    hasPermission.mockResolvedValue(false); rpc.mockClear();
    expect(await exportCurrentVisitorsCsvAction({})).toEqual({ ok: false, error: "forbidden" }); expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the evidence total from a count-only empty page and accepts offset 25050", async () => {
    rpc.mockResolvedValue({ data: [{ id: null, total_count: 219, count_only: true }], error: null });

    await expect(listAccessEvidence({ page: "502", pageSize: "50" })).resolves.toEqual({
      ok: true,
      rows: [],
      total: 219,
      page: 502,
      pageSize: 50,
    });
    expect(rpc).toHaveBeenCalledWith("list_gate_access_evidence", expect.objectContaining({
      p_offset: 25050,
      p_limit: 50,
    }));
  });
});
