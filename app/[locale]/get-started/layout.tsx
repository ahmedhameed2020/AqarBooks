import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { OnboardingWizardProvider } from "./onboarding-wizard-context";

export default async function GetStartedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return <OnboardingWizardProvider>{children}</OnboardingWizardProvider>;
}
