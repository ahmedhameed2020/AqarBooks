import { Suspense } from "react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "تعيين كلمة مرور جديدة | AqarBooks" : "Set New Password | AqarBooks";
  const description = isAr
    ? "عيّن كلمة مرور جديدة وآمنة لحسابك في منصة AqarBooks."
    : "Set a new secure password for your AqarBooks account.";

  return {
    title,
    description,
  };
}

export default async function ResetPasswordPage({
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
      eyebrow={isAr ? "تحديث الأمان" : "Security Update"}
      title={isAr ? "تعيين كلمة مرور جديدة" : "Set a New Password"}
      subtitle={
        isAr
          ? "أدخل كلمة المرور الجديدة وتأكيدها لتأمين حسابك."
          : "Enter your new password below to secure your workspace."
      }
      panelTitle={
        isAr
          ? "أمان القيود والحسابات يبدأ من كلمة المرور"
          : "Ledger-level security starts with strong authentication."
      }
      panelSubtitle={
        isAr
          ? "نضمن سرية بياناتك المالية ومحافظك العقارية عبر بروتوكولات حماية متطورة."
          : "Ensuring total financial privacy and multi-entity protection across all assets."
      }
      stats={
        isAr
          ? [
              { value: "٨+ خانات", label: "الحد الأدنى" },
              { value: "١٠٠٪", label: "تشفير تام" },
              { value: "آمن", label: "بروتوكول HTTPS" },
            ]
          : [
              { value: "8+ chars", label: "Min Length" },
              { value: "100%", label: "Encrypted" },
              { value: "Secure", label: "HTTPS / TLS" },
            ]
      }
      imageSrc="/images/aqarbooks-hero.jpg"
      locale={locale}
    >
      <Suspense fallback={null}>
        <ResetPasswordForm locale={locale as Locale} />
      </Suspense>
    </AuthShell>
  );
}
