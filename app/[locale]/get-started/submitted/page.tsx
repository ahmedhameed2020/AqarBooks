import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { AuthShell } from "@/components/auth/auth-shell";
import { CheckCircle2 } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";

  return {
    title: isAr ? "تم استلام طلبك | AqarBooks" : "Request Received | AqarBooks",
    robots: { index: false, follow: true },
  };
}

export default async function GetStartedSubmittedPage({
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
      eyebrow={isAr ? "تم الإرسال" : "Submitted"}
      title={isAr ? "تم استلام طلبك بنجاح." : "Your request has been received."}
      locale={locale}
      maxWidth="md"
    >
      <div className="space-y-6 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" />
        <p className="text-sm leading-relaxed text-slate-600">
          {isAr
            ? "تم استلام طلب التفعيل بنجاح. سيقوم فريق AqarBooks بمراجعة بياناتك والتواصل معك لاستكمال التفعيل."
            : "Your activation request has been received. The AqarBooks team will review your information and contact you to complete activation."}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#07425d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#06364c]"
          >
            {isAr ? "العودة للصفحة الرئيسية" : "Back to homepage"}
          </Link>
          <Link
            href="/demo"
            locale={locale as Locale}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            {isAr ? "جرّب العرض الحي في الأثناء" : "Explore the Live Demo meanwhile"}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
