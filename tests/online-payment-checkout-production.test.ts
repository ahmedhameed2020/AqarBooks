import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { chooseCheckoutSetting } from "@/lib/payments/resolve-credentials";

describe("production checkout selection", () => {
  const sandboxOrg = { id: "sandbox-org", property_id: null, environment: "SANDBOX" as const };
  const productionOrg = { id: "production-org", property_id: null, environment: "PRODUCTION" as const };
  const sandboxProperty = { id: "sandbox-property", property_id: "property-1", environment: "SANDBOX" as const };

  it("keeps production settings unusable outside the explicit pilot allowlist", () => {
    expect(chooseCheckoutSetting([productionOrg], "property-1", false)).toBeNull();
    expect(chooseCheckoutSetting([productionOrg], "property-1", true)).toEqual(productionOrg);
  });

  it("chooses the property-specific setting before the organization-wide fallback", () => {
    expect(
      chooseCheckoutSetting([sandboxOrg, sandboxProperty], "property-1", false),
    ).toEqual(sandboxProperty);
  });

  it("prefers production for an allowlisted pilot but retains sandbox fallback", () => {
    expect(chooseCheckoutSetting([sandboxProperty, productionOrg], "property-1", true)).toEqual(
      productionOrg,
    );
    expect(chooseCheckoutSetting([sandboxProperty], "property-1", true)).toEqual(sandboxProperty);
  });

  it("passes the stable browser request id into the idempotent checkout RPC", () => {
    const action = readFileSync("lib/actions/online-payment-checkout.ts", "utf8");
    const client = readFileSync(
      "app/[locale]/portal/(member)/dues/dues-checkout.tsx",
      "utf8",
    );
    expect(action).toContain("p_client_request_id: parsed.data.clientRequestId");
    expect(client).toContain("checkoutAttempt.current!.id");
    expect(client).toContain("selectionKey");
  });
});
