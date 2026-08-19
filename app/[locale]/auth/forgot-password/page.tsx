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
      eyebrow={isAr ? "أمان الحساب" : "Account Security"}
      title={isAr ? "استعادة كلمة المرور" : "Reset Your Password"}
      subtitle={
        isAr
          ? "سنساعدك على استعادة الوصول إلى حسابك المالي وبيانات منشأتك."
          : "We'll help you securely recover access to your financial workspace."
      }
      panelTitle={
        isAr
          ? "بياناتك المالية في أيدٍ أمينة دائماً"
          : "Your financial data is always safe and secure."
      }
      panelSubtitle={
        isAr
          ? "نطبق أعلى معايير الحماية والتشفير المصرفي لضمان سرية حساباتك وعملياتك العقارية."
          : "Enterprise-grade encryption and security protocols protecting your transactions around the clock."
      }
      stats={
        isAr
          ? [
              { value: "٢٥٦-bit", label: "تشفير مصرفي" },
              { value: "١٠٠٪", label: "حماية بيانات" },
              { value: "٢٤/٧", label: "مراقبة الأمان" },
            ]
          : [
              { value: "256-bit", label: "Bank Security" },
              { value: "100%", label: "Data Safety" },
              { value: "24/7", label: "Monitoring" },
            ]
      }
      imageSrc="/images/aqarbooks-ledger.jpg"
      locale={locale}
    >
      <ForgotPasswordForm locale={locale as Locale} />
    </AuthShell>
  );
}
