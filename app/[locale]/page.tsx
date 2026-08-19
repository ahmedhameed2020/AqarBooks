import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "./marketing-nav";
import { FlowLinesBackground } from "@/components/marketing/flow-lines-background";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { LiveLedgerTicker } from "@/components/marketing/live-ledger-ticker";
import { BentoGridShowcase } from "@/components/marketing/bento-grid-showcase";
import { EntitiesShowcase } from "@/components/marketing/entities-showcase";
import { AccountingEngineShowcase } from "@/components/marketing/accounting-engine-showcase";
import { RoiCalculator } from "@/components/marketing/roi-calculator";
import { InteractivePricing } from "@/components/marketing/interactive-pricing";
import { InteractiveFaq } from "@/components/marketing/interactive-faq";
import { CtaBanner } from "@/components/marketing/cta-banner";
import {
  ShieldCheck,
  Building2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const title = isAr
    ? "عقار بوكس (AqarBooks) — المنظومة المحاسبية المتكاملة لإدارة العقارات والمنتجعات (مصر والخليج)"
    : "AqarBooks — Enterprise Real Estate & Resort Accounting ERP (Egypt & GCC)";
  const description = isAr
    ? "إدارة مالية ومحاسبية واضحة ومضبوطة بالقيد المزدوج للأبراج السكنية، القرى والمنتجعات، المراكز التجارية، واتحادات الملاك. متوافق مع الضرائب المصرية (VAT/WHT) ومنظومة زاتكا (ZATCA)."
    : "Enterprise double-entry accounting ERP for residential towers, coastal resorts, commercial plazas, and HOAs. Compliant with Egyptian Tax & Saudi ZATCA e-invoicing.";

  return {
    title,
    description,
    openGraph: { title, description, locale: isAr ? "ar_EG" : "en_US", type: "website" },
    twitter: { card: "summary_large_image", title, description },
    alternates: {
      languages: { ar: "/ar", en: "/en" },
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
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AqarBooks",
    applicationCategory: "Accounting & Real Estate ERP",
    operatingSystem: "Web",
    description: isAr
      ? "نظام عقار بوكس المحاسبي المتكامل لإدارة العقارات والمنتجعات واتحادات الملاك بقيد مزدوج حقيقي ومطابقة ضريبية لمصر والخليج."
      : "AqarBooks Enterprise Double-Entry Real Estate & Resort Accounting ERP for Egypt and GCC.",
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[#060a18] text-[#f8fafc] selection:bg-blue-600 selection:text-white font-sans antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      
      {/* Top Floating Navbar */}
      <MarketingNav locale={locale as Locale} />

      {/* ── 1. Hero Section ────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-12 pb-20 text-center">
        {/* Animated Background Flow Lines & Glow */}
        <FlowLinesBackground />

        <div className="relative z-10 mx-auto max-w-4xl space-y-6">
          
          {/* Top Trust Signal Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-[#0b1126]/90 px-4.5 py-1.5 text-xs text-blue-200 shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] backdrop-blur-md transition-transform hover:scale-105">
            <span className="size-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-bold">
              {isAr
                ? "قيد مزدوج حقيقي • متوافق مع الضرائب المصرية (VAT/WHT) وهيئة الزكاة (ZATCA)"
                : "True Double-Entry • Egyptian Tax (VAT/WHT) & Saudi ZATCA Ready"}
            </span>
          </div>

          {/* Main Hero Headline (Human, Natural & Persuasive) */}
          <h1 className="text-balance text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.15]">
            {isAr ? (
              <>
                حسابات عقاراتك..{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                  واضحة، مضبوطة، وبكل بساطة
                </span>
              </>
            ) : (
              <>
                Property Accounting,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                  Accurate, Calm & Effortless
                </span>
              </>
            )}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto max-w-2xl text-balance text-base text-slate-300 sm:text-lg leading-relaxed font-normal">
            {isAr
              ? "منظومة مالية متكاملة تدير أبراجك، منتجعاتك، مجمعاتك ومحلاتك التجارية — من تحصيل الإيجارات ورسوم الصيانة حتى كشوف حسابات الملاك والضرائب في مصر والخليج."
              : "An all-in-one financial operating system governing your towers, resorts, retail plazas, and HOAs — from automated collections to owner ledgers and localized tax compliance."}
          </p>

          {/* Dual Action CTAs */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              locale={locale as Locale}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
            >
              <span>{isAr ? "طلب عرض توضيحي حي" : "Request Live Demo"}</span>
              <Arrow className="size-4" />
            </Link>
            
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b1126]/90 px-7 py-4 text-sm font-bold text-slate-200 transition-all hover:border-white/20 hover:bg-[#0f1733] hover:text-white"
            >
              <span>{isAr ? "استكشف المزايا المحاسبية" : "Explore Accounting Features"}</span>
            </a>
          </div>

          {/* Trust Highlights */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              {isAr ? "ترحيل ذري يمنع عدم توازن القيود" : "Atomic Balanced Posting"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-blue-400" />
              {isAr ? "عزل مالي RLS صارم لكل منشأة" : "Strict Multi-Tenant RLS"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-purple-400" />
              {isAr ? "واجهة عربية وإنجليزية كاملة" : "Bilingual Arabic & English"}
            </span>
          </div>

        </div>

        {/* Visual Hero Showcase Card */}
        <div className="mt-14">
          <HeroVisual isAr={isAr} />
        </div>
      </section>

      {/* ── 2. Real-time Live Ledger Marquee Ticker ────────────────────────── */}
      <LiveLedgerTicker isAr={isAr} />

      {/* ── 3. 21st.dev Style Bento Grid Showcase ────────────────────────── */}
      <BentoGridShowcase isAr={isAr} />

      {/* ── 4. The 5 Real Estate Entities Showcase ────────────────────────── */}
      <EntitiesShowcase isAr={isAr} />

      {/* ── 5. Accounting Engine & Regional Tax Breakdown ─────────────────── */}
      <AccountingEngineShowcase isAr={isAr} />

      {/* ── 6. Interactive ROI & Time-Saved Calculator ─────────────────────── */}
      <RoiCalculator isAr={isAr} locale={locale as Locale} />

      {/* ── 7. Pricing & Subscription Plans ───────────────────────────────── */}
      <InteractivePricing isAr={isAr} locale={locale as Locale} />

      {/* ── 8. Searchable & Categorized FAQ ───────────────────────────────── */}
      <InteractiveFaq isAr={isAr} />

      {/* ── 9. Final High-Converting Magnetic CTA ─────────────────────────── */}
      <CtaBanner isAr={isAr} locale={locale as Locale} />

      {/* ── 10. Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--mk-border)] bg-[#040711] px-6 py-12">
        <div className="mx-auto max-w-6xl flex flex-col items-center justify-between gap-6 text-xs text-slate-400 sm:flex-row">
          
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md">
              <Building2 className="size-4.5" />
            </div>
            <div>
              <span className="font-extrabold text-white text-sm block">
                {isAr ? "عقار بوكس (AqarBooks)" : "AqarBooks Finance OS"}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                © {new Date().getFullYear()} {isAr ? "جميع الحقوق محفوظة (مصر ودول الخليج)." : "All rights reserved (Egypt & GCC)."}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-semibold">
            <Link href="/contact" locale={locale as Locale} className="hover:text-blue-400 transition-colors">
              {isAr ? "تواصل معنا" : "Contact"}
            </Link>
            <Link href="/demo" locale={locale as Locale} className="hover:text-blue-400 transition-colors">
              {isAr ? "طلب عرض تجريبي" : "Request Demo"}
            </Link>
            <Link href="/login" locale={locale as Locale} className="hover:text-blue-400 transition-colors">
              {isAr ? "تسجيل الدخول" : "Sign In"}
            </Link>
          </div>

        </div>
      </footer>

    </div>
  );
}
