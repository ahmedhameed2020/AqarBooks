"use client";

import { useState } from "react";
import { 
  CreditCard, 
  TrendingUp, 
  Building2, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  ArrowUpRight,
  Zap,
  ShieldCheck,
  Coins,
  Search
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
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export interface PlanItem {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  subscribers_count: number;
  price_sar: number;
  price_egp: number;
  unit_limit: string;
}

export interface SubscriptionOrgItem {
  id: string;
  org_name: string;
  org_slug: string;
  plan_key: string;
  plan_name_ar: string;
  plan_name_en: string;
  currency: string;
  status: string;
  created_at: string;
}

export function SubscriptionsClient({
  plans,
  subscriptions,
  locale,
}: {
  plans: PlanItem[];
  subscriptions: SubscriptionOrgItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [search, setSearch] = useState("");
  const [selectedPlanFilter, setSelectedPlanFilter] = useState("ALL");

  const totalActiveSubscriptions = subscriptions.filter((s) => s.status === "ACTIVE").length;
  
  // Calculate approximate MRR in SAR and EGP
  const mrrSar = subscriptions.reduce((acc, sub) => {
    if (sub.status !== "ACTIVE") return acc;
    if (sub.plan_key === "STARTER") return acc + 299;
    if (sub.plan_key === "PROFESSIONAL") return acc + 899;
    if (sub.plan_key === "ENTERPRISE") return acc + 2499;
    return acc;
  }, 0);

  const mrrEgp = mrrSar * 13.5; // Estimated EGP equivalent

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.org_name.toLowerCase().includes(search.toLowerCase()) ||
      sub.org_slug.toLowerCase().includes(search.toLowerCase());
    const matchesPlan = selectedPlanFilter === "ALL" || sub.plan_key === selectedPlanFilter;
    return matchesSearch && matchesPlan;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      
      {/* ── 1. Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {isAr ? "إدارة باقات واشتراكات المنصة (SaaS Subscriptions & MRR)" : "Subscriptions & SaaS Billing"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {totalActiveSubscriptions} {isAr ? "اشتراك نشط" : "active"}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isAr
              ? "متابعة الإيرادات المتكررة (MRR)، وتوزيع المنظمات على باقات الاشتراك، والتحكم في صلاحيات السعة."
              : "Track recurring revenue, monitor plan distribution, and oversee unit capacity entitlements."}
          </p>
        </div>
      </div>

      {/* ── 2. Top Metric Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        <div className="rounded-3xl border bg-card p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "الإيراد الشهري التقديري (MRR)" : "Est. Monthly Revenue (MRR)"}
            </span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">
              {mrrSar.toLocaleString()} <span className="text-xs font-mono text-muted-foreground">{isAr ? "ر.س/شهرياً" : "SAR/mo"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              ≈ {mrrEgp.toLocaleString()} {isAr ? "ج.م" : "EGP"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "إجمالي الاشتراكات النشطة" : "Active Subscriptions"}
            </span>
            <div className="size-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CreditCard className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">{totalActiveSubscriptions}</div>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
              {isAr ? "معدل تجديد سليم 100%" : "100% Healthy Renewal Rate"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "الخطة الأكثر طلباً" : "Most Popular Plan"}
            </span>
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-black text-foreground">
              {isAr ? "الاحترافية (Pro)" : "Professional"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "حتى 1,000 وحدة + ZATCA" : "Up to 1k units + Tax"}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {isAr ? "فترة التجربة (Trial Conversions)" : "Trial Conversion"}
            </span>
            <div className="size-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Zap className="size-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-foreground">87.5%</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isAr ? "من التجريبي إلى المدفوع" : "Trial to Paid ratio"}
            </p>
          </div>
        </div>

      </div>

      {/* ── 3. Plan Tier Cards Overview ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const isPro = p.key === "PROFESSIONAL";
          return (
            <div
              key={p.id}
              className={`rounded-3xl border p-6 bg-card shadow-xs transition-all relative ${
                isPro ? "border-primary/50 ring-1 ring-primary/20 bg-gradient-to-b from-primary/5 to-card" : ""
              }`}
            >
              {isPro && (
                <span className="absolute top-4 end-4 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-primary text-primary-foreground">
                  POPULAR
                </span>
              )}
              
              <h3 className="text-lg font-black text-foreground">{isAr ? p.name_ar : p.name_en}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? `سعة الوحدات: ${p.unit_limit}` : `Capacity: ${p.unit_limit}`}
              </p>

              <div className="my-4 pb-4 border-b border-border/60">
                <span className="text-3xl font-black text-foreground">{p.price_sar}</span>
                <span className="text-xs text-muted-foreground font-semibold ms-1">
                  {isAr ? "ر.س / شهرياً" : "SAR / month"}
                </span>
                <span className="block text-xs font-mono text-muted-foreground mt-1">
                  ≈ {p.price_egp.toLocaleString()} {isAr ? "ج.م" : "EGP"}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "المنظمات المشتركة:" : "Active Subscribers:"}</span>
                  <span className="font-bold text-foreground font-mono">{p.subscribers_count}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "الضرائب والفوترة:" : "Tax & E-Invoice:"}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {p.key === "STARTER" ? (isAr ? "أساسي" : "Basic") : (isAr ? "متقدم + ZATCA" : "Full + ZATCA")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "اتحاد الملاك (HOA):" : "HOA Pro-Rata:"}</span>
                  <span className="font-bold text-foreground">
                    {p.key === "STARTER" ? (isAr ? "غير متاح" : "No") : (isAr ? "متاح" : "Included")}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 4. Subscribed Organizations Table ─────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 rounded-2xl border bg-card/60 backdrop-blur-md shadow-xs">
          
          {/* Plan Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedPlanFilter("ALL")}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                selectedPlanFilter === "ALL"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {isAr ? "جميع الباقات" : "All Plans"} ({subscriptions.length})
            </button>
            
            {plans.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPlanFilter(p.key)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  selectedPlanFilter === p.key
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {isAr ? p.name_ar : p.name_en} ({subscriptions.filter((s) => s.plan_key === p.key).length})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative min-w-[240px]">
            <Search className="absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isAr ? "بحث بالمنظمة أو الـ slug..." : "Search organization or slug..."}
              className="ps-9 pe-3 h-9 text-xs rounded-xl bg-background"
            />
          </div>

        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                <TableHead className="font-bold">{isAr ? "المنظمة" : "Organization"}</TableHead>
                <TableHead className="font-bold">{isAr ? "الباقة المفعلة" : "Active Plan"}</TableHead>
                <TableHead className="font-bold">{isAr ? "العملة" : "Currency"}</TableHead>
                <TableHead className="font-bold">{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead className="font-bold">{isAr ? "تاريخ الاشتراك" : "Subscribed Date"}</TableHead>
                <TableHead className="text-end font-bold">{isAr ? "الإجراء" : "Action"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSubscriptions.length ? (
                filteredSubscriptions.map((sub) => (
                  <TableRow key={sub.id} className="hover:bg-muted/30 transition-colors">
                    
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                          {sub.org_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground text-sm">{sub.org_name}</p>
                          <span className="text-[10px] text-muted-foreground font-mono">{sub.org_slug}</span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="font-bold text-xs">
                        {isAr ? sub.plan_name_ar : sub.plan_name_en}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {sub.currency}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        <span>{sub.status}</span>
                      </span>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>

                    <TableCell className="text-end">
                      <Link
                        href={`/platform/organizations/${sub.id}`}
                        locale={locale as Locale}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-background hover:bg-muted text-xs font-bold text-foreground transition-colors"
                      >
                        <span>{isAr ? "ترقية / تعديل" : "Manage Tier"}</span>
                        <ArrowUpRight className="size-3 rtl:-scale-x-100" />
                      </Link>
                    </TableCell>

                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    <CreditCard className="size-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="font-semibold">{isAr ? "لا توجد اشتراكات مطابقة للبحث" : "No matching subscriptions found"}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

    </div>
  );
}
