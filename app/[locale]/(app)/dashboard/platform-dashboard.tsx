import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "./kpi-card";
import { Building2, Inbox, ShieldAlert, Activity, ArrowUpRight } from "lucide-react";

export async function PlatformDashboard({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const supabase = await createClient();

  const [organizationsRes, leadsRes, auditEventsRes] = await Promise.all([
    supabase.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false }),
    supabase
      .from("demo_leads")
      .select("id, full_name, organization_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("platform_audit_logs")
      .select("id, action, entity_type, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const organizationsError = Boolean(organizationsRes.error);
  const leadsError = Boolean(leadsRes.error);
  const auditEventsError = Boolean(auditEventsRes.error);
  const orgs = organizationsError ? [] : organizationsRes.data ?? [];
  const leads = leadsError ? [] : leadsRes.data ?? [];
  const auditEvents = auditEventsError ? [] : auditEventsRes.data ?? [];
  const byStatus = (s: string) => orgs.filter((o) => o.status === s).length;
  const newLeads = leads.filter((l) => l.status === "NEW").length;

  const dateLabel = new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    TRIAL: "secondary",
    ACTIVE: "default",
    SUSPENDED: "destructive",
    ARCHIVED: "outline",
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="gradient-hero-banner relative overflow-hidden rounded-3xl border border-border/60 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
              {isAr ? "مركز قيادة المنصة (Platform Control Center)" : "Platform Overview & SaaS Control"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {isAr ? "إدارة المنظمات والاشتراكات وسجلات الأمان" : "Multi-tenant supervision, leads & audit operations"}
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground sm:flex">
            <Activity className="size-4" />
            {isAr ? "لقطة تشغيلية" : "Operational snapshot"}
          </span>
        </div>
      </div>

      <div className="reveal-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div style={{ "--reveal-i": 0 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "منظمات نشطة" : "Active organizations"}
            value={organizationsError ? "—" : String(byStatus("ACTIVE"))}
            icon={<Building2 className="size-5" />}
            tone="positive"
          />
        </div>
        <div style={{ "--reveal-i": 1 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "منظمات تجريبية" : "Trial organizations"}
            value={organizationsError ? "—" : String(byStatus("TRIAL"))}
            icon={<Building2 className="size-5" />}
            tone="info"
          />
        </div>
        <div style={{ "--reveal-i": 2 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "طلبات عرض جديدة" : "New demo leads"}
            value={leadsError ? "—" : String(newLeads)}
            icon={<Inbox className="size-5" />}
            tone={!leadsError && newLeads > 0 ? "warning" : undefined}
          />
        </div>
        <div style={{ "--reveal-i": 3 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "منظمات معلّقة" : "Suspended"}
            value={organizationsError ? "—" : String(byStatus("SUSPENDED"))}
            icon={<ShieldAlert className="size-5" />}
            tone={!organizationsError && byStatus("SUSPENDED") > 0 ? "negative" : undefined}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border/60 bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
            <h2 className="text-sm font-semibold">{isAr ? "أحدث المنظمات المسجلة" : "Latest organizations"}</h2>
            <Link
              href="/platform/organizations"
              locale={locale}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isAr ? "إدارة المنظمات" : "Manage"}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? "الاسم" : "Name"}</TableHead>
                <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizationsError ? (
                <TableRow>
                  <TableCell colSpan={2} role="alert" className="py-8 text-center text-sm text-amber-700 dark:text-amber-400">
                    {isAr ? "تعذر تحميل المنظمات" : "Could not load organizations"}
                  </TableCell>
                </TableRow>
              ) : orgs.length ? (
                orgs.slice(0, 6).map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-semibold text-foreground">{o.name}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="text-[10px]">
                        {o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد منظمات بعد" : "No organizations yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-2xl border border-border/60 bg-card shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-primary" />
              {isAr ? "آخر الأحداث وسجل الأمن" : "Recent audit activity"}
            </h2>
            <Link
              href="/platform/audit"
              locale={locale}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              {isAr ? "سجل التدقيق الكامل" : "Audit log"}
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </Link>
          </div>
          <div className="divide-y divide-border/40">
            {auditEventsError ? (
              <p role="alert" className="px-5 py-8 text-center text-sm text-amber-700 dark:text-amber-400">
                {isAr ? "تعذر تحميل أحداث التدقيق الأخيرة" : "Could not load recent audit activity"}
              </p>
            ) : auditEvents.length ? (
              auditEvents.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  <span className="font-mono text-xs font-medium text-foreground">{e.action}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(e.created_at).toLocaleString(locale)}
                  </span>
                </div>
              ))
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {isAr ? "لا توجد أحداث بعد" : "No audit events recorded yet"}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
