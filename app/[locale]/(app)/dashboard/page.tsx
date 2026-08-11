import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { Locale } from "@/i18n/routing";
import { TenantDashboard } from "./tenant-dashboard";
import { PlatformDashboard } from "./platform-dashboard";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const maybeUser = await getCurrentUser();
  if (!maybeUser) {
    redirect({ href: "/login", locale: locale as Locale });
  }
  // redirect() above never returns; maybeUser is guaranteed non-null past this point.
  const user = maybeUser!;

  const [platformAdmin, organization] = await Promise.all([
    isPlatformAdmin(user.id),
    getPrimaryOrganization(user.id),
  ]);

  if (organization) {
    return <TenantDashboard organization={organization} locale={locale as Locale} />;
  }

  if (platformAdmin) {
    return <PlatformDashboard locale={locale as Locale} />;
  }

  const t = await getTranslations("dashboard");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("welcome")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("noOrganization")}</p>
    </div>
  );
}
