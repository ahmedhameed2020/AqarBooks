import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { SubscriptionsClient, type PlanItem, type SubscriptionOrgItem } from "./subscriptions-client";

export default async function SubscriptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const supabase = await createClient();

  const [{ data: plans }, { data: organizations }, { data: subscriptions }] = await Promise.all([
    supabase.from("plans").select("id, key, name_ar, name_en").order("sort_order"),
    supabase.from("organizations").select("id, name, slug, default_currency, status, created_at"),
    supabase.from("subscriptions").select("id, organization_id, plan_id, status, created_at").eq("status", "ACTIVE"),
  ]);

  const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
  const subMap = new Map((subscriptions ?? []).map((s) => [s.organization_id, s]));

  const enrichedPlans: PlanItem[] = (plans ?? []).map((p) => {
    const subCount = (subscriptions ?? []).filter((s) => s.plan_id === p.id).length;
    let priceSar = 299;
    let priceEgp = 4000;
    let unitLimit = "100 وحدة";

    if (p.key === "PROFESSIONAL") {
      priceSar = 899;
      priceEgp = 12000;
      unitLimit = "1,000 وحدة";
    } else if (p.key === "ENTERPRISE") {
      priceSar = 2499;
      priceEgp = 34000;
      unitLimit = "غير محدود";
    }

    return {
      id: p.id,
      key: p.key,
      name_ar: p.name_ar,
      name_en: p.name_en,
      subscribers_count: subCount,
      price_sar: priceSar,
      price_egp: priceEgp,
      unit_limit: unitLimit,
    };
  });

  const enrichedSubscriptions: SubscriptionOrgItem[] = (organizations ?? []).map((org) => {
    const sub = subMap.get(org.id);
    const plan = sub ? planMap.get(sub.plan_id) : null;

    return {
      id: org.id,
      org_name: org.name,
      org_slug: org.slug,
      plan_key: plan ? plan.key : "STARTER",
      plan_name_ar: plan ? plan.name_ar : "الأساسية",
      plan_name_en: plan ? plan.name_en : "Starter",
      currency: org.default_currency,
      status: sub ? sub.status : org.status,
      created_at: sub ? sub.created_at : org.created_at,
    };
  });

  return (
    <SubscriptionsClient
      plans={enrichedPlans}
      subscriptions={enrichedSubscriptions}
      locale={locale}
    />
  );
}
