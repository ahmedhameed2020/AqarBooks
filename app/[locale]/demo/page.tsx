import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { DemoForm } from "./demo-form";
import { ShieldCheck, Building2, Scale, Users } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "طلب عرض توضيحي | AqarBooks" : "Request a Demo | AqarBooks",
    description: isAr
      ? "تواصل مع خبرائنا المحاسبيين لتحديد موعد عرض عملي لنظام AqarBooks على واقع كيانك العقاري."
      : "Schedule a specialized real-estate accounting walkthrough with our product specialists.",
    robots: { index: false, follow: true },
  };
}

export default async function DemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#07425d]/20 selection:text-[#07425d]">
      <MarketingNav locale={locale as Locale} />

      <main className="relative flex flex-1 items-center justify-center px-6 py-16 lg:py-24">
        {/* Subtle Architectural Drafting Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-70 pointer-events-none" />

        <div className="relative w-full max-w-2xl">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d] mb-4">
              <Building2 className="size-3.5" />
              <span>{isAr ? "جلسة استشارية محاسبية متخصصة" : "Specialized Accounting Walkthrough"}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading">
              {isAr ? "استكشف النظام على واقع كيانك العقاري." : "Request a live ERP demonstration."}
            </h1>

            <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-lg mx-auto">
              {isAr
                ? "أخبرنا عن نوع منشأتك (كمبوند، برج، منتجع، أو اتحاد ملاك)، وسيقوم مستشارونا الماليون بتجهيز عرض عملي مخصص."
                : "Tell us about your portfolio structure (compound, tower, resort, or HOA), and our financial advisors will prepare a personalized demo."}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/90 bg-[#FAFAFA] p-6 sm:p-10 shadow-sm">
            <DemoForm locale={locale} />
          </div>
        </div>
      </main>
    </div>
  );
}
