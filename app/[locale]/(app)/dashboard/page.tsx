import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { getCurrentUser, isPlatformAdmin } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { TenantDashboard } from "./tenant-dashboard";
import { PlatformDashboard } from "./platform-dashboard";

const ACTIONABLE_REQUEST_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PROVISIONING"] as const;

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

  // No organization yet -- but that might mean "pending review", not "never
  // asked". A user with an actionable onboarding_requests row (their own,
  // readable via onboarding_requests_select_own) submitted an activation
  // request that hasn't been decided yet; showing them the generic
  // "create a workspace" CTA here would just collide with the one-
  // actionable-request-per-requester constraint on a second attempt.
  const supabase = await createClient();
  const { data: pendingRequest } = await supabase
    .from("onboarding_requests")
    .select("status, organization_name, submitted_at")
    .eq("requester_user_id", user.id)
    .in("status", ACTIONABLE_REQUEST_STATUSES)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const t = await getTranslations("dashboard");

  if (pendingRequest) {
    const isAr = locale === "ar";
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <h1 className="text-xl font-semibold">{t("welcome")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {isAr
            ? `طلب تفعيل "${pendingRequest.organization_name}" قيد المراجعة من فريق AqarBooks. سنتواصل معك فور اعتماده.`
            : `Your activation request for "${pendingRequest.organization_name}" is under review by the AqarBooks team. We'll be in touch once it's approved.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">{t("welcome")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("noOrganization")}</p>
      <Link href="/get-started" locale={locale as Locale} className={buttonVariants({ variant: "default", size: "lg" }) + " mt-2"}>
        {t("createOrganization")}
      </Link>
    </div>
  );
}
