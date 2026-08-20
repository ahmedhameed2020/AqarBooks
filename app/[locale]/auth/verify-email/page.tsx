import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { MailCheck, ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  const title = isAr ? "تأكيد البريد الإلكتروني | AqarBooks" : "Verify Your Email | AqarBooks";
  const description = isAr
    ? "يرجى تأكيد بريدك الإلكتروني لإتمام تفعيل حساب منشأتك."
    : "Please verify your email address to complete your account activation.";

  return {
    title,
    description,
  };
}

export default async function VerifyEmailPage({
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
      eyebrow={isAr ? "خطوة أخيرة" : "One last step"}
      title={isAr ? "تحقّق من بريدك" : "Check your email"}
      subtitle={
        isAr
          ? "أرسلنا إليك رابط تفعيل. افتحه لتكتمل التهيئة."
          : "We sent you an activation link. Open it and you're set."
      }
      locale={locale}
    >
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 shadow-xs">
          <MailCheck className="size-7" />
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold text-slate-900">
            {isAr ? "تحقق من صندوق الوارد" : "Check your inbox"}
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
            {isAr ? (
              <>
                أرسلنا رسالة تأكيد إلى{" "}
                <span className="font-semibold text-slate-900 font-mono" dir="ltr">
                  {email || "بريدك الإلكتروني"}
                </span>
                . انقر فوق الرابط في الرسالة لتفعيل حسابك والبدء.
              </>
            ) : (
              <>
                We sent a confirmation link to{" "}
                <span className="font-semibold text-slate-900 font-mono">
                  {email || "your email address"}
                </span>
                . Click the link in the email to activate your account.
              </>
            )}
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/login"
            locale={locale as Locale}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 text-xs font-bold transition-all"
          >
            {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
            <span>{isAr ? "العودة إلى تسجيل الدخول" : "Back to Sign In"}</span>
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
