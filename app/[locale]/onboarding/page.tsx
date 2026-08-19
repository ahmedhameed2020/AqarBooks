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

  const title = isAr ? "تجهيز مؤسستك | AqarBooks" : "Set Up Your Organization | AqarBooks";
  const description = isAr
    ? "أنشئ مؤسستك وأول مشروع عقاري لك على AqarBooks."
    : "Create your organization and first real estate project on AqarBooks.";

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
      eyebrow={isAr ? "الخطوة الأخيرة" : "Last Step"}
      title={isAr ? "جهّز مؤسستك" : "Set Up Your Organization"}
      subtitle={
        isAr
          ? "خطوتين بسيطتين وتبقى منظومتك المالية جاهزة."
          : "Two simple steps and your financial workspace is ready."
      }
      panelTitle={
        isAr
          ? "كل مؤسسة عقارية تستحق بداية واضحة"
          : "Every real estate entity deserves a clear start."
      }
      panelSubtitle={
        isAr
          ? "من هنا هتقدر تدير كل مشاريعك ووحداتك وحساباتك من مكان واحد."
          : "From here you'll manage every project, unit, and ledger in one place."
      }
      stats={
        isAr
          ? [
              { value: "خطوتين", label: "لإنشاء المؤسسة" },
              { value: "فوري", label: "تفعيل الحساب" },
              { value: "١٠٠٪", label: "عزل مالي RLS" },
            ]
          : [
              { value: "2 Steps", label: "To create your org" },
              { value: "Instant", label: "Account activation" },
              { value: "100%", label: "RLS isolation" },
            ]
      }
      imageSrc="/images/aqarbooks-entities.jpg"
      locale={locale}
    >
      <OnboardingWizard locale={locale} />
    </AuthShell>
  );
}
