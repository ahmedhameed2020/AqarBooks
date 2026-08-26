import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";
import { AuthShell } from "@/components/auth/auth-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "طلب حساب مؤسسي | AqarBooks" : "Request an Enterprise Account | AqarBooks",
    description: isAr
      ? "حسابات AqarBooks المؤسسية يتم تأسيسها عبر فريقنا بعد اعتماد الطلب."
      : "AqarBooks enterprise accounts are provisioned by our team once a request is approved.",
    robots: { index: false, follow: true },
  };
}

/**
 * Public self-service registration is retired.
 *
 * Registration used to create an auth account that immediately fed the
 * onboarding wizard, which provisioned an ACTIVE organization with no approval
 * and no payment. That RPC is no longer executable by `authenticated`, so the
 * journey now leads nowhere; the route is kept (rather than deleted) so that
 * existing links and confirmation emails land on an explanation instead of a
 * 404 or a raw Postgres error.
 *
 * Existing customer sign-in is deliberately untouched.
 */
export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ redirect_to?: string }>;
}) {
  const { locale } = await params;
  const { redirect_to: redirectTo } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const target = redirectTo ? stripLocalePrefix(redirectTo) : "/dashboard";
    redirect({ href: target, locale: locale as Locale });
  }

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب حساب" : "Request access"}
      title={isAr ? "نؤسس منظومتك معك، لا نتركك أمام نموذج فارغ." : "We set your workspace up with you."}
      subtitle={
        isAr
          ? "حسابات AqarBooks يتم تأسيسها عبر فريقنا حتى يبدأ دليلك المحاسبي وسنتك المالية صحيحين من أول يوم."
          : "AqarBooks accounts are provisioned by our team, so your chart of accounts and fiscal year start correct."
      }
      locale={locale}
      maxWidth="xl"
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {isAr
            ? "شاهد النظام على بيانات حقيقية أولاً، ثم تواصل معنا لتأسيس منظومة شركتك."
            : "See the system on real data first, then talk to us to have your company's workspace provisioned."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/demo"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#07425d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#06364c]"
          >
            {isAr ? "استكشف النظام" : "Explore the system"}
          </Link>
          <Link
            href="/contact"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isAr ? "تحدث مع فريق AqarBooks" : "Talk to AqarBooks"}
          </Link>
        </div>

        <p className="text-center text-xs text-slate-500">
          {isAr ? "لديك حساب بالفعل؟ " : "Already have an account? "}
          <Link href="/login" locale={locale as Locale} className="font-bold text-[#07425d] hover:underline">
            {isAr ? "تسجيل الدخول" : "Sign in"}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
