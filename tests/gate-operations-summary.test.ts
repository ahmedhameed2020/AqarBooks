import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type QueryCall = {
  table: string;
  projection: string;
  options?: { count?: string; head?: boolean };
  filters: Array<[string, string, unknown]>;
  limit?: number;
};

const state = vi.hoisted(() => ({ calls: [] as QueryCall[], failTable: null as string | null }));

function resultFor(call: QueryCall) {
  if (state.failTable === call.table) return { data: null, count: null, error: { message: "secret database detail" } };
  if (call.table === "gate_long_stay_policy") return { data: [{ threshold_hours: 24, notifications_enabled: false }], error: null };

  if (call.options?.head) {
    if (call.table === "gate_devices") return { data: null, count: call.filters.some(([method]) => method === "or") ? 2 : 6, error: null };
    if (call.table === "gate_connectivity_incidents") return { data: null, count: 5, error: null };
    if (call.table === "visitor_access_state") return { data: null, count: call.filters.some(([, column]) => column === "last_entry_at") ? 3 : 9, error: null };
    if (call.table === "gate_manual_exception_details") return { data: null, count: 4, error: null };
    if (call.table === "gate_hardware_commands") return { data: null, count: call.filters.some(([method]) => method === "in") ? 7 : 1, error: null };
  }

  if (call.table === "gate_manual_exception_details") return { data: [{ occurred_at: "2026-09-25T10:00:00.000Z" }], error: null };
  if (call.table === "gate_hardware_commands") return { data: [{ created_at: "2026-09-25T11:30:00.000Z" }], error: null };
  return { data: [], error: null };
}

function queryFor(table: string) {
  const call: QueryCall = { table, projection: "", filters: [] };
  state.calls.push(call);
  const query = {
    select(projection: string, options?: QueryCall["options"]) { call.projection = projection; call.options = options; return query; },
    eq(column: string, value: unknown) { call.filters.push(["eq", column, value]); return query; },
    in(column: string, value: unknown) { call.filters.push(["in", column, value]); return query; },
    gte(column: string, value: unknown) { call.filters.push(["gte", column, value]); return query; },
    lte(column: string, value: unknown) { call.filters.push(["lte", column, value]); return query; },
    or(value: string) { call.filters.push(["or", value, null]); return query; },
    order(column: string, value: unknown) { call.filters.push(["order", column, value]); return query; },
    limit(value: number) { call.limit = value; return query; },
    then(resolve: (value: ReturnType<typeof resultFor>) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(resultFor(call)).then(resolve, reject);
    },
  };
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => queryFor(table), rpc: vi.fn(async () => ({ data: { sampleSize: 0, validationP50Ms: null, validationP95Ms: null, hardwareRetries: 0, dimensions: [] }, error: null })) }),
}));

import { getGateOperationsSummary } from "@/lib/gates/operations-summary";

describe("getGateOperationsSummary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00:00.000Z"));
    state.calls.length = 0;
    state.failTable = null;
  });

  afterEach(() => vi.useRealTimers());

  it("returns counts and ages only while keeping every collection query aggregate-bound", async () => {
    const summary = await getGateOperationsSummary("org-1", "property-1");

    expect(summary).toEqual(expect.objectContaining({
      devicesStale: 2,
      visitorsInside: 9,
      unresolvedExceptions: 4,
      deadHardwareCommands: 1,
      activeDevices: 6,
      connectivityIncidents24h: 5,
      longStays: 3,
      longStayHours: 24,
      hardwareBacklog: 7,
      oldestUnresolvedExceptionAgeMinutes: 120,
      oldestHardwareBacklogAgeMinutes: 30,
    }));
    expect(summary).not.toHaveProperty("devicesOffline");
    expect(JSON.stringify(summary)).not.toMatch(/guest|phone|secret|token/i);

    const countQueries = state.calls.filter((call) => call.options?.head);
    expect(countQueries).toHaveLength(8);
    expect(countQueries.find((call) => call.filters.some(([, column]) => column === "last_entry_at"))?.filters)
      .toContainEqual(["lte", "last_entry_at", "2026-09-24T12:00:00.000Z"]);
    expect(countQueries.every((call) => call.options?.count === "exact")).toBe(true);

    const rowQueries = state.calls.filter((call) => !call.options?.head);
    expect(rowQueries).toHaveLength(3);
    expect(rowQueries.every((call) => call.limit === 1)).toBe(true);
    expect(rowQueries.map((call) => call.projection)).toEqual([
      "threshold_hours,notifications_enabled",
      "occurred_at",
      "created_at,gates!inner()",
    ]);
    expect(state.calls.map((call) => call.projection).join(" ")).not.toMatch(
      /\bid\b|client_scan_id|visitor_invitation_id|property_id|guest|phone|secret|token|reason|credential|payload|\*/i,
    );
  });

  it("applies organization and property scope to every aggregate", async () => {
    await getGateOperationsSummary("org-1", "property-1");

    expect(state.calls).toHaveLength(11);
    for (const call of state.calls) {
      expect(call.filters).toContainEqual(["eq", "organization_id", "org-1"]);
      const propertyFilter = call.filters.find(([, column]) => column === "property_id" || column === "gates.property_id");
      if (call.table !== "gate_long_stay_policy") expect(propertyFilter?.[2], `${call.table} property scope`).toBe("property-1");
    }
  });

  it("fails with a fixed error instead of leaking database details", async () => {
    state.failTable = "gate_connectivity_incidents";
    await expect(getGateOperationsSummary("org-1")).rejects.toThrow("gate_operations_summary_failed");
  });
});
