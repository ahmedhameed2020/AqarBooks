"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { 
  Building2, 
  Search, 
  Plus, 
  Filter, 
  ArrowUpRight, 
  ExternalLink, 
  ShieldCheck, 
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  MoreHorizontal,
  LayoutGrid,
  List,
  Copy,
  Check,
  Coins,
  Calendar,
  CreditCard,
  ShieldAlert,
  Zap,
  TrendingUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
} from "@/components/ui/dialog";
import { CreateOrganizationForm } from "./create-organization-form";

export interface OrgItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  default_currency: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { labelAr: string; labelEn: string; variant: "default" | "secondary" | "destructive" | "outline"; badgeClass: string; dotClass: string }> = {
  ACTIVE: {
    labelAr: "نشطة",
    labelEn: "Active",
    variant: "default",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  TRIAL: {
    labelAr: "تجريبية",
    labelEn: "Trial",
    variant: "secondary",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
    dotClass: "bg-blue-500",
  },
  SUSPENDED: {
    labelAr: "معلّقة",
    labelEn: "Suspended",
    variant: "destructive",
    badgeClass: "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:border-rose-500/30",
    dotClass: "bg-rose-500",
  },
  ARCHIVED: {
    labelAr: "مؤرشفة",
    labelEn: "Archived",
    variant: "outline",
    badgeClass: "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400 dark:border-slate-500/30",
    dotClass: "bg-slate-400",
  },
};

export function OrganizationsClient({
  organizations,
  locale,
}: {
  organizations: OrgItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"TABLE" | "GRID">("TABLE");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch =
        org.name.toLowerCase().includes(search.toLowerCase()) ||
        org.slug.toLowerCase().includes(search.toLowerCase()) ||
        org.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || org.status === statusFilter;
      const matchesCurrency = currencyFilter === "ALL" || org.default_currency === currencyFilter;
      return matchesSearch && matchesStatus && matchesCurrency;
    });
  }, [organizations, search, statusFilter, currencyFilter]);

  const activeCount = organizations.filter((o) => o.status === "ACTIVE").length;
  const trialCount = organizations.filter((o) => o.status === "TRIAL").length;
  const suspendedCount = organizations.filter((o) => o.status === "SUSPENDED").length;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
    toast.show({
      title: isAr ? "تم النسخ إلى الحافظة" : "Copied to Clipboard",
      description: `${label}: ${text}`,
      variant: "success",
    });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      
      {/* ── 1. Top Header with Actions ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              {isAr ? "إدارة المنظمات والشركات العقارية" : "Tenant Organizations"}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-primary/10 text-primary border border-primary/20">
              {organizations.length} {isAr ? "منشأة مسجلة" : "total"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "مراقبة مساحات عمل المستأجرين، التحكم في الحالات التشغيلية، وترقية باقات الاشتراك."
              : "Oversee multi-tenant workspaces, lifecycle status control, and tier entitlements."}
          </p>
        </div>

        {/* Dialog Trigger to Create Organization */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button className="gap-2 font-bold h-10 px-4 rounded-xl shadow-md cursor-pointer">
              <Plus className="size-4" />
              <span>{isAr ? "إنشاء منظمة جديدة" : "New Organization"}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <DialogTitle>{isAr ? "إنشاء منظمة جديدة" : "Create New Organization"}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr ? "أدخل تفاصيل المنظمة لاختيار الباقة وتهيئة مساحة العمل." : "Configure organization details and assign subscription."}
                  </p>
                </div>
              </div>
            </DialogHeader>
            <DialogBody>
              <CreateOrganizationForm locale={locale} onSuccess={() => setDialogOpen(false)} />
            </DialogBody>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── 2. Top Summary KPI Metrics ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        <div className="rounded-3xl border bg-card p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "إجمالي المنظمات" : "Total Organizations"}
            </span>
            <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Building2 className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">{organizations.length}</div>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {activeCount} {isAr ? "نشطة" : "active"} • {trialCount} {isAr ? "تجريبية" : "trial"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "منظمات نشطة (Active)" : "Active Workspaces"}
            </span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">{activeCount}</div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              {organizations.length > 0 ? Math.round((activeCount / organizations.length) * 100) : 0}% {isAr ? "من إجمالي المنشآت" : "of total fleet"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "حسابات تجريبية (Trial)" : "Trial Accounts"}
            </span>
            <div className="size-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Sparkles className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">{trialCount}</div>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold mt-0.5">
              {isAr ? "جاهزة للترقية والدعم" : "Ready for onboarding"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "منظمات معلقة (Suspended)" : "Suspended"}
            </span>
            <div className="size-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldAlert className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">{suspendedCount}</div>
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-0.5">
              {suspendedCount === 0 ? (isAr ? "لا توجد حسابات معلقة" : "All clean") : (isAr ? "تتطلب مراجعة" : "Action required")}
            </p>
          </div>
        </div>

      </div>

      {/* ── 3. Filters & View Toggle Bar ──────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl border bg-card/70 backdrop-blur-md shadow-xs">
        
        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
              statusFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {isAr ? "الكل" : "All"} ({organizations.length})
          </button>
          
          <button
            type="button"
            onClick={() => setStatusFilter("ACTIVE")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === "ACTIVE"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span>{isAr ? "نشطة" : "Active"} ({activeCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("TRIAL")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === "TRIAL"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <span className="size-1.5 rounded-full bg-blue-400" />
            <span>{isAr ? "تجريبية" : "Trial"} ({trialCount})</span>
          </button>

          {suspendedCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("SUSPENDED")}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === "SUSPENDED"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span className="size-1.5 rounded-full bg-rose-400" />
              <span>{isAr ? "معلّقة" : "Suspended"} ({suspendedCount})</span>
            </button>
          )}
        </div>

        {/* Search & View Switcher */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Currency Filter */}
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="h-9 px-2.5 rounded-xl border bg-background text-xs font-bold text-foreground focus:ring-1 focus:ring-primary outline-none"
          >
            <option value="ALL">{isAr ? "كافة العملات" : "All Currencies"}</option>
            <option value="SAR">SAR (ريال)</option>
            <option value="EGP">EGP (جنيه)</option>
            <option value="AED">AED (درهم)</option>
            <option value="USD">USD ($)</option>
          </select>

          {/* Search */}
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="absolute inset-y-0 start-3 my-auto size-3.5 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث بالاسم، الـ slug، أو المعرف..." : "Search name, slug, id..."}
              className="ps-8.5 pe-3 h-9 text-xs rounded-xl bg-background"
            />
          </div>

          {/* Dual View Mode Buttons */}
          <div className="flex items-center p-1 rounded-xl bg-muted/60 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              title={isAr ? "عرض الجدول" : "Table View"}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "TABLE" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("GRID")}
              title={isAr ? "عرض البطاقات" : "Grid View"}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "GRID" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* ── 4. Main Display (Table or Grid) ────────────────────────── */}
      {viewMode === "TABLE" ? (
        /* TABLE VIEW */
        <div className="overflow-hidden rounded-3xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                <TableHead className="font-bold">{isAr ? "المنظمة والكيان" : "Organization"}</TableHead>
                <TableHead className="font-bold">Slug</TableHead>
                <TableHead className="font-bold">{isAr ? "الحالة التشغيلية" : "Status"}</TableHead>
                <TableHead className="font-bold">{isAr ? "العملة" : "Currency"}</TableHead>
                <TableHead className="font-bold">{isAr ? "تاريخ التأسيس" : "Created Date"}</TableHead>
                <TableHead className="text-end font-bold">{isAr ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrgs.length ? (
                filteredOrgs.map((org) => {
                  const conf = STATUS_CONFIG[org.status] ?? {
                    labelAr: org.status,
                    labelEn: org.status,
                    badgeClass: "bg-muted text-muted-foreground",
                    dotClass: "bg-muted-foreground",
                  };

                  return (
                    <TableRow key={org.id} className="hover:bg-muted/30 transition-colors group">
                      
                      {/* Organization Name with Avatar */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/20 to-indigo-500/20 text-primary font-black text-sm border border-primary/20 shadow-xs shrink-0">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <Link
                              href={`/platform/organizations/${org.id}`}
                              locale={locale as Locale}
                              className="font-bold text-foreground hover:text-primary hover:underline transition-colors block text-sm"
                            >
                              {org.name}
                            </Link>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {org.id.slice(0, 8)}...
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(org.id, "Organization ID")}
                                title={isAr ? "نسخ المعرف الفريد" : "Copy ID"}
                                className="text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                {copiedId === org.id ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Slug */}
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground px-2 py-0.5 rounded-md bg-muted/60 border border-border/50">
                          {org.slug}
                        </span>
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${conf.badgeClass}`}>
                          <span className={`size-1.5 rounded-full ${conf.dotClass}`} />
                          <span>{isAr ? conf.labelAr : conf.labelEn}</span>
                        </span>
                      </TableCell>

                      {/* Currency */}
                      <TableCell>
                        <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted/60 text-foreground">
                          {org.default_currency}
                        </span>
                      </TableCell>

                      {/* Created Date */}
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-end">
                        <Link
                          href={`/platform/organizations/${org.id}`}
                          locale={locale as Locale}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-colors group-hover:border-primary/40 shadow-xs"
                        >
                          <span>{isAr ? "إدارة وتفاصيل" : "Manage"}</span>
                          <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
                        </Link>
                      </TableCell>

                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    <Building2 className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="font-semibold">{isAr ? "لم يتم العثور على أي منظمات تطابق البحث" : "No matching organizations found"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isAr ? "جرب تغيير خيارات التصفية أو أنشئ منظمة جديدة." : "Try adjusting your filters or create a new organization."}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrgs.length ? (
            filteredOrgs.map((org) => {
              const conf = STATUS_CONFIG[org.status] ?? {
                labelAr: org.status,
                labelEn: org.status,
                badgeClass: "bg-muted text-muted-foreground",
                dotClass: "bg-muted-foreground",
              };

              return (
                <div
                  key={org.id}
                  className="rounded-3xl border bg-card p-5 shadow-xs hover:border-primary/40 hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="size-11 rounded-2xl bg-gradient-to-tr from-primary/20 to-indigo-500/20 text-primary font-black text-base border border-primary/20 flex items-center justify-center shrink-0 shadow-xs">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link
                            href={`/platform/organizations/${org.id}`}
                            locale={locale as Locale}
                            className="font-bold text-foreground hover:text-primary hover:underline transition-colors block text-sm leading-tight"
                          >
                            {org.name}
                          </Link>
                          <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                            slug: {org.slug}
                          </span>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${conf.badgeClass} shrink-0`}>
                        <span className={`size-1.5 rounded-full ${conf.dotClass}`} />
                        <span>{isAr ? conf.labelAr : conf.labelEn}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">{isAr ? "العملة الأساسية" : "Currency"}</span>
                        <p className="font-mono font-bold text-foreground">{org.default_currency}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted-foreground">{isAr ? "تاريخ التأسيس" : "Created"}</span>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {new Date(org.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(org.id, "Organization ID")}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === org.id ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      <span className="text-[10px] font-mono">{isAr ? "نسخ ID" : "Copy ID"}</span>
                    </button>

                    <Link
                      href={`/platform/organizations/${org.id}`}
                      locale={locale as Locale}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors"
                    >
                      <span>{isAr ? "إدارة وتفاصيل" : "Manage"}</span>
                      <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground bg-card rounded-3xl border">
              <Building2 className="size-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="font-semibold">{isAr ? "لم يتم العثور على أي منظمات تطابق البحث" : "No matching organizations found"}</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
