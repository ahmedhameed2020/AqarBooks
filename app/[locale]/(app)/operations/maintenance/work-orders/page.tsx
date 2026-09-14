import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { WorkOrdersClient, type WorkOrderListItem } from "./work-orders-client";

type WorkOrderRow = {
  id: string;
  work_order_no: string;
  maintenance_request_id: string;
  property_id: string;
  unit_id: string;
  status: WorkOrderListItem["status"];
  assigned_user_id: string | null;
  supplier_id: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  sla_due_at: string | null;
  created_at: string;
};

export default async function MaintenanceWorkOrdersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.work_orders.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: moduleEnabled } = await supabase.rpc("maintenance_module_enabled", {
    p_organization_id: organization.id,
  });
  if (!moduleEnabled) notFound();

  const { data: rows, error } = await supabase
    .from("work_orders")
    .select("id, work_order_no, maintenance_request_id, property_id, unit_id, status, assigned_user_id, supplier_id, scheduled_start_at, scheduled_end_at, sla_due_at, created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) console.error("[MaintenanceWorkOrdersPage] query failed:", error.message);
  const workOrders = (rows ?? []) as WorkOrderRow[];

  const requestIds = [...new Set(workOrders.map((wo) => wo.maintenance_request_id))];
  const propertyIds = [...new Set(workOrders.map((wo) => wo.property_id))];
  const unitIds = [...new Set(workOrders.map((wo) => wo.unit_id))];
  const assigneeIds = [...new Set(workOrders.map((wo) => wo.assigned_user_id).filter(Boolean))] as string[];
  const supplierIds = [...new Set(workOrders.map((wo) => wo.supplier_id).filter(Boolean))] as string[];

  const [{ data: requests }, { data: properties }, { data: units }, { data: profiles }, { data: suppliers }] = await Promise.all([
    requestIds.length ? supabase.from("maintenance_requests").select("id, request_no, title").in("id", requestIds) : { data: [] },
    propertyIds.length ? supabase.from("properties").select("id, name").in("id", propertyIds) : { data: [] },
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    assigneeIds.length ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds) : { data: [] },
    supplierIds.length ? supabase.from("suppliers").select("id, name").in("id", supplierIds) : { data: [] },
  ]);

  const requestById = new Map((requests ?? []).map((r) => [r.id, r]));
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const unitById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const supplierById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  const items: WorkOrderListItem[] = workOrders.map((wo) => {
    const request = requestById.get(wo.maintenance_request_id);
    return {
      id: wo.id,
      workOrderNo: wo.work_order_no,
      requestNo: request?.request_no ?? "—",
      requestTitle: request?.title ?? "—",
      status: wo.status,
      unitCode: unitById.get(wo.unit_id) ?? "—",
      propertyName: propertyById.get(wo.property_id) ?? "—",
      assigneeName: wo.assigned_user_id ? (profileById.get(wo.assigned_user_id) ?? "—") : wo.supplier_id ? (supplierById.get(wo.supplier_id) ?? "—") : "—",
      scheduledStartAt: wo.scheduled_start_at,
      scheduledEndAt: wo.scheduled_end_at,
      slaDueAt: wo.sla_due_at,
      createdAt: wo.created_at,
    };
  });

  return <WorkOrdersClient workOrders={items} locale={locale as "ar" | "en"} />;
}
