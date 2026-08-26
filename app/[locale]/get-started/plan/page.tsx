import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { PlanStepForm } from "./plan-step-form";
import type { PlanKey } from "../onboarding-wizard-context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "اختر باقتك | AqarBooks" : "Choose Your Plan | AqarBooks",
    robots: { index: false, follow: true },
  };
}

const VALID_PLAN_KEYS: readonly string[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

export default async function GetStartedPlanPage({
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

  const initialPlan = plan && VALID_PLAN_KEYS.includes(plan) ? (plan as PlanKey) : undefined;

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب التفعيل · ٣ من ٤" : "Activation request · 3 of 4"}
      title={isAr ? "أي باقة تناسبك؟" : "Which plan fits you?"}
      subtitle={
        isAr
          ? "هذا اختيار مبدئي فقط -- لا يتم تفعيل أي صلاحيات أو باقة إلا بعد اعتماد طلبك."
          : "This is a preliminary choice only -- no entitlements are activated until your request is approved."
      }
      locale={locale}
      maxWidth="lg"
    >
      <PlanStepForm locale={locale as Locale} initialPlan={initialPlan} />
    </AuthShell>
  );
}
