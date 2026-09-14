import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StaffMaintenanceClient, type StaffMaintenanceItem } from "./maintenance-client";

type RequestRow = {
  id: string;
  request_no: string;
  title: string;
  status: StaffMaintenanceItem["status"];
  priority: StaffMaintenanceItem["priority"];
  submitted_at: string;
  unit_id: string;
  property_id: string;
  requester_member_id: string;
  category_id: string;
};

export default async function MaintenanceOperationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  if (!moduleEnabled) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card p-6">
        <h1 className="text-lg font-black text-slate-950 dark:text-white">
          {isAr ? "الصيانة غير مفعلة" : "Maintenance is not enabled"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {isAr
            ? "فعّل استحقاق الصيانة لهذه المنشأة قبل استقبال طلبات من بوابة الملاك."
            : "Enable the maintenance entitlement for this organization before receiving owner portal requests."}
        </p>
      </div>
    );
  }

  const { data: requestData, error } = await supabase
    .from("maintenance_requests")
    .select("id, request_no, title, status, priority, submitted_at, unit_id, property_id, requester_member_id, category_id")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) console.error("[MaintenanceOperationsPage] query failed:", error.message);
  const requests = (requestData ?? []) as RequestRow[];

  const [{ data: units }, { data: properties }, { data: members }, { data: categories }] = await Promise.all([
    requests.length ? supabase.from("units").select("id, code").in("id", [...new Set(requests.map((r) => r.unit_id))]) : { data: [] },
    requests.length ? supabase.from("properties").select("id, name").in("id", [...new Set(requests.map((r) => r.property_id))]) : { data: [] },
    requests.length ? supabase.from("members").select("id, full_name").in("id", [...new Set(requests.map((r) => r.requester_member_id))]) : { data: [] },
    requests.length ? supabase.from("maintenance_categories").select("id, name_ar, name_en").in("id", [...new Set(requests.map((r) => r.category_id))]) : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p.name]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, isAr ? c.name_ar : c.name_en]));

  const items: StaffMaintenanceItem[] = requests.map((r) => ({
    id: r.id,
    requestNo: r.request_no,
    title: r.title,
    status: r.status,
    priority: r.priority,
    submittedAt: r.submitted_at,
    unitCode: unitById.get(r.unit_id) ?? "—",
    propertyName: propertyById.get(r.property_id) ?? "—",
    memberName: memberById.get(r.requester_member_id) ?? "—",
    categoryName: categoryById.get(r.category_id) ?? "—",
  }));

  return <StaffMaintenanceClient requests={items} locale={locale as "ar" | "en"} />;
}
