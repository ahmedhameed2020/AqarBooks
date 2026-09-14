import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalPageHeader } from "../../portal-ui";
import { STATUS_LABELS_FOR_DETAIL } from "./status-labels";

export default async function PortalMaintenanceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; requestId: string }>;
}) {
  const { locale, requestId } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, request_no, title, description, status, priority, submitted_at, unit_id, category_id")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) notFound();

  const [{ data: unit }, { data: category }, { data: updates }] = await Promise.all([
    supabase.from("units").select("code").eq("id", request.unit_id).maybeSingle(),
    supabase.from("maintenance_categories").select("name_ar, name_en").eq("id", request.category_id).maybeSingle(),
    supabase
      .from("maintenance_request_updates")
      .select("id, note, previous_status, resulting_status, visibility, created_at")
      .eq("maintenance_request_id", request.id)
      .order("created_at", { ascending: false }),
  ]);

  const label = STATUS_LABELS_FOR_DETAIL[request.status];

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={request.title}
        description={`${request.request_no} · ${unit?.code ?? "—"} · ${category ? (isAr ? category.name_ar : category.name_en) : "—"}`}
      >
          <Link href="/portal/maintenance" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
            {isAr ? "كل الطلبات" : "All Requests"}
          </Link>
      </PortalPageHeader>

      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={label.tone}>{isAr ? label.ar : label.en}</Badge>
          <Badge variant="outline">{request.priority}</Badge>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {request.description}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-950 dark:text-white">{isAr ? "التحديثات" : "Updates"}</h2>
        {(updates ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card p-6 text-center text-xs text-slate-500">
            {isAr ? "لا توجد تحديثات بعد." : "No updates yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {(updates ?? []).map((u) => (
              <article key={u.id} className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>{new Date(u.created_at).toLocaleString(isAr ? "ar-EG" : "en-US")}</span>
                  {u.resulting_status ? <Badge variant="outline">{u.resulting_status}</Badge> : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{u.note}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
