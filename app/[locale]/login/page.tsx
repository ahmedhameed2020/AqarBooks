import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "تسجيل الدخول | AqarBooks" : "Sign In | AqarBooks";
  const description = isAr
    ? "سجّل الدخول إلى منصّة AqarBooks للوصول إلى لوحات التحكم والبيانات المالية لمنشأتك."
    : "Sign in to your AqarBooks account to access your financial dashboards and ledgers.";

  return {
    title,
    description,
  };
}

export default async function LoginPage({
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
      eyebrow={isAr ? "تسجيل الدخول" : "Sign in"}
      title={isAr ? "عُد إلى دفاترك" : "Back to your books"}
      subtitle={
        isAr
          ? "كل شيء كما تركته تمامًا."
          : "Everything exactly where you left it."
      }
      locale={locale}
    >
      <LoginForm locale={locale as Locale} redirectTo={redirectTo} />
    </AuthShell>
  );
}
