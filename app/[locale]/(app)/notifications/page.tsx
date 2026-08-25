import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import { getOperationalAlerts, getAlertSettings } from "@/lib/alerts/operational-alerts";
import type { Locale } from "@/i18n/routing";
import { NotificationsClient } from "./notifications-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "التنبيهات التشغيلية — AqarBooks"
      : "Operational Alerts — AqarBooks",
    description: isAr
      ? "تنبيهات مشتقة من دفاترك: المطالبات المتأخرة، الشيكات المستحقة، والعقود المنتهية قريبًا."
      : "Alerts derived from your ledger: overdue dues, cheques falling due, and leases about to expire.",
  };
}

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  if (!user) redirect({ href: "/login", locale: locale as Locale });

  const organization = await getPrimaryOrganization(user!.id);
  if (!organization) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center py-20">
        <p className="max-w-md text-sm text-muted-foreground">
          {isAr ? "حسابك غير مرتبط بأي منظمة بعد." : "Your account isn't linked to an organization yet."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const [alerts, settings, canManageSettings, { count: dismissedCount }] = await Promise.all([
    getOperationalAlerts(organization.id, user!.id),
    getAlertSettings(organization.id),
    hasPermission(organization.id, "tenant.settings.manage"),
    supabase
      .from("alert_dismissals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .eq("organization_id", organization.id),
  ]);

  return (
    <NotificationsClient
      locale={locale}
      alerts={alerts}
      settings={settings}
      dismissedCount={dismissedCount ?? 0}
      canManageSettings={canManageSettings}
    />
  );
}
