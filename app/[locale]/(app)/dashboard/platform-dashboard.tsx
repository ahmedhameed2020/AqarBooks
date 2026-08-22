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
import { 
  Building2, 
  Inbox, 
  ShieldAlert, 
  Activity, 
  ArrowUpRight, 
  ShieldCheck, 
  Plus, 
  Sparkles,
  Layers,
  ArrowRight,
  ArrowLeft,
  Users,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";

export async function PlatformDashboard({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  const supabase = await createClient();

  const [{ data: organizations }, { data: leads }, { data: auditEvents }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, status, default_currency, created_at").order("created_at", { ascending: false }),
    supabase
      .from("demo_leads")
      .select("id, full_name, organization_name, email, phone, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("platform_audit_logs")
      .select("id, action, entity_type, entity_id, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const orgs = organizations ?? [];
  const byStatus = (s: string) => orgs.filter((o) => o.status === s).length;
  const newLeads = (leads ?? []).filter((l) => l.status === "NEW").length;

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
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* ── 1. Hero Command Header ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 end-0 -mt-8 -me-8 size-64 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-medium text-slate-400">{dateLabel}</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-400/20">
                SUPERADMIN
              </span>
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {isAr ? "مركز قيادة المنصة المؤسسي (Platform Cockpit)" : "Enterprise Platform Cockpit"}
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-300 font-normal">
              {isAr
                ? "مراقبة وإدارة كافة المنظمات العقارية، طلبات العروض الجديدة، وسجلات التدقيق والأمان."
                : "Multi-tenant supervision, automated billing tiers, lead conversions, and security logs."}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/platform/organizations"
              locale={locale}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              <Building2 className="size-4" />
              <span>{isAr ? "إدارة المنظمات" : "Organizations"}</span>
            </Link>

            <Link
              href="/platform/leads"
              locale={locale}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-bold transition-all"
            >
              <Inbox className="size-4 text-purple-400" />
              <span>{isAr ? "طلبات العرض" : "Demo Leads"}</span>
              {newLeads > 0 && (
                <span className="size-5 rounded-full bg-purple-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {newLeads}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* ── 2. KPI Metrics Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={isAr ? "منظمات عقارية نشطة" : "Active Organizations"}
          value={String(byStatus("ACTIVE"))}
          icon={<Building2 className="size-5" />}
          tone="positive"
        />
        
        <KpiCard
          label={isAr ? "حسابات تجريبية (Trial)" : "Trial Workspaces"}
          value={String(byStatus("TRIAL"))}
          icon={<Sparkles className="size-5" />}
          tone="info"
        />
        
        <KpiCard
          label={isAr ? "طلبات عروض جديدة" : "New Inbound Leads"}
          value={String(newLeads)}
          icon={<Inbox className="size-5" />}
          tone={newLeads > 0 ? "warning" : undefined}
        />
        
        <KpiCard
          label={isAr ? "منظمات معلّقة" : "Suspended Accounts"}
          value={String(byStatus("SUSPENDED"))}
          icon={<ShieldAlert className="size-5" />}
          tone={byStatus("SUSPENDED") > 0 ? "negative" : undefined}
        />
      </div>

      {/* ── 3. Organizations Table & Recent Leads Grid ────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-12">
        
        {/* Latest Organizations (Spans 7 cols) */}
        <section className="lg:col-span-7 rounded-3xl border bg-card shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/20">
            <div className="flex items-center gap-2">
              <Building2 className="size-4.5 text-primary" />
              <h2 className="text-sm font-bold text-foreground">
                {isAr ? "أحدث المنظمات المسجلة" : "Latest Tenant Organizations"}
              </h2>
            </div>
            <Link
              href="/platform/organizations"
              locale={locale}
              className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              <span>{isAr ? "عرض الكل" : "View all"}</span>
              <Arrow className="size-3.5" />
            </Link>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                <TableHead className="font-bold">{isAr ? "المنظمة" : "Name"}</TableHead>
                <TableHead className="font-bold">{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead className="font-bold">{isAr ? "العملة" : "Currency"}</TableHead>
                <TableHead className="text-end font-bold" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.length ? (
                orgs.slice(0, 6).map((o) => (
                  <TableRow key={o.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {o.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-xs">{o.name}</p>
                          <span className="text-[10px] text-muted-foreground font-mono">{o.slug}</span>
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[o.status] ?? "outline"} className="text-[10px] font-bold">
                        {o.status}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground font-semibold">
                        {o.default_currency}
                      </span>
                    </TableCell>

                    <TableCell className="text-end">
                      <Link
                        href={`/platform/organizations/${o.id}`}
                        locale={locale}
                        className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <span>{isAr ? "إدارة" : "Manage"}</span>
                        <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    {isAr ? "لا توجد منظمات مسجلة بعد" : "No organizations yet"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        {/* Recent Audit Activity & Inbound Leads (Spans 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Recent Inbound Demo Leads */}
          <section className="rounded-3xl border bg-card shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-purple-500" />
                <h2 className="text-sm font-bold text-foreground">
                  {isAr ? "أحدث طلبات العرض (Leads)" : "Recent Demo Leads"}
                </h2>
              </div>
              <Link
                href="/platform/leads"
                locale={locale}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <span>{isAr ? "القائمة الكاملة" : "All Leads"}</span>
                <Arrow className="size-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-border/40">
              {(leads ?? []).length ? (
                (leads ?? []).slice(0, 4).map((l) => (
                  <div key={l.id} className="p-3.5 px-5 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-bold text-foreground">{l.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{l.organization_name || l.email}</p>
                    </div>
                    <Badge variant={l.status === "NEW" ? "default" : "outline"} className="text-[10px]">
                      {l.status}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد طلبات جديدة" : "No recent demo leads"}
                </p>
              )}
            </div>
          </section>

          {/* Audit Activity Card */}
          <section className="rounded-3xl border bg-card shadow-xs overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/20">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-emerald-500" />
                <h2 className="text-sm font-bold text-foreground">
                  {isAr ? "سجل أمان وعمليات المنصة" : "Platform Audit Trail"}
                </h2>
              </div>
              <Link
                href="/platform/audit"
                locale={locale}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <span>{isAr ? "السجل" : "Log"}</span>
                <Arrow className="size-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-border/40">
              {(auditEvents ?? []).length ? (
                (auditEvents ?? []).slice(0, 4).map((e) => (
                  <div key={e.id} className="p-3.5 px-5 hover:bg-muted/30 transition-colors flex items-center justify-between gap-3 text-xs">
                    <span className="font-mono text-xs font-bold text-foreground">{e.action}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(e.created_at).toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  {isAr ? "لا توجد أحداث مسجلة بعد" : "No audit events recorded"}
                </p>
              )}
            </div>
          </section>

        </div>

      </div>

    </div>
  );
}
