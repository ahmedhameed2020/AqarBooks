import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "استعادة كلمة المرور | AqarBooks" : "Forgot Password | AqarBooks";
  const description = isAr
    ? "استعد إمكانية الوصول إلى حسابك المؤسسي في منصة AqarBooks بكل أمان وسهولة."
    : "Reset access to your AqarBooks enterprise account securely.";

  return {
    title,
    description,
  };
}

export default async function ForgotPasswordPage({
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
      eyebrow={isAr ? "استعادة الدخول" : "Account recovery"}
      title={isAr ? "نسيت كلمة المرور؟" : "Forgot your password?"}
      subtitle={
        isAr
          ? "لا مشكلة. أدخل بريدك وسنرسل إليك رابط تعيين جديد."
          : "It happens. Enter your email and we'll send you a reset link."
      }
      locale={locale}
    >
      <ForgotPasswordForm locale={locale as Locale} />
    </AuthShell>
  );
}
