"use client";

import { useMemo, useState, useTransition } from "react";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/actions/unit-experience";
import { EmptyState, PortalPageHeader, Segmented, StatCard } from "../portal-ui";
import { formatPortalDate } from "../vehicles/vehicle-labels";

export interface PortalNotificationItem {
  id: string;
  type: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  actionUrl: string | null;
  priority: "LOW" | "NORMAL" | "HIGH";
  isRead: boolean;
  createdAt: string;
}

type Filter = "ALL" | "UNREAD" | "HIGH";

export function PortalNotificationsClient({
  notifications,
  locale,
}: {
  notifications: PortalNotificationItem[];
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const highCount = notifications.filter((n) => n.priority === "HIGH").length;
  const visible = useMemo(() => {
    if (filter === "UNREAD") return notifications.filter((n) => !n.isRead);
    if (filter === "HIGH") return notifications.filter((n) => n.priority === "HIGH");
    return notifications;
  }, [filter, notifications]);

  function markOne(notificationId: string) {
    setPendingId(notificationId);
    setMessage(null);
    startTransition(async () => {
      const result = await markNotificationReadAction({ notificationId });
      setMessage(result.ok ? null : result.error);
      setPendingId(null);
    });
  }

  function markAll() {
    setPendingId("all");
    setMessage(null);
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      setMessage(result.ok ? (isAr ? "تم تحديث الإشعارات" : "Notifications updated") : result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "الإشعارات" : "Notifications"}
        description={
          isAr
            ? "تنبيهات مرتبطة بوحداتك: الصيانة، الزوار، المركبات، والاستحقاقات."
            : "Unit-linked alerts for maintenance, visitors, vehicles, and dues."
        }
      >
        <Button type="button" variant="outline" size="sm" disabled={isPending || unreadCount === 0} onClick={markAll} className="h-9 gap-2 rounded-xl text-xs font-semibold">
          <CheckCheck className="size-4" />
          {isAr ? "تحديد الكل كمقروء" : "Mark all read"}
        </Button>
      </PortalPageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={isAr ? "كل الإشعارات" : "All notifications"} value={notifications.length} icon={<Bell className="size-4" />} />
        <StatCard label={isAr ? "غير مقروءة" : "Unread"} value={unreadCount} tone={unreadCount > 0 ? "accent" : "neutral"} icon={<Circle className="size-4" />} />
        <StatCard label={isAr ? "أولوية عالية" : "High priority"} value={highCount} tone={highCount > 0 ? "negative" : "neutral"} />
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        ariaLabel={isAr ? "تصفية الإشعارات" : "Filter notifications"}
        options={[
          { value: "ALL", label: isAr ? "الكل" : "All", count: notifications.length },
          { value: "UNREAD", label: isAr ? "غير مقروءة" : "Unread", count: unreadCount, tone: "accent" },
          { value: "HIGH", label: isAr ? "عالية" : "High", count: highCount, tone: "negative" },
        ]}
      />

      {message ? <p className="text-xs font-semibold text-slate-500">{message}</p> : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-5" />}
          title={isAr ? "لا توجد إشعارات" : "No notifications"}
          description={isAr ? "عندما يحدث نشاط مهم على وحداتك سيظهر هنا." : "Important activity on your units will appear here."}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((notification) => {
            const title = isAr ? notification.titleAr : notification.titleEn;
            const body = isAr ? notification.bodyAr : notification.bodyEn;
            return (
              <article
                key={notification.id}
                className={`rounded-2xl border p-4 shadow-2xs ${
                  notification.isRead
                    ? "border-border/70 bg-card"
                    : "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/20"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {!notification.isRead ? <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">{isAr ? "جديد" : "New"}</Badge> : null}
                      {notification.priority === "HIGH" ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">{isAr ? "مهم" : "High"}</Badge> : null}
                      <span className="text-[11px] font-semibold text-slate-400">{formatPortalDate(notification.createdAt, locale)}</span>
                    </div>
                    {notification.actionUrl ? (
                      <Link href={notification.actionUrl} locale={locale} className="block text-sm font-bold text-slate-950 hover:text-indigo-700 dark:text-white">
                        {title}
                      </Link>
                    ) : (
                      <h2 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h2>
                    )}
                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>
                  </div>
                  {!notification.isRead ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending && pendingId === notification.id}
                      onClick={() => markOne(notification.id)}
                      className="h-8 shrink-0 rounded-xl text-xs"
                    >
                      {isAr ? "مقروء" : "Mark read"}
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
