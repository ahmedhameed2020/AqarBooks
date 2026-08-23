import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "./marketing-nav";
import { EditorialHero } from "@/components/marketing/editorial-hero";
import { SectionPropertyEvent } from "@/components/marketing/section-property-event";
import { SectionAccountingEngine } from "@/components/marketing/section-accounting-engine";
import { SectionPropertyDimension } from "@/components/marketing/section-property-dimension";
import { SectionFollowMoney } from "@/components/marketing/section-follow-money";
import { SectionOperatingLedger } from "@/components/marketing/section-operating-ledger";
import { SectionFinancialControl } from "@/components/marketing/section-financial-control";
import { SectionFinancialReports } from "@/components/marketing/section-financial-reports";
import { SectionAiLayer } from "@/components/marketing/section-ai-layer";
import { SectionEntityTypes } from "@/components/marketing/section-entity-types";
import { SectionFinalCta } from "@/components/marketing/section-final-cta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const title = isAr
    ? "عقار بوكس (AqarBooks) | النظام المحاسبي المتكامل لإدارة العقارات والمنتجعات"
    : "AqarBooks | Enterprise Real Estate & Resort Accounting ERP";
  const description = isAr
    ? "نظام محاسبي متكامل لإدارة العقارات والمنتجعات والكيانات العقارية واتحادات الملاك بقيد مزدوج حقيقي. متوافق مع منظومة الضرائب والفوترة الإلكترونية."
    : "Enterprise double-entry accounting ERP for real estate entities, resorts, towers, and HOAs. Compliant with regional tax and e-invoicing standards.";

  const siteUrl = `https://aqarbooks.com/${locale}`;
  const ogImageUrl = "https://aqarbooks.com/images/aqarbooks-hero-property.jpg";

  return {
    metadataBase: new URL("https://aqarbooks.com"),
    title,
    description,
    openGraph: {
      title,
      description,
      url: siteUrl,
      siteName: isAr ? "عقار بوكس (AqarBooks)" : "AqarBooks ERP",
      locale: isAr ? "ar_EG" : "en_US",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: isAr ? "عقار بوكس — المحاسبة التي تفهم العقار" : "AqarBooks Real Estate Accounting ERP",
          type: "image/jpeg",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
      creator: "@aqarbooks",
    },
    alternates: {
      canonical: siteUrl,
      languages: { ar: "https://aqarbooks.com/ar", en: "https://aqarbooks.com/en" },
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AqarBooks",
    applicationCategory: "Accounting & Real Estate ERP",
    operatingSystem: "Web",
    description: isAr
      ? "نظام عقار بوكس المحاسبي المتكامل لإدارة العقارات والمنتجعات واتحادات الملاك بقيد مزدوج حقيقي ومطابقة ضريبية."
      : "AqarBooks Enterprise Double-Entry Real Estate & Resort Accounting ERP.",
  };

  return (
    <div className="relative flex min-h-full flex-1 flex-col bg-white text-slate-900 selection:bg-[#1A3C2E]/20 selection:text-[#1A3C2E]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      {/* 1. Header Navigation */}
      <MarketingNav locale={locale as Locale} />

      <main className="flex-1">
        {/* 2. Editorial Product-Led Hero */}
        <EditorialHero locale={locale as Locale} />

        {/* 3. Section 01: The Property Event */}
        <SectionPropertyEvent locale={locale as Locale} />

        {/* 4. Section 02: The Accounting Engine */}
        <SectionAccountingEngine locale={locale as Locale} />

        {/* 5. Section 03: Property as a Financial Dimension */}
        <SectionPropertyDimension locale={locale as Locale} />

        {/* 6. Section 04: Follow the Money */}
        <SectionFollowMoney locale={locale as Locale} />

        {/* 7. Section 05: Real-Estate Accounting Workflows (Operating Ledger) */}
        <SectionOperatingLedger locale={locale as Locale} />

        {/* 8. Section 06: Financial Control & Auditability */}
        <SectionFinancialControl locale={locale as Locale} />

        {/* 9. Section 07: Financial Reports & Statements */}
        <SectionFinancialReports locale={locale as Locale} />

        {/* 10. Section 08: The AI Layer (Proposes & Validates) */}
        <SectionAiLayer locale={locale as Locale} />

        {/* 11. Section 09: Built for Real-Estate Entities */}
        <SectionEntityTypes locale={locale as Locale} />

        {/* 12. Section 10: Final Editorial CTA & Clean Footer */}
        <SectionFinalCta locale={locale as Locale} />
      </main>
    </div>
  );
}
