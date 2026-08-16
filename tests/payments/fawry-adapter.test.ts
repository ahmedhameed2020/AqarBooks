import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "node:crypto";

// `lib/payments/env.ts` imports the `server-only` package, which throws
// unconditionally when its (non-bundler-aware) Node "main" entry point is
// loaded -- that guard only becomes a no-op under Next.js's webpack/RSC
// build, not under plain Node/vitest. Stub it so unit tests can exercise
// the adapter (and the env validation it depends on) without a Next.js
// bundler in the loop.
vi.mock("server-only", () => ({}));

import { fawryAdapter } from "@/lib/payments/providers/fawry";
import { runProviderContractTests } from "./provider-contract.test";

const TEST_SECURE_KEY = "test-fawry-secure-key";
const TEST_MERCHANT_CODE = "TEST-MERCHANT-1";

beforeAll(() => {
  process.env.FAWRY_MERCHANT_CODE = TEST_MERCHANT_CODE;
  process.env.FAWRY_SECURE_KEY = TEST_SECURE_KEY;
  process.env.FAWRY_BASE_URL = "https://atfawry.fawrystaging.com";
  process.env.PAYMOB_SECRET_KEY = "unused-in-this-file";
  process.env.PAYMOB_PUBLIC_KEY = "unused-in-this-file";
  process.env.PAYMOB_HMAC_SECRET = "unused-in-this-file";
  process.env.PAYMOB_INTEGRATION_ID = "0";
  process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
});

function buildFixtureNotification(
  overrides: Partial<{
    fawryRefNumber: string;
    merchantRefNumber: string;
    paymentAmount: string;
    orderAmount: string;
    orderStatus: string;
    paymentMethod: string;
    paymentRefNumber: string;
  }> = {}
) {
  const fields = {
    fawryRefNumber: "9000000123456",
    merchantRefNumber: "22222222-2222-2222-2222-222222222222",
    paymentAmount: "500.00",
    orderAmount: "500.00",
    orderStatus: "PAID",
    paymentMethod: "PAYATFAWRY",
    paymentRefNumber: "9000000123456",
    ...overrides,
  };
  const inputString = `${fields.fawryRefNumber}${fields.merchantRefNumber}${fields.paymentAmount}${fields.orderAmount}${fields.orderStatus}${fields.paymentMethod}${fields.paymentRefNumber}${TEST_SECURE_KEY}`;
  const messageSignature = crypto.createHash("sha256").update(inputString, "utf8").digest("hex");
  return JSON.stringify({ ...fields, messageSignature });
}

runProviderContractTests("Fawry", fawryAdapter, {
  validWebhookBody: buildFixtureNotification(),
  validHeaders: {},
  validUrl: "https://example.test/api/webhooks/fawry",
  expectedMerchantOrderRef: "22222222-2222-2222-2222-222222222222",
  // Fawry's signature lives in the body's `messageSignature` field, not in
  // headers or the URL -- corrupt it there, keeping the same length so we
  // are testing "wrong signature", not "malformed/short signature".
  corruptSignature: (ctx) => {
    const body = JSON.parse(ctx.rawBody);
    const original: string = body.messageSignature;
    const corrupted = (original[0] === "0" ? "1" : "0") + original.slice(1);
    return { ...ctx, rawBody: JSON.stringify({ ...body, messageSignature: corrupted }) };
  },
  // Change amounts that feed the signature formula while leaving
  // messageSignature at its original (now-stale) value, so the recomputed
  // signature no longer matches what was sent.
  tamperPayload: (validBody) => {
    const body = JSON.parse(validBody);
    return JSON.stringify({ ...body, paymentAmount: "999.99", orderAmount: "999.99" });
  },
});

describe("Fawry adapter status mapping", () => {
  it("maps PAID to SUCCESS", () => {
    const parsed = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ orderStatus: "PAID" }),
      headers: {},
      url: "",
    });
    expect(parsed.status).toBe("SUCCESS");
  });

  it("maps UNPAID to PENDING", () => {
    const parsed = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ orderStatus: "UNPAID" }),
      headers: {},
      url: "",
    });
    expect(parsed.status).toBe("PENDING");
  });

  it("maps documented terminal-negative statuses (FAILED, CANCELED, EXPIRED) to FAILED", () => {
    for (const orderStatus of ["FAILED", "CANCELED", "EXPIRED"]) {
      const parsed = fawryAdapter.parseWebhookPayload({
        rawBody: buildFixtureNotification({ orderStatus }),
        headers: {},
        url: "",
      });
      expect(parsed.status).toBe("FAILED");
    }
  });

  it("maps an unrecognized status to PENDING (never guesses FAILED), and logs it for manual review", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ orderStatus: "SOME_UNKNOWN_VALUE" }),
      headers: {},
      url: "",
    });
    expect(parsed.status).toBe("PENDING");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("SOME_UNKNOWN_VALUE"));
    warnSpy.mockRestore();
  });

  it("does NOT silently classify an unrecognized status as SUCCESS either", () => {
    const parsed = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ orderStatus: "SOME_UNKNOWN_VALUE" }),
      headers: {},
      url: "",
    });
    expect(parsed.status).not.toBe("SUCCESS");
  });

  it("does not misclassify REFUNDED/PARTIAL_REFUNDED (previously-successful payments) as FAILED", () => {
    for (const orderStatus of ["REFUNDED", "PARTIAL_REFUNDED", "NEW"]) {
      const parsed = fawryAdapter.parseWebhookPayload({
        rawBody: buildFixtureNotification({ orderStatus }),
        headers: {},
        url: "",
      });
      expect(parsed.status).toBe("PENDING");
    }
  });
});
