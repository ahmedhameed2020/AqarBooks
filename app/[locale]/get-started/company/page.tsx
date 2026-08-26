import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { CompanyStepForm } from "./company-step-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "بيانات الشركة | AqarBooks" : "Company Details | AqarBooks",
    robots: { index: false, follow: true },
  };
}

export default async function GetStartedCompanyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  // Requester identity is now established in Step 1 (a real, signed-in
  // session, new or pre-existing) -- every step past it requires one.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/get-started", locale: locale as Locale });
  }

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب التفعيل · ٢ من ٤" : "Activation request · 2 of 4"}
      title={isAr ? "حدثنا عن منشأتك." : "Tell us about your company."}
      subtitle={
        isAr
          ? "هذه البيانات تساعدنا على تجهيز منظومتك بشكل صحيح بعد الاعتماد."
          : "This helps us configure your workspace correctly once your request is approved."
      }
      locale={locale}
      maxWidth="lg"
    >
      <CompanyStepForm locale={locale as Locale} />
    </AuthShell>
  );
}
