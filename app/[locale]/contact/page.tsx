import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { ContactForm } from "./contact-form";
import { Mail, Phone, MapPin, Building2, ShieldCheck } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "تواصل معنا | عقار بوكس (AqarBooks)" : "Contact Us | AqarBooks",
    description: isAr
      ? "تواصل مع فريق الدعم والمبيعات في عقار بوكس للاستفسارات الفنية والمحاسبية والشراكات."
      : "Get in touch with AqarBooks support and sales team for enterprise accounting inquiries.",
    robots: { index: false, follow: true },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#1A3C2E]/20 selection:text-[#1A3C2E]">
      <MarketingNav locale={locale as Locale} />

      <main className="relative flex flex-1 items-center justify-center px-6 py-16 lg:py-24">
        {/* Subtle Architectural Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-70 pointer-events-none" />

        <div className="relative w-full max-w-4xl">
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1A3C2E]/20 bg-[#1A3C2E]/5 px-3.5 py-1 text-xs font-bold text-[#1A3C2E] mb-4">
              <Mail className="size-3.5" />
              <span>{isAr ? "خدمة العملاء والشركاء" : "Direct Support & Sales"}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading">
              {isAr ? "تواصل مع فريق عقار بوكس." : "Get in touch with our team."}
            </h1>

            <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-lg mx-auto">
              {isAr
                ? "لديك استفسار محاسبي أو تقني؟ أرسل لنا رسالتك وسنرد عليك عبر المتخصص المناسب فوراً."
                : "Have an accounting or technical question? Send us a message and our specialists will respond promptly."}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Contact Info Side Card */}
            <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-[#FAFAFA] p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-900 font-heading">
                    {isAr ? "قنوات التواصل المباشرة" : "Direct Channels"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {isAr ? "متاحون خلال ساعات العمل الرسمية (الأحد - الخميس)." : "Available Sunday through Thursday."}
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#1A3C2E]">
                      <Mail className="size-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "البريد الإلكتروني العام" : "General Email"}</span>
                      <p className="font-mono font-bold text-slate-900">support@aqarbooks.com</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#1A3C2E]">
                      <Phone className="size-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "الهاتف وخدمة المبيعات" : "Sales & Enterprise Line"}</span>
                      <p className="font-mono font-bold text-slate-900">+20 100 000 0000</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white border border-slate-200 text-[#1A3C2E]">
                      <MapPin className="size-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "المقر الإقليمي" : "Regional HQ"}</span>
                      <p className="font-bold text-slate-900">{isAr ? "القاهرة الجديدة، مصر" : "New Cairo, Egypt"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-700 shrink-0" />
                <span>{isAr ? "سرية وأمان تام لكافة المراسلات" : "Confidential & Secure Communications"}</span>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-7 rounded-3xl border border-slate-200/90 bg-[#FAFAFA] p-6 sm:p-8 shadow-sm">
              <ContactForm locale={locale} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
