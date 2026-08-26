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
    title: isAr ? "ابدأ تفعيل حسابك | AqarBooks" : "Get Started | AqarBooks",
    description: isAr
      ? "أكمل بيانات شركتك واختر الباقة المناسبة للبدء مع AqarBooks."
      : "Complete your company details and pick the right plan to get started with AqarBooks.",
    robots: { index: false, follow: true },
  };
}

/**
 * Activation entry point.
 *
 * The old self-service registration (auth account -> onboarding wizard ->
 * ACTIVE organization with no approval and no payment) is retired; its RPC is
 * no longer executable by `authenticated`. Until the self-service activation
 * flow (email verification -> company details -> plan -> commercial gate ->
 * provisioning) ships, this page routes prospects to plan selection and the
 * live demo. Internal approval steps are an operational detail and must never
 * surface in this copy.
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
      eyebrow={isAr ? "ابدأ الآن" : "Get started"}
      title={isAr ? "ابدأ تفعيل حسابك" : "Start your AqarBooks account"}
      subtitle={
        isAr
          ? "أكمل بيانات شركتك واختر الباقة المناسبة للبدء."
          : "Complete your company details and pick the right plan to get started."
      }
      locale={locale}
      maxWidth="xl"
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {isAr
            ? "اختر الباقة المناسبة لشركتك وسنجهّز حسابك للانطلاق."
            : "Pick the plan that fits your company and we'll get your account ready to go."}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#07425d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#06364c]"
          >
            {isAr ? "اختر الباقة المناسبة" : "Choose your plan"}
          </Link>
          <Link
            href="/demo"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isAr ? "جرّب العرض الحي" : "Try the live demo"}
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
