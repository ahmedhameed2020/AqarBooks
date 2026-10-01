import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ completion: vi.fn(), admin: vi.fn(), rpc: vi.fn(), from: vi.fn(), eq: vi.fn(), order: vi.fn() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "user" }) }));
vi.mock("@/lib/auth/org-context", () => ({ getPrimaryOrganization: async () => ({ id: "tenant" }) }));
vi.mock("@/lib/auth/page-guard", () => ({ denyIfMissingPermission: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/gates/completion-policy", () => ({ getGateCompletionEnabled: mocks.completion }));
vi.mock("@/lib/gates/service-worker", () => ({ GateScannerServiceWorkerRegistration: () => null }));
vi.mock("@/app/[locale]/(app)/operations/gate/gate-scanner-client", () => ({ GateScannerClient: () => null }));
vi.mock("@/app/[locale]/(app)/operations/gate/legacy-scanner-client", () => ({ LegacyGateScannerClient: () => null }));
import GateScannerPage from "@/app/[locale]/(app)/operations/gate/page";

describe("scanner completion page admission", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: true }); mocks.completion.mockResolvedValue(false);
    const query = { select: () => query, eq: mocks.eq, order: mocks.order };
    mocks.eq.mockReturnValue(query); mocks.from.mockReturnValue(query);
    mocks.order.mockResolvedValue({ data: [{ id: "gate", code: "NORTH", name_en: "North gate", direction_mode: "BOTH" }], error: null });
  });
  it("renders usable legacy scanner with tenant-filtered gates and no device credentials when disabled", async () => {
    const page = await GateScannerPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) });
    expect(page?.props.gates).toEqual([{ id: "gate", label: "NORTH · North gate", directionMode: "BOTH" }]);
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "tenant");
    expect(mocks.completion).toHaveBeenCalledWith(expect.anything(), "tenant");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("fails closed on policy lookup errors", async () => {
    mocks.completion.mockRejectedValue(new Error("gate_completion_policy_unavailable"));
    await expect(GateScannerPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) })).rejects.toThrow("gate_completion_policy_unavailable");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
