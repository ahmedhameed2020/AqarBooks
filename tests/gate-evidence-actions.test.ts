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

import { listAccessEvidence, listCurrentVisitors } from "../lib/actions/gate-evidence";

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
