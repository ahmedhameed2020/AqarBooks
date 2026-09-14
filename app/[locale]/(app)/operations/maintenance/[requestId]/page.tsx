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
import type { MaintenancePriority, MaintenanceStatus } from "@/app/[locale]/portal/(member)/maintenance/portal-maintenance-client";
import { MaintenanceAttachmentsPanel, type MaintenanceAttachmentItem } from "@/app/[locale]/portal/(member)/maintenance/maintenance-attachments-client";
import { StaffMaintenanceUpdateForm } from "./staff-maintenance-update-form";

export default async function StaffMaintenanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const { locale, requestId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "operations.maintenance.view", locale);
  if (denied) return denied;

  const supabase = await createClient();
  const { data: moduleEnabled } = await supabase.rpc("maintenance_module_enabled", {
    p_organization_id: organization.id,
  });
  const { data: canManageAttachments } = await supabase.rpc("maintenance_attachment_staff_can_manage", {
    p_organization_id: organization.id,
  });

  if (!moduleEnabled) notFound();

  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, request_no, title, description, status, priority, submitted_at, unit_id, property_id, requester_member_id, category_id")
    .eq("id", requestId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!request) notFound();

  const [{ data: unit }, { data: property }, { data: member }, { data: categories }, { data: updates }, { data: attachments }] = await Promise.all([
    supabase.from("units").select("code").eq("id", request.unit_id).maybeSingle(),
    supabase.from("properties").select("name").eq("id", request.property_id).maybeSingle(),
    supabase.from("members").select("full_name, email, phone").eq("id", request.requester_member_id).maybeSingle(),
    supabase.from("maintenance_categories").select("id, name_ar, name_en").eq("organization_id", organization.id).eq("is_active", true).order("sort_order"),
    supabase.from("maintenance_request_updates").select("id, note, visibility, previous_status, resulting_status, created_at").eq("maintenance_request_id", request.id).order("created_at", { ascending: false }),
    supabase
      .from("maintenance_request_attachments")
      .select("id, kind, visibility, original_file_name, mime_type, byte_size, created_at, ready_at, uploaded_by_member_id")
      .eq("maintenance_request_id", request.id)
      .eq("status", "READY")
      .order("created_at", { ascending: false }),
  ]);

  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, label: isAr ? c.name_ar : c.name_en }));
  const category = categoryOptions.find((c) => c.id === request.category_id);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{request.request_no}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{request.title}</h1>
          <p className="text-xs font-medium text-slate-500">
            {property?.name ?? "—"} · {unit?.code ?? "—"} · {member?.full_name ?? "—"} · {category?.label ?? "—"}
          </p>
        </div>
        <Link href="/operations/maintenance" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "كل الطلبات" : "All Requests"}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{request.status}</Badge>
            <Badge variant="outline">{request.priority}</Badge>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{request.description}</p>
        </section>

        <aside className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "بيانات العضو" : "Member"}</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div><dt className="text-slate-400">{isAr ? "الاسم" : "Name"}</dt><dd className="font-semibold">{member?.full_name ?? "—"}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "البريد" : "Email"}</dt><dd className="font-semibold">{member?.email ?? "—"}</dd></div>
            <div><dt className="text-slate-400">{isAr ? "الهاتف" : "Phone"}</dt><dd className="font-semibold">{member?.phone ?? "—"}</dd></div>
          </dl>
        </aside>
      </div>

      <StaffMaintenanceUpdateForm
        requestId={request.id}
        status={request.status as MaintenanceStatus}
        priority={request.priority as MaintenancePriority}
        categoryId={request.category_id}
        categories={categoryOptions}
        locale={locale as "ar" | "en"}
      />

      <MaintenanceAttachmentsPanel
        requestId={request.id}
        attachments={(attachments ?? []) as MaintenanceAttachmentItem[]}
        locale={locale as "ar" | "en"}
        canUpload={Boolean(canManageAttachments) && !["CANCELLED", "CLOSED"].includes(request.status)}
        showVisibility
        allowedKinds={["ISSUE", "BEFORE", "AFTER", "INVOICE", "OTHER"]}
        defaultKind="BEFORE"
        defaultVisibility="STAFF_ONLY"
        canChooseVisibility
      />

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "سجل التحديثات" : "Update History"}</h2>
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
