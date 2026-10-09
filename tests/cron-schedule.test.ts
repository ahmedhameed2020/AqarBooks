import { describe, expect, it } from "vitest";
import { DAILY, EVERY_MINUTE, routesFor } from "@/lib/cron/schedule";

const at = (iso: string) => Date.parse(iso);

describe("routesFor", () => {
  it("runs gate-hardware alone on an ordinary minute", () => {
    expect(routesFor(EVERY_MINUTE, at("2026-10-09T12:07:00Z"))).toEqual(["gate-hardware"]);
  });

  it("adds gate-notifications on every fifth minute", () => {
    expect(routesFor(EVERY_MINUTE, at("2026-10-09T12:05:00Z"))).toEqual(["gate-hardware", "gate-notifications"]);
  });

  it("adds payment-events on every tenth minute", () => {
    expect(routesFor(EVERY_MINUTE, at("2026-10-09T12:20:00Z"))).toEqual([
      "gate-hardware",
      "gate-notifications",
      "payment-events",
    ]);
  });

  it("matches the old GitHub cadences over a full hour", () => {
    const counts: Record<string, number> = {};
    for (let minute = 0; minute < 60; minute += 1) {
      const time = Date.UTC(2026, 9, 9, 12, minute);
      for (const route of routesFor(EVERY_MINUTE, time)) counts[route] = (counts[route] ?? 0) + 1;
    }
    expect(counts).toEqual({ "gate-hardware": 60, "gate-notifications": 12, "payment-events": 6 });
  });

  it("maps the daily slots to the same UTC times as before", () => {
    expect(routesFor(DAILY, at("2026-10-09T03:00:00Z"))).toEqual(["lease-rent"]);
    expect(routesFor(DAILY, at("2026-10-09T03:30:00Z"))).toEqual(["lease-expiry"]);
    expect(routesFor(DAILY, at("2026-10-09T04:00:00Z"))).toEqual(["alert-digest"]);
    expect(routesFor(DAILY, at("2026-10-09T04:30:00Z"))).toEqual([]);
  });

  it("ignores unknown expressions", () => {
    expect(routesFor("0 0 * * *", at("2026-10-09T00:00:00Z"))).toEqual([]);
  });
});
