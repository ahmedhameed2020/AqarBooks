import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { stripLocalePrefix } from "@/lib/i18n/strip-locale-prefix";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "./register-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "إنشاء حساب مؤسسي جديد | AqarBooks" : "Create Enterprise Account | AqarBooks";
  const description = isAr
    ? "أنشئ حساب منشأتك على منصّة AqarBooks وابدأ إدارة المحافظ العقارية والقيود المحاسبية."
    : "Create your organization account on AqarBooks to govern real estate assets and accounting ledgers.";

  return {
    title,
    description,
  };
}

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
      eyebrow={isAr ? "ابدأ الآن" : "Get Started"}
      title={isAr ? "إنشاء حساب مؤسسي جديد" : "Create Your Enterprise Account"}
      subtitle={
        isAr
          ? "جهّز منظومتك المالية والمحاسبية لكياناتك العقارية في أقل من دقيقتين."
          : "Set up your multi-entity financial workspace in under two minutes."
      }
      panelTitle={
        isAr
          ? "محفظتك العقارية تستحق أدوات مالية أدق وأرقى"
          : "Your real estate portfolio deserves institutional tools."
      }
      panelSubtitle={
        isAr
          ? "انضم إلى الكيانات والصناديق العقارية التي تدير آلاف الوحدات والأصول بوضوح تام."
          : "Join real estate funds and holding companies managing thousands of assets with clarity."
      }
      stats={
        isAr
          ? [
              { value: "٢ دقيقة", label: "زمن التهيئة" },
              { value: "١٠٠٪", label: "عزل مالي RLS" },
              { value: "مجاناً", label: "للتجربة والعرض" },
            ]
          : [
              { value: "2 min", label: "Setup time" },
              { value: "100%", label: "RLS Isolation" },
              { value: "Free", label: "Trial Demo" },
            ]
      }
      imageSrc="/images/executive-boardroom.jpg"
      locale={locale}
    >
      <RegisterForm locale={locale} />
    </AuthShell>
  );
}
