import type { GateOperationsSummary } from "@/lib/gates/operations-summary";

export type AttentionKind =
  | "long-stay"
  | "failed-notification"
  | "hardware-backlog"
  | "hardware-failure"
  | "pending-exception"
  | "connectivity-incident";

export type AttentionItem = {
  key: string;
  kind: AttentionKind;
  count: number;
  urgency: number;
  occurredAt: string | null;
};

export type OperationsDashboardSource = {
  summary: GateOperationsSummary;
  currentVisitorsTotal: number | null;
  currentVisitorsTotalAvailable: boolean;
  todayGateActivity: number | null;
  todayGateActivityAvailable: boolean;
  pendingNotifications: number;
  notificationsError: boolean;
  failedNotifications: number;
  failedNotificationAgeMinutes: number | null;
  currentVisitors: Array<{ invitationId: string; guestName: string; propertyName: string; unitCode: string; gateCode: string | null; enteredAt: string | null; longStay: boolean }>;
  currentVisitorsError: boolean;
  currentVisitorsPermissionLimited: boolean;
  activityError: boolean;
  activityPermissionLimited: boolean;
  activityDeviceEventIds: Set<string>;
  now?: Date;
};

export type OperationsDashboardModel = {
  summary: {
    currentVisitors: number | null;
    todayGateActivity: number | null;
    pendingNotifications: number;
    failedNotifications: number;
    pendingHardwareCommands: number;
    longStayAlerts: number;
    needsAttention: number;
    connectivityIncidents: number;
    activeDevices: number;
    devicesStale: number;
  };
  currentVisitors: OperationsDashboardSource["currentVisitors"];
  currentVisitorsTotalAvailable: boolean;
  notificationsError: boolean;
  todayGateActivityAvailable: boolean;
  currentVisitorsError: boolean;
  currentVisitorsPermissionLimited: boolean;
  activityError: boolean;
  activityPermissionLimited: boolean;
  activityDeviceEventIds: Set<string>;
  attention: AttentionItem[];
};

function timestampFromAge(now: Date, ageMinutes: number | null) {
  return ageMinutes === null ? null : new Date(now.getTime() - ageMinutes * 60_000).toISOString();
}

export function buildAttentionQueue(summary: GateOperationsSummary, failedNotifications: number, failedNotificationAgeMinutes: number | null, now = new Date()): AttentionItem[] {
  const queue: AttentionItem[] = [];
  if (summary.longStays > 0) queue.push({ key: "long-stays", kind: "long-stay", count: summary.longStays, urgency: 80, occurredAt: null });
  if (failedNotifications > 0) queue.push({ key: "failed-notifications", kind: "failed-notification", count: failedNotifications, urgency: 90, occurredAt: timestampFromAge(now, failedNotificationAgeMinutes) });
  if (summary.hardwareBacklog > 0) queue.push({ key: "hardware-backlog", kind: "hardware-backlog", count: summary.hardwareBacklog, urgency: 60, occurredAt: timestampFromAge(now, summary.oldestHardwareBacklogAgeMinutes) });
  if (summary.deadHardwareCommands > 0) queue.push({ key: "hardware-failures", kind: "hardware-failure", count: summary.deadHardwareCommands, urgency: 100, occurredAt: null });
  if (summary.unresolvedExceptions > 0) queue.push({ key: "pending-exceptions", kind: "pending-exception", count: summary.unresolvedExceptions, urgency: 50, occurredAt: timestampFromAge(now, summary.oldestUnresolvedExceptionAgeMinutes) });
  if (summary.connectivityIncidents24h > 0) queue.push({ key: "connectivity-incidents", kind: "connectivity-incident", count: summary.connectivityIncidents24h, urgency: 40, occurredAt: null });
  return queue.sort((a, b) => b.urgency - a.urgency || Date.parse(b.occurredAt ?? "1970-01-01") - Date.parse(a.occurredAt ?? "1970-01-01"));
}

export function shapeOperationsDashboard(source: OperationsDashboardSource): OperationsDashboardModel {
  const attention = buildAttentionQueue(source.summary, source.failedNotifications, source.failedNotificationAgeMinutes, source.now);
  return {
    summary: {
      currentVisitors: source.currentVisitorsTotal,
      todayGateActivity: source.todayGateActivity,
      pendingNotifications: source.pendingNotifications,
      failedNotifications: source.failedNotifications,
      pendingHardwareCommands: source.summary.hardwareBacklog,
      longStayAlerts: source.summary.longStays,
      needsAttention: attention.reduce((total, item) => total + item.count, 0),
      connectivityIncidents: source.summary.connectivityIncidents24h,
      activeDevices: source.summary.activeDevices,
      devicesStale: source.summary.devicesStale,
    },
    currentVisitors: source.currentVisitors,
    currentVisitorsTotalAvailable: source.currentVisitorsTotalAvailable,
    notificationsError: source.notificationsError,
    todayGateActivityAvailable: source.todayGateActivityAvailable,
    currentVisitorsError: source.currentVisitorsError,
    currentVisitorsPermissionLimited: source.currentVisitorsPermissionLimited,
    activityError: source.activityError,
    activityPermissionLimited: source.activityPermissionLimited,
    activityDeviceEventIds: source.activityDeviceEventIds,
    attention,
  };
}
