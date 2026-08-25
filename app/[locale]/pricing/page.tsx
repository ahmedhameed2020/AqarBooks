import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { PricingView } from "@/components/marketing/pricing/pricing-view";
import { getPricingCopy } from "@/components/marketing/pricing/pricing-copy";
import { getFoundingSlotsRemaining } from "@/components/marketing/pricing/pricing-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getPricingCopy(locale as Locale);
  const isAr = locale === "ar";
  const url = `https://aqarbooks.com/${locale}/pricing`;
  const ogImageUrl = "https://aqarbooks.com/og-image.jpg";

  return {
    title: { absolute: copy.meta.title },
    description: copy.meta.description,
    openGraph: {
      title: copy.meta.title,
      description: copy.meta.description,
      url,
      siteName: isAr ? "AqarBooks — محاسبة عقارية بذكاء" : "AqarBooks ERP",
      locale: isAr ? "ar_EG" : "en_US",
      type: "website",
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: copy.meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.meta.title,
      description: copy.meta.description,
      images: [ogImageUrl],
    },
    alternates: {
      canonical: url,
      languages: {
        ar: "https://aqarbooks.com/ar/pricing",
        en: "https://aqarbooks.com/en/pricing",
      },
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const typedLocale = locale as Locale;
  const copy = getPricingCopy(typedLocale);
  const foundingSlotsRemaining = getFoundingSlotsRemaining();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AqarBooks Real Estate Accounting ERP",
    applicationCategory: "Accounting & Real Estate ERP",
    operatingSystem: "Web",
    description: copy.meta.description,
  };

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#07425d]/20 selection:text-[#07425d]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <MarketingNav locale={typedLocale} />

      <main className="flex-1">
        <PricingView
          locale={typedLocale}
          foundingSlotsRemaining={foundingSlotsRemaining}
        />
      </main>
    </div>
  );
}
