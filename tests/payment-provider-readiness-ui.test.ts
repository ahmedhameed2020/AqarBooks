import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/[locale]/(app)/finance/payment-providers/page.tsx", "utf8");
const forms = readFileSync("app/[locale]/(app)/finance/payment-providers/payment-provider-forms.tsx", "utf8");
const portal = readFileSync("app/[locale]/portal/(member)/payments/portal-payments-client.tsx", "utf8");

describe("Fawry readiness copy", () => {
  it("distinguishes connectivity from verified production evidence", () => {
    expect(page).toContain("Connectivity checked");
    expect(page).toContain("production transaction is verified");
    expect(forms).toContain("a production transaction has not been verified yet");
  });

  it("shows pilot eligibility and a fail-closed sandbox state", () => {
    expect(page).toContain("Production pilot eligible");
    expect(page).toContain("Production ineligible — sandbox only");
  });

  it("gives members safe pending, review, and support language", () => {
    expect(portal).toContain("Pending provider confirmation");
    expect(portal).toContain("Under review");
    expect(portal).toContain("contact property support");
    expect(portal).not.toContain("redacted_payload");
  });
});
