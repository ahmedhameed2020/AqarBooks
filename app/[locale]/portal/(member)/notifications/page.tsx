import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { PortalNotificationsClient, type PortalNotificationItem } from "./portal-notifications-client";

export default async function PortalNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title_ar, title_en, body_ar, body_en, action_url, priority, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) console.error("[PortalNotificationsPage] notification query failed:", error.message);

  const items: PortalNotificationItem[] = (data ?? []).map((notification) => ({
    id: notification.id,
    type: notification.type,
    titleAr: notification.title_ar,
    titleEn: notification.title_en,
    bodyAr: notification.body_ar,
    bodyEn: notification.body_en,
    actionUrl: notification.action_url,
    priority: notification.priority,
    isRead: notification.is_read,
    createdAt: notification.created_at,
  }));

  return <PortalNotificationsClient notifications={items} locale={locale as "ar" | "en"} />;
}
