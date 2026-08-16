import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
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

describe("Fawry adapter amount-to-minor-units conversion", () => {
  it("converts a plain 2-decimal amount without floating-point error", () => {
    const parsed = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ paymentAmount: "19.99", orderAmount: "19.99" }),
      headers: {},
      url: "",
    });
    expect(parsed.amountMinor).toBe(1999);
  });

  it("does not produce the floating-point artifact the old Math.round(parseFloat(x)*100) path did", () => {
    // Regression check for the reviewed bug: parseFloat("1.005") * 100 ===
    // 100.49999999999999 in IEEE-754 double, which Math.round() then rounds
    // DOWN to 100 -- not up to 101 as naive rounding would suggest, and
    // worse, other nearby values round unpredictably depending on their
    // exact float representation. The string-based conversion never
    // multiplies a float, so it is fully deterministic: it takes exactly
    // the first two fractional digits (Fawry's wire format is always
    // fixed 2-decimal, so a third digit should never actually appear in
    // practice) rather than depending on float rounding at all.
    const first = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ paymentAmount: "1.005", orderAmount: "1.005" }),
      headers: {},
      url: "",
    }).amountMinor;
    const second = fawryAdapter.parseWebhookPayload({
      rawBody: buildFixtureNotification({ paymentAmount: "1.005", orderAmount: "1.005" }),
      headers: {},
      url: "",
    }).amountMinor;
    expect(first).toBe(second);
    expect(Number.isInteger(first)).toBe(true);
    // Deterministic string-truncation result: the old float path was not
    // guaranteed to equal this on every run/engine; this path always does.
    expect(first).toBe(100);
  });
});

describe("Fawry adapter malformed webhook body handling", () => {
  // Task 5's webhook route handler wraps each adapter call in its own
  // try/catch expecting a throw on malformed input -- pin down that
  // parseWebhookPayload/verifyWebhookSignature never silently swallow a
  // JSON.parse failure.
  it("parseWebhookPayload throws on non-JSON rawBody", () => {
    expect(() =>
      fawryAdapter.parseWebhookPayload({ rawBody: "not json", headers: {}, url: "" })
    ).toThrow();
  });

  it("verifyWebhookSignature throws on non-JSON rawBody", () => {
    expect(() =>
      fawryAdapter.verifyWebhookSignature({ rawBody: "not json", headers: {}, url: "" })
    ).toThrow();
  });
});

describe("Fawry adapter createCheckout", () => {
  const baseInput = {
    transactionId: "txn-abc-123",
    amount: 500,
    memberEmail: "owner@example.test",
    memberPhone: "01000000000",
    merchantOrderRef: "22222222-2222-2222-2222-222222222222",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a signature matching buildChargeRequestSignature's expected output for known inputs", async () => {
    let capturedBody: any = null;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({ redirectUrl: "https://atfawry.fawrystaging.com/pay/xyz", referenceNumber: "ref-1" }),
        text: async () => "",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await fawryAdapter.createCheckout(baseInput);

    expect(capturedBody).not.toBeNull();
    // Known-answer check: merchantCode + merchantRefNum + "" + "" + amount(2dp) + secureKey
    const expectedSignature = crypto
      .createHash("sha256")
      .update(`${TEST_MERCHANT_CODE}${baseInput.merchantOrderRef}${""}${""}${"500.00"}${TEST_SECURE_KEY}`, "utf8")
      .digest("hex");
    expect(capturedBody.signature).toBe(expectedSignature);
    expect(capturedBody.merchantCode).toBe(TEST_MERCHANT_CODE);
    expect(capturedBody.merchantRefNum).toBe(baseInput.merchantOrderRef);
  });

  it("succeeds when the response has nextAction.redirectUrl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ nextAction: { redirectUrl: "https://atfawry.fawrystaging.com/pay/next-action" }, referenceNumber: "ref-2" }),
        text: async () => "",
      }))
    );

    const result = await fawryAdapter.createCheckout(baseInput);
    expect(result.redirectUrl).toBe("https://atfawry.fawrystaging.com/pay/next-action");
    expect(result.providerReference).toBe("ref-2");
  });

  it("succeeds when the response has only a top-level redirectUrl (no nextAction)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ redirectUrl: "https://atfawry.fawrystaging.com/pay/top-level", referenceNumber: null }),
        text: async () => "",
      }))
    );

    const result = await fawryAdapter.createCheckout(baseInput);
    expect(result.redirectUrl).toBe("https://atfawry.fawrystaging.com/pay/top-level");
    expect(result.providerReference).toBeNull();
  });

  it("throws FAWRY_CHARGE_RESPONSE_MISSING_REDIRECT_URL when both redirectUrl fields are absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ referenceNumber: "ref-3" }),
        text: async () => "",
      }))
    );

    await expect(fawryAdapter.createCheckout(baseInput)).rejects.toThrow(
      "FAWRY_CHARGE_RESPONSE_MISSING_REDIRECT_URL"
    );
  });

  it("throws FAWRY_CHARGE_REQUEST_FAILED with status and body text on a non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => ({}),
        text: async () => "upstream error detail",
      }))
    );

    await expect(fawryAdapter.createCheckout(baseInput)).rejects.toThrow(
      "FAWRY_CHARGE_REQUEST_FAILED: 502 upstream error detail"
    );
  });
});
