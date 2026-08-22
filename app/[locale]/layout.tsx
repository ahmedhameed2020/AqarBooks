import type { Metadata, Viewport } from "next";
import { Cairo, Plus_Jakarta_Sans, IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { AuthRecoveryListener } from "@/components/auth/auth-recovery-listener";
import "../globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#060a18" },
  ],
};

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const DIRECTION: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const title = isAr
    ? "عقار بوكس (AqarBooks) | النظام المحاسبي المتكامل لإدارة العقارات والمنتجعات"
    : "AqarBooks | Real Estate & Resort Accounting ERP";
  const description = isAr
    ? "نظام محاسبي متكامل لإدارة العقارات والمنتجعات والكيانات العقارية بقيد مزدوج حقيقي. متوافق مع منظومة الفاتورة الإلكترونية والضرائب المصرية (ETA) وهيئة الزكاة والضريبة والجمارك (ZATCA)."
    : "Enterprise double-entry accounting ERP for tourist resorts, residential towers, private villas, retail plazas, and HOAs. Compliant with ETA & ZATCA e-invoicing.";
  const siteUrl = `https://aqarbooks.com/${locale}`;
  const ogImageUrl = "https://aqarbooks.com/images/aqarbooks-hero.jpg";

  return {
    metadataBase: new URL("https://aqarbooks.com"),
    title: {
      default: title,
      template: isAr ? "%s | عقار بوكس" : "%s | AqarBooks",
    },
    description,
    applicationName: "AqarBooks",
    keywords: [
      "محاسبة عقارات",
      "برنامج محاسبة القرى السياحية",
      "إدارة المنتجعات السياحية",
      "فاتورة إلكترونية مصر",
      "زاتكا السعودية",
      "إدارة الأملاك والوحدات",
      "Real Estate Accounting ERP",
      "Resort Management System",
      "Double Entry Accounting",
      "ZATCA E-Invoicing",
      "ETA Tax Invoices",
      "AqarBooks",
    ],
    authors: [{ name: "AqarBooks", url: "https://aqarbooks.com" }],
    creator: "AqarBooks Inc.",
    publisher: "AqarBooks",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: isAr ? "ar_EG" : "en_US",
      alternateLocale: isAr ? ["en_US"] : ["ar_EG"],
      url: siteUrl,
      title,
      description,
      siteName: isAr ? "عقار بوكس (AqarBooks)" : "AqarBooks ERP",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: isAr ? "عقار بوكس — النظام المحاسبي المتكامل لإدارة العقارات والمنتجعات" : "AqarBooks Real Estate Accounting ERP",
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
      site: "@aqarbooks",
    },
    alternates: {
      canonical: siteUrl,
      languages: {
        ar: "https://aqarbooks.com/ar",
        en: "https://aqarbooks.com/en",
      },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);
  const direction = DIRECTION[locale as Locale];

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${cairo.variable} ${jakartaSans.variable} ${plexArabic.variable} ${plexMono.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <NextIntlClientProvider>
          <AuthRecoveryListener locale={locale} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
