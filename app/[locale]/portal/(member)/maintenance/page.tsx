import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalMaintenanceClient, type PortalMaintenanceRequestItem } from "./portal-maintenance-client";

type RequestRow = {
  id: string;
  request_no: string;
  title: string;
  status: PortalMaintenanceRequestItem["status"];
  priority: PortalMaintenanceRequestItem["priority"];
  submitted_at: string;
  unit_id: string;
  category_id: string;
};

export default async function PortalMaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: requestsData, error } = await supabase
    .from("maintenance_requests")
    .select("id, request_no, title, status, priority, submitted_at, unit_id, category_id")
    .order("created_at", { ascending: false });

  if (error) console.error("[PortalMaintenancePage] requests query failed:", error.message);

  const requests = (requestsData ?? []) as RequestRow[];
  const unitIds = [...new Set(requests.map((r) => r.unit_id))];
  const categoryIds = [...new Set(requests.map((r) => r.category_id))];
  const requestIds = requests.map((r) => r.id);

  const [{ data: units }, { data: categories }, { data: updates }] = await Promise.all([
    unitIds.length ? supabase.from("units").select("id, code").in("id", unitIds) : { data: [] },
    categoryIds.length
      ? supabase.from("maintenance_categories").select("id, name_ar, name_en").in("id", categoryIds)
      : { data: [] },
    requestIds.length
      ? supabase
          .from("maintenance_request_updates")
          .select("maintenance_request_id, note, created_at")
          .eq("visibility", "MEMBER_VISIBLE")
          .in("maintenance_request_id", requestIds)
          .order("created_at", { ascending: false })
      : { data: [] },
  ]);

  const unitById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const categoryById = new Map((categories ?? []).map((c) => [c.id, isAr ? c.name_ar : c.name_en]));
  const latestUpdateByRequest = new Map<string, string>();
  for (const update of updates ?? []) {
    if (!latestUpdateByRequest.has(update.maintenance_request_id)) {
      latestUpdateByRequest.set(update.maintenance_request_id, update.note);
    }
  }

  const items: PortalMaintenanceRequestItem[] = requests.map((r) => ({
    id: r.id,
    requestNo: r.request_no,
    title: r.title,
    status: r.status,
    priority: r.priority,
    submittedAt: r.submitted_at,
    unitCode: unitById.get(r.unit_id) ?? "—",
    categoryName: categoryById.get(r.category_id) ?? "—",
    latestUpdate: latestUpdateByRequest.get(r.id) ?? null,
  }));

  return <PortalMaintenanceClient requests={items} locale={locale as "ar" | "en"} />;
}
