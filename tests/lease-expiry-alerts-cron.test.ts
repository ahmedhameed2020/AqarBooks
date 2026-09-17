import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cron/lease-expiry/route.ts", "utf8");
const workflow = readFileSync(".github/workflows/lease-expiry.yml", "utf8");

describe("lease expiry trusted cron path", () => {
  it("fails closed and invokes the service-only RPC through the admin client", () => {
    expect(route).toContain("serverEnv.CRON_SECRET");
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("createAdminClient");
    expect(route).toContain('admin.rpc("run_lease_expiry_alerts")');
    expect(route).toContain('status: 503');
    expect(route).toContain('status: 401');
  });

  it("uses the existing authenticated workflow pattern with bounded execution", () => {
    expect(workflow).toContain('cron: "30 3 * * *"');
    expect(workflow).toContain("secrets.CRON_SECRET");
    expect(workflow).toContain("/api/cron/lease-expiry");
    expect(workflow).toContain("timeout-minutes: 10");
    expect(workflow).toContain("cancel-in-progress: false");
  });
});
