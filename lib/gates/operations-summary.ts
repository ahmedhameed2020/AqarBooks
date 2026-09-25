import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LONG_STAY_HOURS } from "@/lib/gates/evidence-csv";

export const GATE_DEVICE_OFFLINE_MINUTES = 5;
export const GATE_CONNECTIVITY_LOOKBACK_HOURS = 24;

export type GateOperationsSummary = {
  activeDevices: number;
  devicesOffline: number;
  connectivityIncidents24h: number;
  visitorsInside: number;
  longStays: number;
  unresolvedExceptions: number;
  oldestUnresolvedExceptionAgeMinutes: number | null;
  hardwareBacklog: number;
  deadHardwareCommands: number;
  oldestHardwareBacklogAgeMinutes: number | null;
};

type QueryError = { message: string } | null;
type QueryResult = { data: unknown; count?: number | null; error: QueryError };

type SummaryQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact"; head: true }): SummaryQuery;
  eq(column: string, value: unknown): SummaryQuery;
  in(column: string, values: readonly string[]): SummaryQuery;
  gte(column: string, value: string): SummaryQuery;
  lte(column: string, value: string): SummaryQuery;
  or(filters: string): SummaryQuery;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): SummaryQuery;
  limit(value: number): SummaryQuery;
};

type SummaryClient = { from(table: string): SummaryQuery };

function withScope(
  query: SummaryQuery,
  organizationId: string,
  propertyId: string | undefined,
  propertyColumn = "property_id",
) {
  const scoped = query.eq("organization_id", organizationId);
  return propertyId ? scoped.eq(propertyColumn, propertyId) : scoped;
}

function countOf(result: QueryResult) {
  if (result.error) throw new Error("gate_operations_summary_failed");
  return result.count ?? 0;
}

function firstTimestamp(result: QueryResult, column: "occurred_at" | "created_at") {
  if (result.error) throw new Error("gate_operations_summary_failed");
  if (!Array.isArray(result.data) || result.data.length === 0) return null;
  const row = result.data[0];
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[column];
  return typeof value === "string" ? value : null;
}

function ageMinutes(timestamp: string | null, now: Date) {
  if (!timestamp) return null;
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) return null;
  return Math.max(0, Math.floor((now.getTime() - milliseconds) / 60_000));
}

/**
 * Returns a tenant-scoped operational snapshot containing only counts and ages.
 * Collection queries are HEAD-only; the only row queries select one timestamp.
 */
export async function getGateOperationsSummary(
  organizationId: string,
  propertyId?: string,
): Promise<GateOperationsSummary> {
  const admin = createAdminClient() as unknown as SummaryClient;
  const now = new Date();
  const offlineBefore = new Date(now.getTime() - GATE_DEVICE_OFFLINE_MINUTES * 60_000).toISOString();
  const connectivitySince = new Date(now.getTime() - GATE_CONNECTIVITY_LOOKBACK_HOURS * 3_600_000).toISOString();
  const longStayBefore = new Date(now.getTime() - DEFAULT_LONG_STAY_HOURS * 3_600_000).toISOString();

  const activeDevicesQuery = withScope(
    admin.from("gate_devices").select("status", { count: "exact", head: true }),
    organizationId,
    propertyId,
  ).eq("status", "ACTIVE");
  const offlineDevicesQuery = withScope(
    admin.from("gate_devices").select("status", { count: "exact", head: true }),
    organizationId,
    propertyId,
  ).eq("status", "ACTIVE").or(`last_seen_at.is.null,last_seen_at.lt.${offlineBefore}`);
  const connectivityQuery = withScope(
    admin.from("gate_connectivity_incidents").select("occurred_at,gates!inner()", { count: "exact", head: true }),
    organizationId,
    propertyId,
    "gates.property_id",
  ).gte("occurred_at", connectivitySince);
  const visitorsInsideQuery = withScope(
    admin.from("visitor_access_state").select("is_inside", { count: "exact", head: true }),
    organizationId,
    propertyId,
  ).eq("is_inside", true);
  const longStaysQuery = withScope(
    admin.from("visitor_access_state").select("is_inside", { count: "exact", head: true }),
    organizationId,
    propertyId,
  ).eq("is_inside", true).lte("last_entry_at", longStayBefore);
  const unresolvedExceptionsQuery = withScope(
    admin.from("gate_manual_exception_details").select("status", { count: "exact", head: true }),
    organizationId,
    propertyId,
  ).eq("status", "PENDING");
  const oldestExceptionQuery = withScope(
    admin.from("gate_manual_exception_details").select("occurred_at"),
    organizationId,
    propertyId,
  ).eq("status", "PENDING").order("occurred_at", { ascending: true }).limit(1);
  const hardwareBacklogQuery = withScope(
    admin.from("gate_hardware_commands").select("status,gates!inner()", { count: "exact", head: true }),
    organizationId,
    propertyId,
    "gates.property_id",
  ).in("status", ["PENDING", "FAILED", "DISPATCHING"]);
  const deadHardwareQuery = withScope(
    admin.from("gate_hardware_commands").select("status,gates!inner()", { count: "exact", head: true }),
    organizationId,
    propertyId,
    "gates.property_id",
  ).eq("status", "DEAD");
  const oldestHardwareQuery = withScope(
    admin.from("gate_hardware_commands").select("created_at,gates!inner()"),
    organizationId,
    propertyId,
    "gates.property_id",
  ).in("status", ["PENDING", "FAILED", "DISPATCHING"]).order("created_at", { ascending: true }).limit(1);

  const results = await Promise.all([
    activeDevicesQuery,
    offlineDevicesQuery,
    connectivityQuery,
    visitorsInsideQuery,
    longStaysQuery,
    unresolvedExceptionsQuery,
    oldestExceptionQuery,
    hardwareBacklogQuery,
    deadHardwareQuery,
    oldestHardwareQuery,
  ]);

  return {
    activeDevices: countOf(results[0]),
    devicesOffline: countOf(results[1]),
    connectivityIncidents24h: countOf(results[2]),
    visitorsInside: countOf(results[3]),
    longStays: countOf(results[4]),
    unresolvedExceptions: countOf(results[5]),
    oldestUnresolvedExceptionAgeMinutes: ageMinutes(firstTimestamp(results[6], "occurred_at"), now),
    hardwareBacklog: countOf(results[7]),
    deadHardwareCommands: countOf(results[8]),
    oldestHardwareBacklogAgeMinutes: ageMinutes(firstTimestamp(results[9], "created_at"), now),
  };
}
