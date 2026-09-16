import {
  Activity,
  ArrowUpLeft,
  Bell,
  CarFront,
  Clock3,
  Plus,
  TicketCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortalCommandCenterDTO } from "@/lib/portal/unit-command-center-types";
import { formatPortalDate } from "./vehicles/vehicle-labels";

const maintenanceStatusLabels = {
  SUBMITTED: { ar: "تم الإرسال", en: "Submitted" },
  TRIAGED: { ar: "قيد الفرز", en: "Triaged" },
  IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress" },
  WAITING: { ar: "في الانتظار", en: "Waiting" },
} as const;

function CommandMetric({
  href,
  locale,
  label,
  value,
  icon,
  tone,
}: {
  href: string;
  locale: "ar" | "en";
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "indigo" | "amber" | "emerald" | "sky";
}) {
  return (
    <Link
      href={href}
      locale={locale}
      className={cn(
        "group flex min-h-24 items-start justify-between gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md",
        tone === "indigo" && "border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/20",
        tone === "amber" && "border-amber-200/70 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
        tone === "emerald" && "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20",
        tone === "sky" && "border-sky-200/70 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20",
      )}
    >
      <div>
        <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value}</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</p>
      </div>
      <span className="rounded-xl border border-white/80 bg-white/80 p-2.5 text-slate-600 shadow-sm transition group-hover:scale-105 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300">
        {icon}
      </span>
    </Link>
  );
}

function SectionHeading({
  title,
  href,
  linkLabel,
  locale,
}: {
  title: string;
  href: string;
  linkLabel: string;
  locale: "ar" | "en";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h3>
      <Link href={href} locale={locale} className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
        {linkLabel}
      </Link>
    </div>
  );
}

export function PortalCommandCenter({
  data,
  locale,
}: {
  data: PortalCommandCenterDTO;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";
  const hasAnyModule = data.access.maintenance || data.access.visitors || data.access.unitExperience;
  if (!hasAnyModule && data.unavailableModules.length === 0) return null;

  const recentNotifications = data.notifications.slice(0, 2);
  const openMaintenance = data.maintenance.slice(0, 2);
  const upcomingVisitors = data.visitors.slice(0, 2);
  const recentVehicles = data.vehicles.slice(0, 2);
  const hasAttentionItems = recentNotifications.length > 0 || openMaintenance.length > 0;
  const hasAccessItems = upcomingVisitors.length > 0 || recentVehicles.length > 0;

  return (
    <section className="overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-white via-white to-indigo-50/70 shadow-sm dark:border-indigo-900/70 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/20">
      <div className="border-b border-indigo-100/80 p-5 sm:p-6 dark:border-indigo-900/60">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <Activity className="size-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-950 sm:text-lg dark:text-white">
                  {isAr ? "مركز إدارة وحداتك" : "Your unit command center"}
                </h2>
                <Badge variant="outline" className="border-indigo-200 bg-white/80 text-[10px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  {isAr ? "مباشر" : "LIVE"}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                {isAr
                  ? "كل ما يحتاج انتباهك في الصيانة والزوار والمركبات والإشعارات، من شاشة واحدة."
                  : "Maintenance, visitors, vehicles, and notifications that need your attention—in one place."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {data.access.maintenance ? (
              <Link href="/portal/maintenance/new" locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 gap-1.5 rounded-xl bg-white/80 text-xs dark:bg-slate-950/80" })}>
                <Plus className="size-3.5" />
                {isAr ? "طلب صيانة" : "Maintenance"}
              </Link>
            ) : null}
            {data.access.visitors ? (
              <Link href="/portal/visitors/new" locale={locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 gap-1.5 rounded-xl bg-white/80 text-xs dark:bg-slate-950/80" })}>
                <Plus className="size-3.5" />
                {isAr ? "دعوة زائر" : "Invite visitor"}
              </Link>
            ) : null}
            {data.access.unitExperience ? (
              <Link href="/portal/vehicles/new" locale={locale} className={buttonVariants({ size: "sm", className: "h-9 gap-1.5 rounded-xl bg-indigo-600 text-xs text-white hover:bg-indigo-700" })}>
                <Plus className="size-3.5" />
                {isAr ? "إضافة مركبة" : "Add vehicle"}
              </Link>
            ) : null}
          </div>
        </div>

        {data.unavailableModules.length > 0 ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <TriangleAlert className="size-4 shrink-0" />
            {isAr
              ? "تعذر تحديث بعض بطاقات الخدمات الآن. بقية بيانات حسابك ما زالت متاحة."
              : "Some service cards could not refresh. The rest of your account remains available."}
          </div>
        ) : null}
      </div>

      {hasAnyModule ? (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.access.maintenance ? (
              <CommandMetric href="/portal/maintenance" locale={locale} label={isAr ? "طلبات صيانة مفتوحة" : "Open maintenance"} value={data.counts.openMaintenance} icon={<Wrench className="size-4" />} tone="amber" />
            ) : null}
            {data.access.visitors ? (
              <CommandMetric href="/portal/visitors" locale={locale} label={isAr ? "تصاريح زوار سارية" : "Active visitor passes"} value={data.counts.activeVisitors} icon={<TicketCheck className="size-4" />} tone="emerald" />
            ) : null}
            {data.access.unitExperience ? (
              <CommandMetric href="/portal/vehicles" locale={locale} label={isAr ? "مركبات نشطة" : "Active vehicles"} value={data.counts.activeVehicles} icon={<CarFront className="size-4" />} tone="sky" />
            ) : null}
            {data.access.unitExperience ? (
              <CommandMetric href="/portal/notifications" locale={locale} label={isAr ? "إشعارات غير مقروءة" : "Unread notifications"} value={data.counts.unreadNotifications} icon={<Bell className="size-4" />} tone="indigo" />
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {(data.access.maintenance || data.access.unitExperience) ? (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-white/70 p-4 dark:bg-slate-950/60">
                <SectionHeading title={isAr ? "يحتاج انتباهك" : "Needs your attention"} href={data.access.unitExperience ? "/portal/notifications" : "/portal/maintenance"} linkLabel={isAr ? "عرض التفاصيل" : "View details"} locale={locale} />
                {hasAttentionItems ? (
                  <div className="space-y-2">
                    {recentNotifications.map((notification) => {
                      const title = isAr ? notification.titleAr : notification.titleEn;
                      const body = isAr ? notification.bodyAr : notification.bodyEn;
                      const content = (
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Bell className="size-3.5" /></span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-950 dark:text-white">{title}</p>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{body}</p>
                          </div>
                        </div>
                      );
                      return notification.actionUrl ? (
                        <Link key={notification.id} href={notification.actionUrl} locale={locale} className="flex items-center gap-2 rounded-xl border border-border/60 bg-slate-50/70 p-3 hover:border-indigo-300 dark:bg-slate-900/60">
                          {content}<ArrowUpLeft className="size-3.5 shrink-0 -rotate-45 text-slate-400 rtl:rotate-[-135deg]" />
                        </Link>
                      ) : (
                        <div key={notification.id} className="flex items-center gap-2 rounded-xl border border-border/60 bg-slate-50/70 p-3 dark:bg-slate-900/60">{content}</div>
                      );
                    })}
                    {openMaintenance.map((request) => (
                      <Link key={request.id} href={`/portal/maintenance/${request.id}`} locale={locale} className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50/70 p-3 hover:border-amber-300 dark:bg-slate-900/60">
                        <span className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Wrench className="size-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-950 dark:text-white">{request.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{request.unitCode} · {isAr ? maintenanceStatusLabels[request.status].ar : maintenanceStatusLabels[request.status].en}</p>
                        </div>
                        {request.priority === "URGENT" || request.priority === "HIGH" ? <span className="size-2 rounded-full bg-rose-500" aria-label={isAr ? "أولوية مرتفعة" : "High priority"} /> : null}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-4 py-6 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{isAr ? "لا توجد عناصر عاجلة" : "Nothing needs attention"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{isAr ? "أنت على اطلاع بكل جديد." : "You are all caught up."}</p>
                  </div>
                )}
              </div>
            ) : null}

            {(data.access.visitors || data.access.unitExperience) ? (
              <div className="space-y-3 rounded-2xl border border-border/70 bg-white/70 p-4 dark:bg-slate-950/60">
                <SectionHeading title={isAr ? "الوصول والتنقل" : "Access and mobility"} href={data.access.visitors ? "/portal/visitors" : "/portal/vehicles"} linkLabel={isAr ? "إدارة الكل" : "Manage all"} locale={locale} />
                {hasAccessItems ? (
                  <div className="space-y-2">
                    {upcomingVisitors.map((visitor) => (
                      <Link key={visitor.id} href={`/portal/visitors/${visitor.id}`} locale={locale} className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50/70 p-3 hover:border-emerald-300 dark:bg-slate-900/60">
                        <span className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><TicketCheck className="size-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-950 dark:text-white">{visitor.guestName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><Clock3 className="size-3" />{visitor.unitCode} · {formatPortalDate(visitor.validUntil, locale)}</p>
                        </div>
                      </Link>
                    ))}
                    {recentVehicles.map((vehicle) => (
                      <Link key={vehicle.id} href={`/portal/vehicles/${vehicle.id}`} locale={locale} className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50/70 p-3 hover:border-sky-300 dark:bg-slate-900/60">
                        <span className="rounded-lg bg-sky-100 p-2 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><CarFront className="size-3.5" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-950 dark:text-white">{vehicle.plateNumber}</p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">{vehicle.unitCode}{vehicle.make || vehicle.model ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}` : ""}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center dark:border-slate-800 dark:bg-slate-900/50">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{isAr ? "لا توجد تصاريح أو مركبات نشطة" : "No active passes or vehicles"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{isAr ? "استخدم الإجراءات السريعة عند الحاجة." : "Use a quick action whenever you need one."}</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
