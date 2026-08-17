import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { ContactForm } from "./contact-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr ? "تواصل معنا — عقار بوكس (AqarBooks)" : "Contact Us — AqarBooks",
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
    <div className="marketing flex min-h-full flex-1 flex-col">
      <MarketingNav locale={locale as Locale} />
      <main className="marketing-grid flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-semibold text-[var(--mk-pearl)] sm:text-3xl">
              {isAr ? "تواصل معنا" : "Contact Us"}
            </h1>
            <p className="mt-3 text-sm text-[var(--mk-text-muted)]">
              {isAr ? "عندك سؤال؟ ابعتلنا وهنرد عليك في أقرب وقت." : "Have a question? Send us a message and we'll get back to you."}
            </p>
          </div>
          <ContactForm locale={locale} />
        </div>
      </main>
    </div>
  );
}
