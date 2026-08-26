import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { MailCheck } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "تحقّق من بريدك | AqarBooks" : "Check your email | AqarBooks",
    robots: { index: false, follow: true },
  };
}

/**
 * Lands here after startOnboardingAccountAction, regardless of whether the
 * submitted email was new or already registered -- see that action's doc
 * comment for why the two cases are deliberately indistinguishable here.
 * `email` is only ever the address the visitor themselves just typed, so
 * echoing it back discloses nothing about whether an account exists.
 */
export default async function GetStartedCheckEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  const { email } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <AuthShell
      brandName="AqarBooks"
      eyebrow={isAr ? "طلب التفعيل · ١ من ٤" : "Activation request · 1 of 4"}
      title={isAr ? "تحقّق من بريدك" : "Check your email"}
      locale={locale}
      maxWidth="md"
    >
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 shadow-xs">
          <MailCheck className="size-7" />
        </div>

        <p className="text-sm leading-relaxed text-slate-600">
          {isAr ? (
            <>
              أرسلنا تعليمات إلى{" "}
              <span className="font-semibold text-slate-900 font-mono" dir="ltr">
                {email || "بريدك الإلكتروني"}
              </span>
              . تابع باستخدام التعليمات المرسلة إلى بريدك، أو سجّل الدخول إذا كان لديك حساب AqarBooks بالفعل.
            </>
          ) : (
            <>
              We sent instructions to{" "}
              <span className="font-semibold text-slate-900 font-mono">{email || "your email address"}</span>.
              Continue using the email instructions, or sign in if you already have an AqarBooks account.
            </>
          )}
        </p>

        <Link
          href="/login?redirect_to=/get-started/company"
          locale={locale as Locale}
          className="inline-flex w-full items-center justify-center rounded-xl bg-[#07425d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#06364c]"
        >
          {isAr ? "تسجيل الدخول" : "Sign in"}
        </Link>
      </div>
    </AuthShell>
  );
}
