import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingWizard } from "./onboarding-wizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "تهيئة منظومتك العقارية | AqarBooks" : "Set Up Your Real Estate Workspace | AqarBooks";
  const description = isAr
    ? "اختر دولتك وجهّز مؤسستك ومشروعك العقاري الأول على AqarBooks في دقائق."
    : "Select your country and configure your real estate workspace and first project on AqarBooks.";

  return { title, description };
}

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
      eyebrow={isAr ? "إعداد الحساب الجديد" : "New Account Setup"}
      title={isAr ? "انطلق مع AqarBooks" : "Launch with AqarBooks"}
      subtitle={
        isAr
          ? "3 خطوات ذكية وبسيطة لتهيئة منظومتك المحاسبية والعقارية فوراً."
          : "3 simple, smart steps to configure your financial and real estate workspace."
      }
      locale={locale}
      maxWidth="2xl"
    >
      <OnboardingWizard locale={locale} />
    </AuthShell>
  );
}
