import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { StatusForm } from "./status-form";
import { SubscriptionForm } from "./subscription-form";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{organization.name}</h1>
        <Badge>{organization.status}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:w-md">
        <dt className="text-muted-foreground">Slug</dt>
        <dd>{organization.slug}</dd>
        <dt className="text-muted-foreground">{isAr ? "العملة" : "Currency"}</dt>
        <dd>{organization.default_currency}</dd>
        <dt className="text-muted-foreground">{isAr ? "الباقة الحالية" : "Current plan"}</dt>
        <dd>{currentPlan ? (isAr ? currentPlan.name_ar : currentPlan.name_en) : "—"}</dd>
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{isAr ? "الاشتراك" : "Subscription"}</h2>
        <SubscriptionForm
          organizationId={organization.id}
          currentPlanKey={currentPlan?.key}
          locale={locale}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{isAr ? "حالة المنظمة" : "Organization status"}</h2>
        <StatusForm
          organizationId={organization.id}
          currentStatus={organization.status}
          locale={locale}
        />
      </section>
    </div>
  );
}
