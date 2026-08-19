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
  MoreHorizontal
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
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

const STATUS_CONFIG: Record<string, { labelAr: string; labelEn: string; variant: "default" | "secondary" | "destructive" | "outline"; badgeClass: string }> = {
  ACTIVE: {
    labelAr: "نشطة",
    labelEn: "Active",
    variant: "default",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30",
  },
  TRIAL: {
    labelAr: "تجريبية",
    labelEn: "Trial",
    variant: "secondary",
    badgeClass: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400 dark:border-blue-500/30",
  },
  SUSPENDED: {
    labelAr: "معلّقة",
    labelEn: "Suspended",
    variant: "destructive",
    badgeClass: "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:border-rose-500/30",
  },
  ARCHIVED: {
    labelAr: "مؤرشفة",
    labelEn: "Archived",
    variant: "outline",
    badgeClass: "bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400 dark:border-slate-500/30",
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredOrgs = useMemo(() => {
    return organizations.filter((org) => {
      const matchesSearch =
        org.name.toLowerCase().includes(search.toLowerCase()) ||
        org.slug.toLowerCase().includes(search.toLowerCase()) ||
        org.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || org.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [organizations, search, statusFilter]);

  const activeCount = organizations.filter((o) => o.status === "ACTIVE").length;
  const trialCount = organizations.filter((o) => o.status === "TRIAL").length;
  const suspendedCount = organizations.filter((o) => o.status === "SUSPENDED").length;

  return (
    <div className="space-y-6">
      
      {/* Top Header with Stats and Create Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {isAr ? "إدارة المنظمات والشركات" : "Tenant Organizations"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              {organizations.length} {isAr ? "منظمة" : "total"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "مراقبة وإدارة الكيانات العقارية والمستأجرين، ضبط الاشتراكات، ومتابعة حالات التشغيل."
              : "Oversee tenant workspaces, manage subscription tiers, and control lifecycle states."}
          </p>
        </div>

        {/* Dialog Trigger to Create Organization */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button className="gap-2 font-bold shadow-md">
              <Plus className="size-4" />
              <span>{isAr ? "إنشاء منظمة جديدة" : "New Organization"}</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 className="size-4.5" />
                </div>
                <div>
                  <DialogTitle>{isAr ? "إنشاء منظمة جديدة" : "Create New Organization"}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr ? "أدخل تفاصيل المنظمة العقارية لاختيار الباقة وتهيئة الحساب." : "Configure organization details and assign subscription."}
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

      {/* Quick Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-2 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs">
        
        {/* Filter Pills */}
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

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? "بحث بالاسم أو المعرف (slug)..." : "Search name or slug..."}
            className="ps-9 pe-3 h-9 text-xs rounded-xl bg-background"
          />
        </div>

      </div>

      {/* Organizations Table Card */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
              <TableHead className="font-bold">{isAr ? "المنظمة" : "Organization"}</TableHead>
              <TableHead className="font-bold">Slug</TableHead>
              <TableHead className="font-bold">{isAr ? "الحالة التشغيلية" : "Status"}</TableHead>
              <TableHead className="font-bold">{isAr ? "العملة" : "Currency"}</TableHead>
              <TableHead className="font-bold">{isAr ? "تاريخ الإنشاء" : "Created Date"}</TableHead>
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
                };

                return (
                  <TableRow key={org.id} className="hover:bg-muted/30 transition-colors group">
                    
                    {/* Organization Name with Avatar */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary/20 to-blue-500/20 text-primary font-black text-sm border border-primary/20">
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
                          <span className="text-[10px] text-muted-foreground font-mono block">
                            ID: {org.id.slice(0, 8)}...
                          </span>
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
                        <span className="size-1.5 rounded-full bg-current" />
                        <span>{isAr ? conf.labelAr : conf.labelEn}</span>
                      </span>
                    </TableCell>

                    {/* Currency */}
                    <TableCell>
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-muted/50 text-foreground">
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
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-colors group-hover:border-primary/40"
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

    </div>
  );
}
