import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, DoorOpen, Radio, Server, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccessEvidenceItem } from "@/lib/actions/gate-evidence";
import type { AttentionItem, OperationsDashboardModel } from "@/lib/gates/operations-dashboard";

const number = (value: number, isAr: boolean) => new Intl.NumberFormat(isAr ? "ar-QA" : "en-QA").format(value);
const dateTime = (value: string | null, isAr: boolean) => value ? new Intl.DateTimeFormat(isAr ? "ar-QA" : "en-QA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const duration = (enteredAt: string | null, isAr: boolean) => {
  if (!enteredAt) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(enteredAt)) / 60_000));
  if (minutes < 60) return isAr ? `${minutes} د` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return isAr ? `${hours} س` : `${hours}h`;
};
const decisionLabel = (decision: AccessEvidenceItem["decision"], isAr: boolean) => decision === "ALLOW" ? (isAr ? "مسموح" : "Allowed") : decision === "DENY" ? (isAr ? "مرفوض" : "Denied") : (isAr ? "تسوية" : "Reconciled");
const directionLabel = (direction: AccessEvidenceItem["direction"], isAr: boolean) => direction === "ENTRY" ? (isAr ? "دخول" : "Entry") : (isAr ? "خروج" : "Exit");
const gateLabel = (event: AccessEvidenceItem, isAr: boolean) => {
  if (!event.gateCode) return isAr ? "بوابة غير محددة" : "Gate not recorded";
  const name = isAr ? event.gateNameAr ?? event.gateNameEn : event.gateNameEn ?? event.gateNameAr;
  return name ? `${event.gateCode} · ${name}` : event.gateCode;
};

function Section({ slug, title, description, children, action }: { slug: string; title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-border/70 bg-card" aria-labelledby={`${slug}-heading`}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3"><div><h2 id={`${slug}-heading`} className="text-sm font-black text-slate-950 dark:text-white">{title}</h2>{description ? <p className="mt-1 text-[11px] text-muted-foreground">{description}</p> : null}</div>{action}</div>
    {children}
  </section>;
}
function Metric({ label, value, detail, tone = "neutral", icon, isAr }: { label: string; value: number | string; detail: string; tone?: "neutral" | "warning" | "danger"; icon: React.ReactNode; isAr: boolean }) {
  return <article className="rounded-2xl border border-border/70 bg-card p-4"><div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-muted p-2 text-muted-foreground">{icon}</span>{tone !== "neutral" ? <Badge variant={tone === "danger" ? "destructive" : "warning"}>{tone === "danger" ? (isAr ? "حرج" : "Critical") : (isAr ? "انتباه" : "Attention")}</Badge> : null}</div><p className="mt-4 text-xs font-bold text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black tabular-nums text-slate-950 dark:text-white">{typeof value === "number" ? number(value, isAr) : value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></article>;
}
function Empty({ message }: { message: string }) { return <div className="p-8 text-center text-sm text-muted-foreground" role="status">{message}</div>; }
function SectionError({ isAr, section, permissionLimited = false }: { isAr: boolean; section: "activity" | "visitors"; permissionLimited?: boolean }) { return <div className="p-8 text-center text-sm text-amber-700 dark:text-amber-300" role="alert">{permissionLimited ? (isAr ? `هذا القسم غير متاح للدور الحالي: ${section === "activity" ? "نشاط البوابات" : "الزوار الحاليون"}.` : `This section is unavailable for the current role: ${section === "activity" ? "recent gate activity" : "current visitors"}.`) : isAr ? `تعذر تحميل ${section === "activity" ? "نشاط البوابات" : "الزوار الحاليين"}. حاول تحديث الصفحة.` : `Could not load ${section === "activity" ? "recent gate activity" : "current visitors"}. Refresh the page to try again.`}</div>; }
function attentionLabel(item: AttentionItem, isAr: boolean) {
  const labels: Record<AttentionItem["kind"], [string, string]> = { "long-stay": ["إقامات طويلة", "Long stays"], "failed-notification": ["إشعارات فاشلة", "Failed notifications"], "hardware-backlog": ["أوامر أجهزة متراكمة", "Hardware backlog"], "hardware-failure": ["أوامر أجهزة فاشلة نهائياً", "Terminal device failures"], "pending-exception": ["استثناءات معلقة", "Pending exceptions"], "connectivity-incident": ["حوادث اتصال", "Connectivity incidents"] };
  return isAr ? labels[item.kind][0] : labels[item.kind][1];
}

export function OperationsDashboardView({ model, activity, locale }: { model: OperationsDashboardModel; activity: AccessEvidenceItem[]; locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const s = model.summary;
  const unavailable = isAr ? "غير متاح حالياً" : "Unavailable right now";
  const visitorDetail = model.currentVisitorsPermissionLimited ? (isAr ? "غير متاح للدور الحالي" : "Unavailable for the current role") : model.currentVisitorsError ? unavailable : isAr ? "داخل الموقع الآن" : "Inside the site now";
  const activityDetail = model.activityPermissionLimited ? (isAr ? "غير متاح للدور الحالي" : "Unavailable for the current role") : !model.todayGateActivityAvailable ? unavailable : isAr ? "قرارات دخول وخروج" : "Entry and exit decisions";
  const gateServiceHealthy = s.activeDevices > 0 && s.devicesStale === 0;
  const gateServiceDetail = s.activeDevices === 0 ? (isAr ? "لا توجد أجهزة بوابة نشطة" : "No active gate devices") : s.devicesStale > 0 ? `${number(s.devicesStale, isAr)} ${isAr ? "جهاز يحتاج المتابعة" : "device(s) need attention"}` : `${number(s.activeDevices, isAr)} ${isAr ? "أجهزة نشطة" : "active devices"}`;
  const lastActivityDetail = model.activityPermissionLimited ? (isAr ? "غير متاح للدور الحالي" : "Unavailable for the current role") : model.activityError ? unavailable : !model.todayGateActivityAvailable ? unavailable : activity[0] ? dateTime(activity[0].occurredAt, isAr) : (isAr ? "لا يوجد نشاط اليوم" : "No activity today");
  return <div className="space-y-5 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary"><Radio className="size-3.5" />{isAr ? "مركز التشغيل" : "Operations control"}</div><h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{isAr ? "لوحة العمليات" : "Operations dashboard"}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{isAr ? "صورة تشغيلية مركزة للبوابات والزوار والتنبيهات التي تستحق المتابعة." : "A focused operating view of gates, visitors, and work that needs attention."}</p></div><Badge variant="outline">{isAr ? "نطاق المنشأة الحالي" : "Current organization scope"}</Badge></header>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric isAr={isAr} label={isAr ? "الزوار حالياً" : "Current visitors"} value={model.currentVisitorsTotalAvailable ? s.currentVisitors ?? "—" : "—"} detail={visitorDetail} icon={<DoorOpen className="size-4" />} />
      <Metric isAr={isAr} label={isAr ? "نشاط البوابة اليوم" : "Today gate activity"} value={model.todayGateActivityAvailable ? s.todayGateActivity ?? "—" : "—"} detail={activityDetail} icon={<Activity className="size-4" />} />
      <Metric isAr={isAr} label={isAr ? "إشعارات معلقة" : "Pending notifications"} value={model.notificationsError ? "—" : s.pendingNotifications} detail={model.notificationsError ? unavailable : isAr ? "تحتاج متابعة" : "Need follow-up"} tone={model.notificationsError ? "warning" : s.pendingNotifications ? "warning" : "neutral"} icon={<AlertTriangle className="size-4" />} />
      <Metric isAr={isAr} label={isAr ? "أوامر أجهزة معلقة" : "Pending hardware"} value={s.pendingHardwareCommands} detail={isAr ? "في مسار التنفيذ" : "In the execution queue"} tone={s.pendingHardwareCommands ? "warning" : "neutral"} icon={<Server className="size-4" />} />
      <Metric isAr={isAr} label={isAr ? "إقامات طويلة" : "Long-stay alerts"} value={s.longStayAlerts} detail={isAr ? "تجاوزت السياسة" : "Past the configured policy"} tone={s.longStayAlerts ? "warning" : "neutral"} icon={<Clock3 className="size-4" />} />
      <Metric isAr={isAr} label={isAr ? "يحتاج انتباهاً" : "Needs attention"} value={s.needsAttention} detail={isAr ? "إجمالي عناصر المتابعة" : "Total follow-up items"} tone={s.needsAttention ? "danger" : "neutral"} icon={<ShieldAlert className="size-4" />} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <Section slug="recent-activity" title={isAr ? "أحدث نشاط للبوابات" : "Recent gate activity"} description={isAr ? "الأحدث أولاً · بيانات مسموحة حسب صلاحيتك" : "Latest first · permission-scoped records"}>
        {model.activityPermissionLimited ? <SectionError isAr={isAr} section="activity" permissionLimited /> : model.activityError ? <SectionError isAr={isAr} section="activity" /> : activity.length === 0 ? <Empty message={isAr ? "لا يوجد نشاط للبوابات اليوم." : "No gate activity has been recorded today."} /> : <Table><TableHeader><TableRow><TableHead>{isAr ? "الوقت" : "Time"}</TableHead><TableHead>{isAr ? "الزائر / الموضوع" : "Visitor / subject"}</TableHead><TableHead>{isAr ? "المشغل" : "Actor"}</TableHead><TableHead>{isAr ? "الموقع" : "Location"}</TableHead><TableHead>{isAr ? "القرار" : "Decision"}</TableHead><TableHead>{isAr ? "الجهاز" : "Device"}</TableHead></TableRow></TableHeader><TableBody>{activity.map((event) => <TableRow key={event.id}><TableCell>{dateTime(event.occurredAt, isAr)}<span className="block text-[11px] text-muted-foreground">{directionLabel(event.direction, isAr)}</span></TableCell><TableCell><span className="font-semibold">{event.guestName ?? (isAr ? "زائر غير محدد" : "Unidentified visitor")}</span><span className="block text-[11px] text-muted-foreground">{event.unitCode ?? (isAr ? "لا توجد وحدة" : "No unit")}</span></TableCell><TableCell>{event.operatorName || (isAr ? "غير محدد" : "Not recorded")}</TableCell><TableCell><span className="font-semibold">{event.propertyName}</span><span className="block text-[11px] text-muted-foreground">{gateLabel(event, isAr)}</span></TableCell><TableCell><Badge variant={event.decision === "ALLOW" ? "success" : event.decision === "DENY" ? "destructive" : "info"}>{decisionLabel(event.decision, isAr)}</Badge></TableCell><TableCell>{model.activityDeviceEventIds.has(event.id) ? (isAr ? "تم تسجيل الجهاز" : "Device recorded") : "—"}</TableCell></TableRow>)}</TableBody></Table>}
      </Section>
      <Section slug="attention-queue" title={isAr ? "قائمة الانتباه" : "Attention queue"} description={isAr ? "الأولوية ثم الأحدث" : "Urgency first, then newest"}>
        {model.attention.length === 0 ? <div className="flex flex-col items-center gap-2 p-8 text-center" role="status"><CheckCircle2 className="size-7 text-emerald-600" /><p className="text-sm font-bold">{isAr ? "لا توجد عناصر تحتاج متابعة" : "Nothing needs attention"}</p><p className="text-xs text-muted-foreground">{isAr ? "عمليات البوابات مستقرة حالياً." : "Gate operations are steady right now."}</p></div> : <div className="divide-y divide-border/70">{model.attention.map((item) => <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-amber-50 p-2 text-amber-700 dark:bg-amber-950/40"><AlertTriangle className="size-4" /></span><p className="truncate text-sm font-bold">{attentionLabel(item, isAr)}</p></div><Badge variant={item.urgency >= 80 ? "destructive" : "warning"}>{number(item.count, isAr)}</Badge></div>)}</div>}
      </Section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <Section slug="current-visitors" title={isAr ? "الزوار الموجودون حالياً" : "Current visitors"} action={!model.currentVisitorsPermissionLimited ? <Link href="/operations/gate/occupancy" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">{isAr ? "عرض الكل" : "View all"}<ArrowUpRight className="size-3.5" /></Link> : undefined}>
        {model.currentVisitorsPermissionLimited ? <SectionError isAr={isAr} section="visitors" permissionLimited /> : model.currentVisitorsError ? <SectionError isAr={isAr} section="visitors" /> : model.currentVisitors.length === 0 ? <Empty message={isAr ? "لا يوجد زوار داخل الموقع حالياً." : "There are no visitors inside right now."} /> : <Table><TableHeader><TableRow><TableHead>{isAr ? "الزائر" : "Visitor"}</TableHead><TableHead>{isAr ? "البوابة" : "Gate"}</TableHead><TableHead>{isAr ? "المدة" : "Duration"}</TableHead><TableHead>{isAr ? "الحالة" : "Status"}</TableHead></TableRow></TableHeader><TableBody>{model.currentVisitors.map((visitor) => <TableRow key={visitor.invitationId}><TableCell><span className="font-semibold">{visitor.guestName}</span><span className="block text-[11px] text-muted-foreground">{visitor.propertyName} · {visitor.unitCode}</span></TableCell><TableCell>{visitor.gateCode ?? (isAr ? "غير محددة" : "Not assigned")}</TableCell><TableCell className="tabular-nums">{duration(visitor.enteredAt, isAr)}</TableCell><TableCell><Badge variant={visitor.longStay ? "warning" : "success"}>{visitor.longStay ? (isAr ? "إقامة طويلة" : "Long stay") : (isAr ? "داخل الموقع" : "Inside")}</Badge></TableCell></TableRow>)}</TableBody></Table>}
      </Section>
      <Section slug="system-health" title={isAr ? "صحة النظام" : "System health"}>
        <div className="divide-y divide-border/70">{[[isAr ? "خدمة البوابات" : "Gate service", gateServiceHealthy, gateServiceDetail], [isAr ? "تسليم الإشعارات" : "Notification delivery", !model.notificationsError && !s.pendingNotifications && !s.failedNotifications, model.notificationsError ? unavailable : s.failedNotifications ? (isAr ? "فشل في التسليم" : "Delivery failures") : s.pendingNotifications ? (isAr ? "تحتاج متابعة" : "Needs review") : (isAr ? "سليم" : "Healthy")], [isAr ? "طابور أجهزة البوابة" : "Gate device queue", !s.pendingHardwareCommands, s.pendingHardwareCommands ? (isAr ? "يوجد تراكم" : "Backlog present") : (isAr ? "سليم" : "Healthy")], [isAr ? "آخر نشاط" : "Last activity", model.todayGateActivityAvailable && !model.activityError && !model.activityPermissionLimited, lastActivityDetail], [isAr ? "حوادث الاتصال" : "Connectivity incidents", s.connectivityIncidents === 0, `${number(s.connectivityIncidents, isAr)} ${isAr ? "خلال ٢٤ ساعة" : "in 24h"}`]].map(([label, healthy, detail]) => <div key={String(label)} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`} /><span className="text-sm font-semibold">{label}</span></div><span className="text-xs text-muted-foreground">{detail}</span></div>)}</div>
      </Section>
    </div>
  </div>;
}
