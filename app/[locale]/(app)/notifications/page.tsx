import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
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
      ? "مركز الإشعارات والتنبيهات الذكية — عقار بوكس"
      : "Smart Notification & Alerts Center — AqarBooks",
    description: isAr
      ? "إدارة ومتابعة التنبيهات المالية، شيكات الاستحقاق، انتهاء العقود، والربط مع الواتساب والبريد."
      : "Manage financial alerts, PDC due dates, lease expirations, and WhatsApp/Email delivery rules.",
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
      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center py-20">
        <p className="max-w-md text-sm text-muted-foreground">
          {isAr ? "حسابك غير مرتبط بأي منظمة بعد." : "Your account isn't linked to an organization yet."}
        </p>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <NotificationsClient
        locale={locale}
        organizationId={organization.id}
        organizationName={organization.name}
      />
    </main>
  );
}
