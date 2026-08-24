import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "../marketing-nav";
import { FoundingPlanSection } from "@/components/marketing/pricing/founding-plan-section";
import { PricingFaqSection } from "@/components/marketing/pricing/pricing-faq";
import { PricingFinalCta } from "@/components/marketing/pricing/pricing-final-cta";
import { PricingHero } from "@/components/marketing/pricing/pricing-hero";
import { getPricingCopy } from "@/components/marketing/pricing/pricing-copy";
import {
  AfterFoundingSection,
  MigrationSection,
  OnboardingSection,
  WhyFoundingSection,
} from "@/components/marketing/pricing/pricing-narrative";

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
    // `absolute` bypasses the root layout's "%s | AqarBooks" template -- the
    // authoritative title already ends in the brand, so the template would
    // render it twice.
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

  /* Structured data is deliberately limited to the ONE shape this repository
     already ships: the landing page's `SoftwareApplication` node (see
     app/[locale]/page.tsx, committed in d568084) -- same @type, same fields,
     same inline <script> delivery.

     The `Offer` array and `FAQPage` node drafted earlier were removed before
     release: neither type exists anywhere in this repository, and standing up
     new commercial structured-data types is not in scope for Pricing v1.0.
     Carrying no Offer node also means the page cannot assert an availability,
     a validThrough, a tax-inclusive price, or a standalone purchasable 2,990
     monthly rate -- claims that would each need commercial sign-off. The
     prices remain fully visible in the page body, which is what customers and
     crawlers read. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AqarBooks Founding Professional",
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
        {/* 1. Positioning */}
        <PricingHero locale={typedLocale} />

        {/* 2 + 3. Founding Program commercial offer and what it includes */}
        <FoundingPlanSection locale={typedLocale} />

        {/* 4. Why a single plan at launch */}
        <WhyFoundingSection locale={typedLocale} />

        {/* 5. Mandatory onboarding */}
        <OnboardingSection locale={typedLocale} />

        {/* 6. Complex data migration, priced separately */}
        <MigrationSection locale={typedLocale} />

        {/* 7. Commercial anchor after the Founding Program */}
        <AfterFoundingSection locale={typedLocale} />

        {/* 8. FAQ */}
        <PricingFaqSection locale={typedLocale} />

        {/* 9. Closing CTA + footer */}
        <PricingFinalCta locale={typedLocale} />
      </main>
    </div>
  );
}
