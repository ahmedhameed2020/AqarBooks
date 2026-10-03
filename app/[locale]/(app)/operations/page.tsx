import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { hasPermission } from "@/lib/auth/authorize";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAccessEvidence, listCurrentVisitors } from "@/lib/actions/gate-evidence";
import { getGateOperationsSummary } from "@/lib/gates/operations-summary";
import { shapeOperationsDashboard } from "@/lib/gates/operations-dashboard";
import type { Locale } from "@/i18n/routing";
import { OperationsDashboardView } from "./operations-dashboard-view";

type QueryError = { message: string } | null;
type CountQuery = PromiseLike<{ count?: number | null; error: QueryError }> & {
  select(columns: string, options: { count: "exact"; head: true }): CountQuery;
  eq(column: string, value: string): CountQuery;
};
type AgeQuery = PromiseLike<{ data: Array<{ created_at: string }> | null; error: QueryError }> & {
  select(columns: string): AgeQuery;
  eq(column: string, value: string): AgeQuery;
  order(column: string, options: { ascending: boolean }): AgeQuery;
  limit(value: number): AgeQuery;
};
type DeviceQuery = PromiseLike<{ data: Array<{ access_event_id: string }> | null; error: QueryError }> & {
  select(columns: string): DeviceQuery;
  eq(column: string, value: string): DeviceQuery;
  in(column: string, values: string[]): DeviceQuery;
  limit(value: number): DeviceQuery;
};
type AdminReadClient = {
  from(table: "gate_notification_outbox"): CountQuery & AgeQuery;
  from(table: "gate_scan_devices"): DeviceQuery;
};
type ReadFailure = { ok: false; error: string };

async function getNotificationCounts(organizationId: string) {
  const admin = createAdminClient() as unknown as AdminReadClient;
  const pendingQuery = admin.from("gate_notification_outbox")
    .select("status", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "PENDING");
  const failedQuery = admin.from("gate_notification_outbox")
    .select("status", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "FAILED");
  const failedAgeQuery = admin.from("gate_notification_outbox")
    .select("created_at")
    .eq("organization_id", organizationId)
    .eq("status", "FAILED")
    .order("created_at", { ascending: false })
    .limit(1);
  const [pending, failed, failedAge] = await Promise.all([pendingQuery, failedQuery, failedAgeQuery]);
  const error = Boolean(pending.error || failed.error || failedAge.error);
  if (error) console.error("[OperationsDashboardPage] notification delivery read failed");
  const failedTimestamp = failedAge.data?.[0]?.created_at;
  return {
    pending: error ? 0 : pending.count ?? 0,
    failed: error ? 0 : failed.count ?? 0,
    failedAgeMinutes: error || !failedTimestamp ? null : Math.max(0, Math.floor((Date.now() - Date.parse(failedTimestamp)) / 60_000)),
    error,
  };
}

async function listDeviceAttribution(organizationId: string, eventIds: string[]) {
  if (eventIds.length === 0) return new Set<string>();
  const admin = createAdminClient() as unknown as AdminReadClient;
  const { data, error } = await admin.from("gate_scan_devices")
    .select("access_event_id")
    .eq("organization_id", organizationId)
    .in("access_event_id", eventIds.slice(0, 8))
    .limit(8);
  if (error) return new Set<string>();
  return new Set((data ?? []).map((row) => row.access_event_id));
}

export default async function OperationsDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.gates.view", locale);
  if (denied) return denied;

  const canReadAccessEvents = await hasPermission(organization.id, "operations.access_events.view");
  const forbidden: ReadFailure = { ok: false, error: "forbidden" };
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = todayStart.toISOString();
  const [summary, notificationCounts, visitors, activity] = await Promise.all([
    getGateOperationsSummary(organization.id).catch(() => null),
    getNotificationCounts(organization.id).catch(() => ({ pending: 0, failed: 0, failedAgeMinutes: null, error: true })),
    canReadAccessEvents ? listCurrentVisitors({ page: "1", pageSize: "8" }) : Promise.resolve(forbidden),
    canReadAccessEvents ? listAccessEvidence({ page: "1", pageSize: "8", from, to: now.toISOString() }) : Promise.resolve(forbidden),
  ]);

  if (!summary) {
    return <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950/30"><h1 className="text-xl font-black text-slate-950 dark:text-white">{isAr ? "لوحة العمليات غير متاحة" : "Operations dashboard unavailable"}</h1><p className="text-sm text-slate-600 dark:text-slate-300">{isAr ? "تعذر تحميل المؤشرات التشغيلية الآمنة. حاول مرة أخرى لاحقاً." : "The safe operational indicators could not be loaded. Please try again later."}</p></div>;
  }

  const activityRows = activity.ok ? activity.rows : [];
  const activityDeviceEventIds = canReadAccessEvents && activity.ok
    ? await listDeviceAttribution(organization.id, activityRows.map((event) => event.id))
    : new Set<string>();
  const model = shapeOperationsDashboard({
    summary,
    currentVisitorsTotal: visitors.ok ? visitors.total : null,
    currentVisitorsTotalAvailable: visitors.ok,
    todayGateActivity: activity.ok ? activity.total : null,
    todayGateActivityAvailable: activity.ok,
    pendingNotifications: notificationCounts.pending,
    notificationsError: notificationCounts.error,
    failedNotifications: notificationCounts.failed,
    failedNotificationAgeMinutes: notificationCounts.failedAgeMinutes,
    currentVisitors: visitors.ok ? visitors.rows : [],
    currentVisitorsError: !visitors.ok && canReadAccessEvents,
    currentVisitorsPermissionLimited: !canReadAccessEvents,
    activityError: !activity.ok && canReadAccessEvents,
    activityPermissionLimited: !canReadAccessEvents,
    activityDeviceEventIds,
  });

  return <OperationsDashboardView model={model} activity={activityRows} locale={locale as "ar" | "en"} />;
}
