import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { AccountStepForm } from "./account-step-form";
import type { PlanKey } from "./onboarding-wizard-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "طلب تفعيل حساب مؤسسي | AqarBooks" : "Request Activation | AqarBooks",
    description: isAr
      ? "ابدأ طلب تفعيل منظومتك: حساب، بيانات الشركة، والباقة المناسبة."
      : "Start your activation request: account, company details, and the right plan.",
    robots: { index: false, follow: true },
  };
}

const VALID_PLAN_KEYS: readonly string[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

export default async function GetStartedAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { locale } = await params;
  const { plan } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  // An existing customer never needs this flow -- send them straight to
  // their workspace, the same guard the old /auth/register page carried.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect({ href: "/dashboard", locale: locale as Locale });
  }

  const initialPlan = plan && VALID_PLAN_KEYS.includes(plan) ? (plan as PlanKey) : undefined;

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب التفعيل · ١ من ٤" : "Activation request · 1 of 4"}
      title={isAr ? "لنبدأ بحسابك." : "Let's start with your account."}
      subtitle={
        isAr
          ? "هذا حساب حقيقي تستخدمه لاحقًا لتسجيل الدخول بعد اعتماد طلبك -- لا يُنشئ أي منظومة بعد."
          : "This is a real account you'll use to sign in once your request is approved -- it doesn't create a workspace yet."
      }
      locale={locale}
      maxWidth="lg"
    >
      <AccountStepForm locale={locale as Locale} initialPlan={initialPlan} />
    </AuthShell>
  );
}
