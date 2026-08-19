import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StatusForm } from "./status-form";
import { SubscriptionForm } from "./subscription-form";
import { Link } from "@/i18n/navigation";
import { 
  Building2, 
  ArrowRight, 
  ArrowLeft, 
  Layers, 
  ShieldCheck, 
  Calendar, 
  CreditCard,
  Hash,
  Coins
} from "lucide-react";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug, status, default_currency, created_at")
    .eq("id", id)
    .single();

  if (!organization) {
    notFound();
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, status, plan_id")
    .eq("organization_id", id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  const { data: currentPlan } = subscription
    ? await supabase
        .from("plans")
        .select("key, name_ar, name_en")
        .eq("id", subscription.plan_id)
        .single()
    : { data: null };

  return (
    <div className="space-y-6 max-w-5xl">
      
      {/* Top Breadcrumb & Return Link */}
      <div>
        <Link
          href="/platform/organizations"
          locale={locale as Locale}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors group mb-3"
        >
          <BackArrow className="size-3.5 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 transition-transform" />
          <span>{isAr ? "العودة لقائمة المنظمات" : "Back to Organizations"}</span>
        </Link>
      </div>

      {/* Organization Header Hero Card */}
      <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/20 via-blue-500/20 to-purple-500/20 text-primary font-black text-2xl border border-primary/20 shadow-sm">
              {organization.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-foreground">{organization.name}</h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {organization.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                ID: {organization.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-bold text-xs border border-primary/20">
              {currentPlan ? (isAr ? currentPlan.name_ar : currentPlan.name_en) : isAr ? "بدون باقة مفعلة" : "No Plan"}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/60 text-xs">
          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Hash className="size-3.5" />
              Slug:
            </span>
            <p className="font-mono font-bold text-foreground">{organization.slug}</p>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Coins className="size-3.5" />
              {isAr ? "العملة الأساسية:" : "Currency:"}
            </span>
            <p className="font-mono font-bold text-foreground">{organization.default_currency}</p>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <CreditCard className="size-3.5" />
              {isAr ? "الباقة الحالية:" : "Current Plan:"}
            </span>
            <p className="font-bold text-foreground">
              {currentPlan ? (isAr ? currentPlan.name_ar : currentPlan.name_en) : "—"}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3.5" />
              {isAr ? "تاريخ الإنشاء:" : "Created Date:"}
            </span>
            <p className="font-mono text-foreground">
              {new Date(organization.created_at).toLocaleDateString(isAr ? "ar-EG" : "en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Subscription Management Section */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {isAr ? "إدارة باقة الاشتراك والترقية" : "Subscription & Plan Tier"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr ? "تعديل سعة الوحدات والميزات المتاحة لحساب المنظمة." : "Change capacity limits and enterprise modules for this organization."}
          </p>
        </div>
        <SubscriptionForm
          organizationId={organization.id}
          currentPlanKey={currentPlan?.key}
          locale={locale}
        />
      </section>

      {/* Organization Lifecycle Status Section */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {isAr ? "الحالة التشغيلية والتحكم في الوصول" : "Lifecycle & Access Control"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAr ? "تنشيط، تعليق، أو أرشفة حساب المنظمة مع تسجيل الأسباب." : "Activate, suspend, or archive this workspace with audit tracking."}
          </p>
        </div>
        <StatusForm
          organizationId={organization.id}
          currentStatus={organization.status}
          locale={locale}
        />
      </section>

    </div>
  );
}
