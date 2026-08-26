import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "تهيئة المنظومة | AqarBooks" : "Workspace Setup | AqarBooks",
    description: isAr
      ? "تهيئة منظومة AqarBooks تتم عبر فريق التأسيس بعد اعتماد الطلب."
      : "AqarBooks workspaces are provisioned by our onboarding team once a request is approved.",
    robots: { index: false, follow: true },
  };
}

/**
 * Self-service tenant provisioning is retired.
 *
 * This route used to render a three-step wizard whose submit called
 * create_organization_onboarding and created an ACTIVE organization on the
 * spot. That RPC's EXECUTE grant has been revoked from `authenticated`, so the
 * wizard could now only ever produce a raw 42501. Rather than leave a route
 * that dead-ends in a Postgres error, the journey is retired outright:
 * workspaces are provisioned by an approved request, and until the approval
 * flow ships, public acquisition ends at Demo / Pricing / Contact.
 *
 * The membership redirect below is retained deliberately -- an existing
 * customer who lands here still goes straight to their dashboard.
 */
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: "/login", locale: locale as Locale });
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("user_id", user!.id)
    .in("status", ["active", "invited"])
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect({ href: "/dashboard", locale: locale as Locale });
  }

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "تهيئة المنظومة" : "Workspace setup"}
      title={isAr ? "حسابك جاهز، ومنظومتك قيد التجهيز." : "Your account is ready. Your workspace is being prepared."}
      subtitle={
        isAr
          ? "تهيئة منظومة AqarBooks تتم عبر فريق التأسيس، للتأكد من إعداد الدليل المحاسبي والسنة المالية بشكل صحيح من أول يوم."
          : "AqarBooks workspaces are configured by our onboarding team, so your chart of accounts and fiscal year are right from day one."
      }
      locale={locale}
      maxWidth="xl"
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {isAr
            ? "حسابك موجود بالفعل، لكنه غير مرتبط بأي منظومة بعد. تواصل معنا وسنكمل التأسيس معك ونفعّل المنظومة على بياناتك."
            : "Your account exists but isn't linked to a workspace yet. Talk to us and we'll complete setup and activate your workspace on your own data."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/contact"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#07425d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#06364c]"
          >
            {isAr ? "تحدث مع فريق AqarBooks" : "Talk to AqarBooks"}
          </Link>
          <Link
            href="/demo"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isAr ? "استكشف النظام" : "Explore the system"}
          </Link>
        </div>

        <p className="text-center text-xs text-slate-500">
          {isAr ? "لديك منظومة بالفعل؟ " : "Already have a workspace? "}
          <Link href="/login" locale={locale as Locale} className="font-bold text-[#07425d] hover:underline">
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
