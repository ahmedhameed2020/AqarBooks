import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  CommandCenterMaintenanceItem,
  CommandCenterModule,
  CommandCenterNotificationItem,
  CommandCenterVehicleItem,
  CommandCenterVisitorItem,
  PortalCommandCenterDTO,
} from "./unit-command-center-types";

type PortalSupabaseClient = SupabaseClient<Database>;

type MaintenanceRow = Pick<
  Database["public"]["Tables"]["maintenance_requests"]["Row"],
  "id" | "request_no" | "title" | "status" | "priority" | "submitted_at" | "unit_id"
>;

type VisitorRow = Pick<
  Database["public"]["Tables"]["visitor_invitations"]["Row"],
  "id" | "invitation_no" | "guest_name" | "valid_until" | "created_at" | "unit_id"
>;

type VehicleRow = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "plate_number" | "make" | "model" | "created_at" | "unit_id"
>;

type NotificationRow = Pick<
  Database["public"]["Tables"]["notifications"]["Row"],
  | "id"
  | "title_ar"
  | "title_en"
  | "body_ar"
  | "body_en"
  | "action_url"
  | "priority"
  | "created_at"
>;

type QueryResult<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
  count: number | null;
};

const emptyQueryResult = <Row>(): QueryResult<Row> => ({ data: [], error: null, count: 0 });

export async function loadPortalCommandCenter(
  supabase: PortalSupabaseClient,
  input: { organizationId: string; memberId: string },
): Promise<PortalCommandCenterDTO> {
  const { organizationId, memberId } = input;
  const [maintenanceAccess, visitorAccess, unitExperienceAccess] = await Promise.all([
    supabase.rpc("maintenance_module_enabled", { p_organization_id: organizationId }),
    supabase.rpc("visitor_management_enabled", { p_organization_id: organizationId }),
    supabase.rpc("unit_experience_enabled", { p_organization_id: organizationId }),
  ]);

  const access = {
    maintenance: maintenanceAccess.data === true && !maintenanceAccess.error,
    visitors: visitorAccess.data === true && !visitorAccess.error,
    unitExperience: unitExperienceAccess.data === true && !unitExperienceAccess.error,
  };
  const unavailableModules: CommandCenterModule[] = [];

  if (maintenanceAccess.error) unavailableModules.push("maintenance");
  if (visitorAccess.error) unavailableModules.push("visitors");
  if (unitExperienceAccess.error) unavailableModules.push("unitExperience");

  const now = new Date().toISOString();
  const maintenancePromise: PromiseLike<QueryResult<MaintenanceRow>> = access.maintenance
    ? supabase
        .from("maintenance_requests")
        .select("id, request_no, title, status, priority, submitted_at, unit_id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("requester_member_id", memberId)
        .in("status", ["SUBMITTED", "TRIAGED", "IN_PROGRESS", "WAITING"])
        .order("submitted_at", { ascending: false })
        .limit(3)
    : Promise.resolve(emptyQueryResult<MaintenanceRow>());

  const visitorPromise: PromiseLike<QueryResult<VisitorRow>> = access.visitors
    ? supabase
        .from("visitor_invitations")
        .select("id, invitation_no, guest_name, valid_until, created_at, unit_id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("invited_by_member_id", memberId)
        .eq("status", "ACTIVE")
        .gt("valid_until", now)
        .order("valid_until", { ascending: true })
        .limit(3)
    : Promise.resolve(emptyQueryResult<VisitorRow>());

  const vehiclePromise: PromiseLike<QueryResult<VehicleRow>> = access.unitExperience
    ? supabase
        .from("vehicles")
        .select("id, plate_number, make, model, created_at, unit_id", { count: "exact" })
        .eq("organization_id", organizationId)
        .eq("member_id", memberId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(3)
    : Promise.resolve(emptyQueryResult<VehicleRow>());

  const notificationPromise: PromiseLike<QueryResult<NotificationRow>> = access.unitExperience
    ? supabase
        .from("notifications")
        .select("id, title_ar, title_en, body_ar, body_en, action_url, priority, created_at", {
          count: "exact",
        })
        .eq("organization_id", organizationId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(4)
    : Promise.resolve(emptyQueryResult<NotificationRow>());

  const [maintenanceResult, visitorResult, vehicleResult, notificationResult] = await Promise.all([
    maintenancePromise,
    visitorPromise,
    vehiclePromise,
    notificationPromise,
  ]);

  const results: Array<[CommandCenterModule, { error: { message: string } | null }]> = [
    ["maintenance", maintenanceResult],
    ["visitors", visitorResult],
    ["unitExperience", vehicleResult],
    ["unitExperience", notificationResult],
  ];
  for (const [module, result] of results) {
    if (!result.error) continue;
    if (!unavailableModules.includes(module)) unavailableModules.push(module);
    console.error(`[loadPortalCommandCenter] ${module} query failed:`, result.error.message);
  }

  const maintenanceRows = (maintenanceResult.data ?? []) as MaintenanceRow[];
  const visitorRows = (visitorResult.data ?? []) as VisitorRow[];
  const vehicleRows = (vehicleResult.data ?? []) as VehicleRow[];
  const notificationRows = (notificationResult.data ?? []) as NotificationRow[];
  const unitIds = [
    ...new Set([
      ...maintenanceRows.map((item) => item.unit_id),
      ...visitorRows.map((item) => item.unit_id),
      ...vehicleRows.map((item) => item.unit_id),
    ]),
  ];

  const unitCodeById = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: unitRows, error: unitsError } = await supabase
      .from("units")
      .select("id, code")
      .eq("organization_id", organizationId)
      .in("id", unitIds);
    if (unitsError) {
      console.error("[loadPortalCommandCenter] unit labels query failed:", unitsError.message);
    } else {
      for (const unit of unitRows ?? []) unitCodeById.set(unit.id, unit.code);
    }
  }

  const maintenance: CommandCenterMaintenanceItem[] = maintenanceRows.map((item) => ({
    id: item.id,
    requestNo: item.request_no,
    title: item.title,
    status: item.status as CommandCenterMaintenanceItem["status"],
    priority: item.priority,
    submittedAt: item.submitted_at,
    unitCode: unitCodeById.get(item.unit_id) ?? "—",
  }));
  const visitors: CommandCenterVisitorItem[] = visitorRows.map((item) => ({
    id: item.id,
    invitationNo: item.invitation_no,
    guestName: item.guest_name,
    validUntil: item.valid_until,
    unitCode: unitCodeById.get(item.unit_id) ?? "—",
  }));
  const vehicles: CommandCenterVehicleItem[] = vehicleRows.map((item) => ({
    id: item.id,
    plateNumber: item.plate_number,
    make: item.make,
    model: item.model,
    createdAt: item.created_at,
    unitCode: unitCodeById.get(item.unit_id) ?? "—",
  }));
  const notifications: CommandCenterNotificationItem[] = notificationRows.map((item) => ({
    id: item.id,
    titleAr: item.title_ar,
    titleEn: item.title_en,
    bodyAr: item.body_ar,
    bodyEn: item.body_en,
    actionUrl: item.action_url,
    priority: item.priority,
    createdAt: item.created_at,
  }));

  return {
    access,
    counts: {
      openMaintenance: maintenanceResult.error ? 0 : (maintenanceResult.count ?? 0),
      activeVisitors: visitorResult.error ? 0 : (visitorResult.count ?? 0),
      activeVehicles: vehicleResult.error ? 0 : (vehicleResult.count ?? 0),
      unreadNotifications: notificationResult.error ? 0 : (notificationResult.count ?? 0),
    },
    maintenance,
    visitors,
    vehicles,
    notifications,
    unavailableModules,
  };
}
