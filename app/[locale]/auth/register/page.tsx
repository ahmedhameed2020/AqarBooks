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
      eyebrow={isAr ? "حساب جديد" : "New account"}
      title={isAr ? "ابدأ دفاترك من اليوم الأول" : "Start your books right"}
      subtitle={
        isAr
          ? "حساب واحد يدير جميع كياناتك العقارية. التهيئة تستغرق دقيقتين."
          : "One account runs all your properties. Setup takes two minutes."
      }
      locale={locale}
      maxWidth="xl"
    >
      <RegisterForm locale={locale} />
    </AuthShell>
  );
}
