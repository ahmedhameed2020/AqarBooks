import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const dependencies = vi.hoisted(() => ({
  member: vi.fn(), client: vi.fn(), admin: vi.fn(), credentials: vi.fn(),
}));
vi.mock("@/lib/auth/portal-member", () => ({ getPortalMemberContext: dependencies.member }));
vi.mock("@/lib/supabase/server", () => ({ createClient: dependencies.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: dependencies.admin }));
vi.mock("@/lib/payments/resolve-credentials", () => ({ selectCheckoutProviderCredentials: dependencies.credentials }));

import { createOnlinePaymentCheckoutAction } from "@/lib/actions/online-payment-checkout";
import { fawryAdapter } from "@/lib/payments/providers/fawry";
import { assertFawryInitiationAllowed, isFawryInitiationAllowed } from "@/lib/payments/fawry-initiation-policy";

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("V1 Fawry initiation boundary (real policy)", () => {
  it("cannot be enabled by pilot, URL or arbitrary environment flags", () => {
    vi.stubEnv("PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS", "11111111-1111-4111-8111-111111111111");
    vi.stubEnv("FAWRY_PRODUCTION_BASE_URL", "https://merchant.example.test");
    vi.stubEnv("FAWRY_ENABLED", "true");
    expect(isFawryInitiationAllowed()).toBe(false);
    expect(assertFawryInitiationAllowed).toThrow("FAWRY_INITIATION_DISABLED");
  });

  it("denies valid action input before account data, credentials or any DB call", async () => {
    const result = await createOnlinePaymentCheckoutAction({
      dueIds: ["22222222-2222-4222-8222-222222222222"], provider: "FAWRY",
      clientRequestId: "33333333-3333-4333-8333-333333333333",
    });
    expect(result).toEqual({ error: "FAWRY_INITIATION_DISABLED" });
    for (const dependency of Object.values(dependencies)) expect(dependency).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("providerReference");
  });

  it("preserves invalid-input behavior without initiating work", async () => {
    expect(await createOnlinePaymentCheckoutAction({ provider: "PAYMOB" })).toEqual({ error: "INVALID_INPUT" });
    for (const dependency of Object.values(dependencies)) expect(dependency).not.toHaveBeenCalled();
  });

  it.each(["https://merchant.example.test", "https://atfawry.fawrystaging.com", undefined])(
    "denies adapter charge without reading credentials or fetching (%s)", async (baseUrl) => {
      const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
      const readCredential = vi.fn(() => { throw new Error("credential must not be read"); });
      await expect(fawryAdapter.createCheckout({
        transactionId: "old-transaction", amount: 500, memberEmail: "review@example.test",
        memberPhone: null, merchantOrderRef: "old-transaction",
      }, {
        get merchantIdentifier() { return readCredential(); }, publicKey: null,
        apiKey: "", get hmacSecret() { return readCredential(); }, baseUrl,
      })).rejects.toThrow("FAWRY_INITIATION_DISABLED");
      expect(fetchMock).not.toHaveBeenCalled(); expect(readCredential).not.toHaveBeenCalled();
    },
  );
});
