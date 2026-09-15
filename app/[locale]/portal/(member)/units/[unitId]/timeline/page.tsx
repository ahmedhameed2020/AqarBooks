import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalUnitTimelineClient, type PortalTimelineEvent } from "./portal-unit-timeline-client";

export default async function PortalUnitTimelinePage({
  params,
}: {
  params: Promise<{ locale: string; unitId: string }>;
}) {
  const { locale, unitId } = await params;
  setRequestLocale(locale as Locale);

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const [{ data: unit }, { data: events, error }] = await Promise.all([
    supabase.from("units").select("id, code").eq("id", unitId).maybeSingle(),
    supabase.rpc("get_unit_timeline", {
      p_unit_id: unitId,
      p_cursor_occurred_at: null,
      p_cursor_event_id: null,
      p_limit: 50,
    }),
  ]);

  if (!unit || error) {
    if (error) console.error("[PortalUnitTimelinePage] timeline query failed:", error.message);
    notFound();
  }

  const items: PortalTimelineEvent[] = (events ?? []).map((event) => ({
    eventId: event.event_id,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    titleAr: event.title_ar,
    titleEn: event.title_en,
    summaryAr: event.summary_ar,
    summaryEn: event.summary_en,
    iconKey: event.icon_key,
    statusKey: event.status_key,
    sourceType: event.source_type,
    amount: event.amount,
    currency: event.currency,
  }));

  return <PortalUnitTimelineClient unitCode={unit.code} events={items} locale={locale as "ar" | "en"} />;
}
