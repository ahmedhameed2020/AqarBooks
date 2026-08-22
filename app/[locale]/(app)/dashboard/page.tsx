import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import type { Locale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { TenantDashboard } from "./tenant-dashboard";
import { PlatformDashboard } from "./platform-dashboard";
import { Building2, ShieldCheck, Layers, Sparkles } from "lucide-react";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ view?: string }>;
}) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const maybeUser = await getCurrentUser();
  if (!maybeUser) {
    redirect({ href: "/login", locale: locale as Locale });
  }
  const user = maybeUser!;

  const [platformAdmin, organization] = await Promise.all([
    isPlatformAdmin(user.id),
    getPrimaryOrganization(user.id),
  ]);

  // If user is a SuperAdmin AND has an organization, allow dual view switching
  if (platformAdmin && organization) {
    const isPlatformView = sp.view !== "tenant";

    return (
      <div className="space-y-6">
        {/* SuperAdmin View Switcher Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl border bg-card/80 backdrop-blur-md shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">
                {isAr ? "حساب مالك المنصة (Platform SuperAdmin)" : "Platform SuperAdmin Mode"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isAr
                  ? "يمكنك التبديل بين قمرة قيادة المنصة المركزية وإدارة منشأتك العقارية."
                  : "Switch between global platform control cockpit and tenant operations."}
              </p>
            </div>
          </div>

          {/* Switcher Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 text-xs font-bold w-full sm:w-auto justify-center">
            <Link
              href="/dashboard?view=platform"
              locale={locale as Locale}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                isPlatformView
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? "قمرة قيادة المنصة (SuperAdmin)" : "Platform Cockpit"}
            </Link>

            <Link
              href="/dashboard?view=tenant"
              locale={locale as Locale}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                !isPlatformView
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isAr ? `منشأة (${organization.name})` : `Tenant (${organization.name})`}
            </Link>
          </div>
        </div>

        {/* Render View */}
        {isPlatformView ? (
          <PlatformDashboard locale={locale as Locale} />
        ) : (
          <TenantDashboard organization={organization} locale={locale as Locale} />
        )}
      </div>
    );
  }

  // Pure Platform Admin (no tenant organization)
  if (platformAdmin) {
    return <PlatformDashboard locale={locale as Locale} />;
  }

  // Regular Tenant Owner / Staff
  if (organization) {
    return <TenantDashboard organization={organization} locale={locale as Locale} />;
  }

  const t = await getTranslations("dashboard");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("welcome")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("noOrganization")}</p>
      <Link href="/onboarding" locale={locale as Locale} className={buttonVariants({ variant: "default", size: "lg" }) + " mt-2"}>
        {t("createOrganization")}
      </Link>
    </div>
  );
}
