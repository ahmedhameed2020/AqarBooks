import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shapeOperationsDashboard, type OperationsDashboardSource } from "../lib/gates/operations-dashboard";

const source: OperationsDashboardSource = {
  summary: {
    longStayHours: 12,
    activeDevices: 4,
    devicesStale: 1,
    connectivityIncidents24h: 2,
    visitorsInside: 7,
    longStays: 2,
    unresolvedExceptions: 3,
    oldestUnresolvedExceptionAgeMinutes: 40,
    hardwareBacklog: 5,
    deadHardwareCommands: 1,
    oldestHardwareBacklogAgeMinutes: 90,
  },
  currentVisitorsTotal: 7,
  currentVisitorsTotalAvailable: true,
  todayGateActivity: 11,
  todayGateActivityAvailable: true,
  pendingNotifications: 2,
  notificationsError: false,
  failedNotifications: 2,
  failedNotificationAgeMinutes: 15,
  currentVisitors: [],
  currentVisitorsError: false,
  currentVisitorsPermissionLimited: false,
  activityError: false,
  activityPermissionLimited: false,
  activityDeviceEventIds: new Set(),
  now: new Date("2026-01-10T12:00:00.000Z"),
};

describe("operations dashboard shaping", () => {
  it("keeps the page permission guarded, tenant scoped, bounded, and parallel", () => {
    const page = readFileSync("app/[locale]/(app)/operations/page.tsx", "utf8");
    const layout = readFileSync("app/[locale]/(app)/layout.tsx", "utf8");
    const view = readFileSync("app/[locale]/(app)/operations/operations-dashboard-view.tsx", "utf8");

    expect(view).toContain("Recent gate activity");
    expect(view).toContain("Current visitors");
    expect(view).toContain("Attention queue");
    expect(view).toContain("System health");
    expect(view).toContain("Visitor / subject");
    expect(view).toContain("Actor");
    expect(view).toContain("Device recorded");
    expect(view).toContain("Could not load");
    expect(view).toContain("This section is unavailable for the current role");
    expect(view).toContain('slug="recent-activity"');
    expect(view).toContain("Notification delivery");
    expect(view).toContain("Terminal device failures");
    expect(page).toContain("notificationsError");
    expect(page).toContain("todayGateActivityAvailable");
    expect(page).toContain("currentVisitorsTotal: visitors.ok ? visitors.total : null");
    expect(page).toContain("currentVisitorsTotalAvailable: visitors.ok");
    expect(page).toContain('"operations.gates.view"');
    expect(page).toContain('"operations.access_events.view"');
    expect(page).toContain('"organization_id", organizationId');
    expect(page).toContain('"access_event_id", eventIds');
    expect(page).toContain('.eq("status", "PENDING")');
    expect(page).toContain('.eq("status", "FAILED")');
    expect(page).toContain(".limit(1)");
    expect(page.indexOf("const denied")).toBeLessThan(page.indexOf("const [summary"));
    expect(page.indexOf("const canReadAccessEvents")).toBeLessThan(page.indexOf("const activityDeviceEventIds"));
    expect(page).toContain("Promise.all");
    expect(page).toContain("const todayStart = new Date(Date.UTC");
    expect(page).toContain("to: now.toISOString()");
    expect(page).not.toContain("to: today");
    expect(page).toContain('pageSize: "8"');
    expect(layout).toContain('href: "/operations", permission: "operations.gates.view"');
  });

  it("shapes populated summary values and failed notification attention", () => {
    const result = shapeOperationsDashboard(source);

    expect(result.summary).toMatchObject({
      currentVisitors: 7,
      todayGateActivity: 11,
      pendingNotifications: 2,
      failedNotifications: 2,
      pendingHardwareCommands: 5,
      longStayAlerts: 2,
      needsAttention: 15,
    });
    expect(result.attention.map((item) => item.kind)).toEqual([
      "hardware-failure",
      "failed-notification",
      "long-stay",
      "hardware-backlog",
      "pending-exception",
      "connectivity-incident",
    ]);
  });

  it("preserves explicit section errors instead of turning failures into empty states", () => {
    const result = shapeOperationsDashboard({
      ...source,
      currentVisitorsError: true,
      currentVisitorsPermissionLimited: false,
      activityError: true,
      activityPermissionLimited: false,
      todayGateActivity: null,
      todayGateActivityAvailable: false,
      currentVisitors: [],
    });

    expect(result.currentVisitorsError).toBe(true);
    expect(result.activityError).toBe(true);
    expect(result.currentVisitorsPermissionLimited).toBe(false);
    expect(result.activityPermissionLimited).toBe(false);
    expect(result.summary.todayGateActivity).toBe(null);
    expect(result.todayGateActivityAvailable).toBe(false);
  });

  it("marks access sections as permission limited without treating them as query failures", () => {
    const result = shapeOperationsDashboard({
      ...source,
      currentVisitorsError: false,
      currentVisitorsPermissionLimited: true,
      activityError: false,
      activityPermissionLimited: true,
    });

    expect(result.currentVisitorsPermissionLimited).toBe(true);
    expect(result.activityPermissionLimited).toBe(true);
    expect(result.currentVisitorsError).toBe(false);
    expect(result.activityError).toBe(false);
  });

  it("does not report notification delivery as healthy when the read is unavailable", () => {
    const result = shapeOperationsDashboard({ ...source, notificationsError: true, pendingNotifications: 0, failedNotifications: 0 });
    expect(result.notificationsError).toBe(true);
    expect(result.summary.pendingNotifications).toBe(0);
    expect(result.attention.some((item) => item.kind === "failed-notification")).toBe(false);
  });

  it("returns calm zero states without inventing attention", () => {
    const result = shapeOperationsDashboard({
      ...source,
      summary: { ...source.summary, connectivityIncidents24h: 0, visitorsInside: 0, longStays: 0, unresolvedExceptions: 0, hardwareBacklog: 0, deadHardwareCommands: 0 },
      todayGateActivity: 0,
      pendingNotifications: 0,
      failedNotifications: 0,
      failedNotificationAgeMinutes: null,
      currentVisitors: [],
    });

    expect(result.summary.needsAttention).toBe(0);
    expect(result.attention).toEqual([]);
  });

  it("keeps terminal hardware failures actionable without counting them as pending", () => {
    const result = shapeOperationsDashboard({ ...source, summary: { ...source.summary, hardwareBacklog: 0, deadHardwareCommands: 2 } });
    expect(result.summary.pendingHardwareCommands).toBe(0);
    expect(result.attention).toContainEqual(expect.objectContaining({ kind: "hardware-failure", count: 2 }));
  });
});
