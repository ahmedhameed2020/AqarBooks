import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { ReviewStepForm } from "./review-step-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "مراجعة الطلب | AqarBooks" : "Review & Submit | AqarBooks",
    robots: { index: false, follow: true },
  };
}

export default async function GetStartedReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب التفعيل · ٤ من ٤" : "Activation request · 4 of 4"}
      title={isAr ? "راجع بياناتك قبل الإرسال." : "Review before you submit."}
      subtitle={
        isAr
          ? "بعد الإرسال، يراجع فريق AqarBooks طلبك ويتواصل معك لاستكمال التفعيل."
          : "After submitting, the AqarBooks team reviews your request and contacts you to complete activation."
      }
      locale={locale}
      maxWidth="lg"
    >
      <ReviewStepForm locale={locale as Locale} />
    </AuthShell>
  );
}
