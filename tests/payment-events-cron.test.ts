import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cron/payment-events/route.ts", "utf8");
const workflow = readFileSync(".github/workflows/payment-events.yml", "utf8");

describe("payment event retry automation", () => {
  it("fails closed on missing deployment secret and bad bearer tokens", () => {
    expect(route).toContain('status: 503');
    expect(route).toContain('status: 401');
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("serverEnv.CRON_SECRET");
  });

  it("caps work at fifty and returns counts without payloads", () => {
    expect(route).toContain("const MAX_BATCH = 50");
    expect(route).toContain(".limit(MAX_BATCH)");
    expect(route).toContain("claimed:");
    expect(route).not.toContain("redacted_payload");
  });

  it("recovers abandoned processing leases before claiming retries", () => {
    expect(route).toContain("recover_stale_online_payment_events");
    expect(route).toContain('p_stale_after: "10 minutes"');
    expect(route).toContain("recovery_failed");
  });

  it("uses the shared secret and bounded curl in the scheduler", () => {
    expect(workflow).toContain("secrets.CRON_SECRET");
    expect(workflow).toContain("-m 300");
    expect(workflow).toContain("/api/cron/payment-events");
  });
});
