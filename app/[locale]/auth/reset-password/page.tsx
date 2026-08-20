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
      eyebrow={isAr ? "كلمة مرور جديدة" : "New password"}
      title={isAr ? "اختر كلمة مرور جديدة" : "Choose a new password"}
      subtitle={
        isAr
          ? "اجعلها قوية، فهي مفاتيح دفاترك."
          : "Make it strong. These are the keys to your books."
      }
      locale={locale}
    >
      <Suspense fallback={null}>
        <ResetPasswordForm locale={locale as Locale} />
      </Suspense>
    </AuthShell>
  );
}
