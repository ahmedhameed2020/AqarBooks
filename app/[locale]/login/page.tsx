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
      eyebrow={isAr ? "مرحباً بعودتك" : "Welcome Back"}
      title={isAr ? "تسجيل الدخول إلى حسابك" : "Sign In to Your Account"}
      subtitle={
        isAr
          ? "أصولك، عقودك، والقيود المحاسبية لمنشأتك — في لوحة تحكم مالية واحدة."
          : "Your properties, contracts, and financial ledgers — one calm dashboard."
      }
      panelTitle={
        isAr
          ? "حوكمة مالية متكاملة تحت السيطرة المطلقة"
          : "Real estate finances, beautifully under control."
      }
      panelSubtitle={
        isAr
          ? "تتبع كافة القيود، المحافظ، وكشوف الملاك بدقة محاسبية غير قابلة للتشكيك."
          : "Track every unit, contract, and balance sheet ledger from a single source of truth."
      }
      stats={
        isAr
          ? [
              { value: "٢٫٤B+", label: "أصول مدارة" },
              { value: "١٠٠٪", label: "توازن قيود" },
              { value: "٩٩٫٩٪", label: "جاهزية SLA" },
            ]
          : [
              { value: "2.4B+", label: "AUM" },
              { value: "100%", label: "Balanced" },
              { value: "99.9%", label: "Uptime" },
            ]
      }
      imageSrc="/images/commercial-towers.jpg"
      locale={locale}
    >
      <LoginForm locale={locale as Locale} redirectTo={redirectTo} />
    </AuthShell>
  );
}
