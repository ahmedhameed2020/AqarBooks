import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { MaintenanceAttachmentsPanel, type MaintenanceAttachmentItem } from "@/app/[locale]/portal/(member)/maintenance/maintenance-attachments-client";
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from "../work-orders-client";
import { WorkOrderControls, type Option } from "./work-order-controls";

type WorkOrderRow = {
  id: string;
  organization_id: string;
  property_id: string;
  unit_id: string;
  maintenance_request_id: string;
  work_order_no: string;
  status: WorkOrderStatus;
  assigned_user_id: string | null;
  supplier_id: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  sla_due_at: string | null;
  started_at: string | null;
  waiting_at: string | null;
  resumed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  completion_summary: string | null;
  member_visible_summary: string | null;
};

export default async function WorkOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; workOrderId: string }>;
}) {
  const { locale, workOrderId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.work_orders.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const [{ data: moduleEnabled }, { data: canManage }, { data: canAssign }, { data: canComplete }, { data: canUploadAttachments }] = await Promise.all([
    supabase.rpc("maintenance_module_enabled", { p_organization_id: organization.id }),
    supabase.rpc("work_order_staff_can_manage", { p_organization_id: organization.id }),
    supabase.rpc("work_order_staff_can_assign", { p_organization_id: organization.id }),
    supabase.rpc("work_order_staff_can_complete", { p_organization_id: organization.id }),
    supabase.rpc("maintenance_attachment_staff_can_manage", { p_organization_id: organization.id }),
  ]);
  if (!moduleEnabled) notFound();

  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("id, organization_id, property_id, unit_id, maintenance_request_id, work_order_no, status, assigned_user_id, supplier_id, scheduled_start_at, scheduled_end_at, sla_due_at, started_at, waiting_at, resumed_at, completed_at, cancelled_at, completion_summary, member_visible_summary")
    .eq("id", workOrderId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!workOrder) notFound();
  const wo = workOrder as WorkOrderRow;

  const [{ data: request }, { data: property }, { data: unit }, { data: assignee }, { data: supplier }, { data: updates }, { data: attachments }, { data: memberships }, { data: suppliers }] = await Promise.all([
    supabase.from("maintenance_requests").select("id, request_no, title, status").eq("id", wo.maintenance_request_id).maybeSingle(),
    supabase.from("properties").select("name").eq("id", wo.property_id).maybeSingle(),
    supabase.from("units").select("code").eq("id", wo.unit_id).maybeSingle(),
    wo.assigned_user_id ? supabase.from("profiles").select("full_name").eq("id", wo.assigned_user_id).maybeSingle() : { data: null },
    wo.supplier_id ? supabase.from("suppliers").select("name").eq("id", wo.supplier_id).maybeSingle() : { data: null },
    supabase.from("work_order_updates").select("id, previous_status, resulting_status, note, visibility, created_at").eq("work_order_id", wo.id).order("created_at", { ascending: false }),
    supabase
      .from("maintenance_request_attachments")
      .select("id, kind, visibility, original_file_name, mime_type, byte_size, created_at, ready_at, uploaded_by_member_id")
      .eq("maintenance_request_id", wo.maintenance_request_id)
      .eq("status", "READY")
      .order("created_at", { ascending: false }),
    supabase.from("organization_memberships").select("user_id").eq("organization_id", organization.id).eq("status", "active").limit(100),
    supabase.from("suppliers").select("id, name").eq("organization_id", organization.id).eq("is_active", true).order("name").limit(100),
  ]);

  const userIds = (memberships ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id, full_name").in("id", userIds) : { data: [] };
  const staffOptions: Option[] = (profiles ?? []).map((p) => ({ id: p.id, label: p.full_name ?? p.id }));
  const supplierOptions: Option[] = (suppliers ?? []).map((s) => ({ id: s.id, label: s.name }));
  const label = WORK_ORDER_STATUS_LABELS[wo.status];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{wo.work_order_no}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{request?.title ?? (isAr ? "أمر عمل" : "Work Order")}</h1>
          <p className="text-xs font-medium text-slate-500">
            {request?.request_no ?? "—"} · {property?.name ?? "—"} · {unit?.code ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/operations/maintenance/work-orders" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
            {isAr ? "كل أوامر العمل" : "All Work Orders"}
          </Link>
          <Link href={`/operations/maintenance/${wo.maintenance_request_id}`} locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
            {isAr ? "طلب الصيانة" : "Maintenance Request"}
          </Link>
        </div>
      </div>

      <section className="grid gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400">{isAr ? "الحالة" : "Status"}</p>
          <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400">{isAr ? "المسؤول" : "Assignee"}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{assignee?.full_name ?? supplier?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400">{isAr ? "الجدولة" : "Schedule"}</p>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {wo.scheduled_start_at ? new Date(wo.scheduled_start_at).toLocaleString(isAr ? "ar-EG" : "en-US") : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400">SLA</p>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {wo.sla_due_at ? new Date(wo.sla_due_at).toLocaleString(isAr ? "ar-EG" : "en-US") : "—"}
          </p>
        </div>
      </section>

      {wo.completion_summary || wo.member_visible_summary ? (
        <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "ملخص الإكمال" : "Completion Summary"}</h2>
          {wo.completion_summary ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{wo.completion_summary}</p> : null}
          {wo.member_visible_summary ? <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">{wo.member_visible_summary}</p> : null}
        </section>
      ) : null}

      <WorkOrderControls
        workOrderId={wo.id}
        status={wo.status}
        staffOptions={staffOptions}
        supplierOptions={supplierOptions}
        canManage={Boolean(canManage)}
        canAssign={Boolean(canAssign)}
        canComplete={Boolean(canComplete)}
        locale={locale as "ar" | "en"}
      />

      <MaintenanceAttachmentsPanel
        requestId={wo.maintenance_request_id}
        attachments={(attachments ?? []) as MaintenanceAttachmentItem[]}
        locale={locale as "ar" | "en"}
        canUpload={Boolean(canUploadAttachments) && !["COMPLETED", "CANCELLED"].includes(wo.status)}
        showVisibility
        allowedKinds={["ISSUE", "BEFORE", "AFTER", "INVOICE", "OTHER"]}
        defaultKind="AFTER"
        defaultVisibility="STAFF_ONLY"
        canChooseVisibility
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "سجل أمر العمل" : "Work Order History"}</h2>
        <div className="space-y-3">
          {(updates ?? []).map((u) => (
            <article key={u.id} className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>{new Date(u.created_at).toLocaleString(isAr ? "ar-EG" : "en-US")}</span>
                <Badge variant="outline">{u.visibility}</Badge>
                {u.resulting_status ? <Badge variant="outline">{u.resulting_status}</Badge> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{u.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
