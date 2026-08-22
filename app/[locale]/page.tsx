import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MarketingNav } from "./marketing-nav";
import { FlowLinesBackground } from "@/components/marketing/flow-lines-background";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { LiveLedgerTicker } from "@/components/marketing/live-ledger-ticker";
import { EntitiesShowcase } from "@/components/marketing/entities-showcase";
import { AccountingEngineShowcase } from "@/components/marketing/accounting-engine-showcase";
import { LogoMark } from "@/components/marketing/logo-mark";
import { Reveal } from "@/components/marketing/reveal";
import {
  ShieldCheck,
  Building,
  Scale,
  Receipt,
  Users,
  Layers,
  Sparkles,
  Lock,
  History,
  Check,
  ArrowRight,
  Shield,
  FileCheck,
} from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === "ar";
  const title = isAr
    ? "عقار بوكس (AqarBooks): النظام المحاسبي المتكامل لإدارة العقارات والمنتجعات (مصر والخليج)"
    : "AqarBooks: Enterprise Real Estate & Resort Accounting ERP (Egypt & GCC)";
  const description = isAr
    ? "نظام محاسبي متكامل بقيد مزدوج حقيقي لإدارة القرى والمنتجعات السياحية، الأبراج السكنية، الفلل، المحلات التجارية، واتحادات الملاك. متوافق مع منظومة الضرائب المصرية (VAT/WHT) وهيئة الزكاة والضريبة والجمارك (ZATCA)."
    : "Enterprise double-entry accounting ERP for tourist resorts, residential towers, private villas, retail plazas, and HOAs. Compliant with Egyptian Tax & Saudi ZATCA e-invoicing.";

  const siteUrl = `https://aqarbooks.com/${locale}`;
  const ogImageUrl = "https://aqarbooks.com/images/aqarbooks-hero.jpg";

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
          alt: isAr ? "عقار بوكس — النظام المحاسبي المتكامل لإدارة العقارات" : "AqarBooks Real Estate Accounting ERP",
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

const MODULES = [
  {
    key: "accounting",
    icon: Scale,
    titleAr: "محرك محاسبة بقيد مزدوج حقيقي",
    titleEn: "True Double-Entry Accounting Engine",
    descAr: "دليل حسابات شجري هرمي، فترات مالية مقفلة، ترحيل ذري Atomic، وتصحيح القيود بالعكس المحاسبي الموثّق بدل التعديل المباشر.",
    descEn: "Hierarchical Chart of Accounts, closed fiscal periods, atomic DB posting, and audited reversals instead of direct edits.",
  },
  {
    key: "taxes",
    icon: Receipt,
    titleAr: "مطابقة الضرائب والفوترة الإلكترونية (VAT / ZATCA)",
    titleEn: "Regional Tax & e-Invoicing (VAT / ZATCA)",
    descAr: "حساب ضريبة القيمة المضافة (14% لمصر و 15% للخليج)، ضرائب الخصم والتحصيل WHT، والجاهزية التامة لمنظومة زاتكا ZATCA والفاتورة الإلكترونية.",
    descEn: "Automated VAT (14% Egypt / 15% GCC), Withholding Tax (WHT) deductions, and Saudi ZATCA Phase 2 integration readiness.",
  },
  {
    key: "units",
    icon: Building,
    titleAr: "الوحدات والملكية المتعددة والأقساط",
    titleEn: "Units, Multi-Owner Linking & Dues",
    descAr: "ربط ملكية أكثر من مالك بنفس الوحدة، إصدار جداول الأقساط ورسوم الصيانة الدورية، وسندات تحصيل بتخصيص جزئي أو متعدد.",
    descEn: "Multi-owner fractional linking, maintenance dues schedules, and payment vouchers with multi-due allocation.",
  },
  {
    key: "treasury",
    icon: Layers,
    titleAr: "الخزينة والكاشير وتسوية الفروق",
    titleEn: "Treasury, Cashier & Variance Audit",
    descAr: "جلسات كاشير منضبطة بصندوق واحد مفتوح في المرة، وتسجيل فروق الإقفال النقدية بحساب مستقل للتدقيق الإداري.",
    descEn: "Single-session cashbox controls, opening float verification, and automatic closing variance ledger posting.",
  },
  {
    key: "banking",
    icon: History,
    titleAr: "البنوك ودورة حياة الشيكات والعملات",
    titleEn: "Banking, Multi-Currency & Cheques",
    descAr: "تتبع موثق للشيكات من الاستلام حتى المقاصة أو الارتداد، مع دعم المعاملات المتعددة العملات (EGP, SAR, AED, USD).",
    descEn: "Complete audited cheque custody tracking and multi-currency transaction support (EGP, SAR, AED, USD).",
  },
  {
    key: "hoa",
    icon: Users,
    titleAr: "موازنات اتحادات وجمعيات الملاك (HOA / ملاك)",
    titleEn: "HOA & Community Financials (Mollak)",
    descAr: "إدارة الموازنة المعتمدة، توزيع مصاريف الحراسة والصيانة المشتركة بنسبة الحصص العقارية، وتوليد تقارير الجمعية العمومية المعتمدة.",
    descEn: "AGM-approved budget management, pro-rata common expense sharing, and annual financial auditor packets.",
  },
] as const;

const SECURITY_PILLARS = [
  {
    titleAr: "عزل RLS تام بين العقارات والشركات",
    titleEn: "Database Row-Level Security (RLS)",
    descAr: "كل جدول مالي محمي بسياسات Row-Level Security مشددة من داخل PostgreSQL، وبيانات كل عقار أو اتحاد ملاك معزولة جذرياً.",
    descEn: "Every sensitive table enforces default-deny Row-Level Security inside PostgreSQL, guaranteeing strict tenant isolation.",
  },
  {
    titleAr: "عدم التعديل المباشر (Immutable Ledger)",
    titleEn: "Immutable Ledger & Audit Trail",
    descAr: "القيود وسندات القبض المرحّلة لا تملك أي صلاحية تعديل أو حذف في قاعدة البيانات؛ أي تصحيح يتم عبر قيد عكسي موثّق.",
    descEn: "Posted entries and payment vouchers have zero direct write/delete permissions. Corrections require documented reversals.",
  },
  {
    titleAr: "سجل تدقيق كامل لكل إجراء حساس",
    titleEn: "Full Action Auditing & Accountability",
    descAr: "ترحيل القيود، إقفال الصناديق، اعتماد فواتير الموردين، وتعديل الصلاحيات مسجلة بدقة مع هوية المستخدم، الـ IP، والطابع الزمني.",
    descEn: "Posting, cashier closing, invoice approvals, and role updates are permanently logged with user ID, IP, and timestamp.",
  },
] as const;

const PLANS = [
  {
    key: "STARTER",
    nameAr: "الباقة الأساسية (عقار / برج / اتحاد ملاك)",
    nameEn: "Starter (Single Property / Tower / HOA)",
    descAr: "مثالية لإدارة برج سكني، عمارة، أو اتحاد ملاك فردي في مصر أو الخليج.",
    descEn: "Designed for single towers, buildings, or standalone HOAs.",
    featuresAr: [
      "إدارة حتى 100 وحدة سكنية / تجارية",
      "دليل حسابات مخصص لاتحاد الملاك أو العقار",
      "إصدار مطالبات الصيانة وسندات التحصيل",
      "حساب جلسات الكاشير وتسوية الصندوق",
      "تقارير الإيرادات والمصروفات والمديونيات",
      "دعم العملات المحلية (EGP / SAR / AED)",
    ],
    featuresEn: [
      "Up to 100 residential/commercial units",
      "Dedicated Chart of Accounts for Property/HOA",
      "Maintenance dues & digital collection receipts",
      "Cashbox sessions & variance tracking",
      "Revenue, expense & member aging reports",
      "Local currencies support (EGP / SAR / AED)",
    ],
    highlighted: false,
  },
  {
    key: "PROFESSIONAL",
    nameAr: "باقة إدارة العقارات والمنتجعات",
    nameEn: "Professional (Resorts & Management)",
    descAr: "للشركات العقارية التي تدير عدة أبراج، قرى سياحية، ومراكز تجارية.",
    descEn: "For real estate operators managing multi-towers, resorts & plazas.",
    featuresAr: [
      "إدارة حتى 1,000 وحدة عبر عدة كيانات",
      "محرك الضرائب المصرية والخليجية (VAT / WHT / ZATCA)",
      "تتبع دورة حياة الشيكات والمقاصة البنكية",
      "إدارة مشتريات ومصروفات الموردين واعتماداتها",
      "ميزان مراجعة، ميزانية عمومية، وقائمة دخل لحظية",
      "دعم الفلل والمحلات والوحدات متعددة الملاك",
    ],
    featuresEn: [
      "Up to 1,000 units across multi-entities",
      "Egypt & GCC Tax Engine (VAT / WHT / ZATCA)",
      "Cheque lifecycle & bank clearance tracking",
      "Purchase orders & supplier expense workflows",
      "Real-time Trial Balance, Balance Sheet & P&L",
      "Multi-owner villa & commercial store support",
    ],
    highlighted: true,
  },
  {
    key: "ENTERPRISE",
    nameAr: "باقة المجموعات القابضة والعلامة الخاصة",
    nameEn: "Enterprise & White-Label",
    descAr: "للمطورين العقاريين الكبار ومجموعات الضيافة متعددة الفروع في الوطن العربي.",
    descEn: "For large real estate developers & hospitality conglomerates.",
    featuresAr: [
      "وحدات وكيانات ومستخدمين غير محدودين",
      "تخصيص كامل للهوية البصرية (White-Label)",
      "ربط برمجي كامل عبر REST API / Webhooks",
      "خوادم وقواعد بيانات مخصصة أو داخلية (On-Prem)",
      "اتفاقية مستوى خدمة مخصصة (SLA) ودعم فني خاص 24/7",
    ],
    featuresEn: [
      "Unlimited units, entities & team members",
      "Full custom branding (White-Label)",
      "Direct REST API & Webhook integrations",
      "Dedicated / Isolated DB hosting options",
      "Enterprise SLA & 24/7 dedicated support",
    ],
    highlighted: false,
  },
] as const;

const FAQ = [
  {
    qAr: "هل يدعم عقار بوكس (AqarBooks) متطلبات السوق المصري والسوق الخليجي؟",
    qEn: "Does AqarBooks support Egyptian and GCC market requirements?",
    aAr: "نعم، النظام مصمم خصيصاً للشركات العقارية في مصر ودول الخليج؛ فهو يدعم ضريبة القيمة المضافة 14% (مصر) و 15% (السعودية) و 5% (الإمارات)، وضرائب الخصم والتحصيل WHT، وجاهزية الفاتورة الإلكترونية وزاتكا ZATCA، مع دليل حسابات معرب ومطابق للمعايير المحاسبية المعتمدة.",
    aEn: "Yes. AqarBooks is natively tailored for Egypt and the GCC, supporting Egyptian 14% VAT & WHT, Saudi 15% VAT & ZATCA e-invoicing Phase 2, UAE 5% VAT, multi-currencies (EGP, SAR, AED, USD), and a localized Arabic Chart of Accounts.",
  },
  {
    qAr: "كيف يختلف عقار بوكس عن برامج إدارة العقارات التقليدية؟",
    qEn: "How does AqarBooks differ from traditional property management software?",
    aAr: "البرامج التقليدية غالبًا ما تكون مجرد جداول تسجيل إيجارات أو تحصيل سطحي. عقار بوكس مبني على محرك محاسبة عامة بقيد مزدوج حقيقي (Double-Entry GL)، ترحيل ذري Atomic، ويدعم الكيانات الخمسة (منتجعات سياحية، أبراج، فلل، محلات تجارية، اتحادات ملاك) في بنية واحدة متماسكة.",
    aEn: "Traditional software is often just a billing spreadsheet. AqarBooks is built on a full double-entry general ledger engine with atomic DB posting, audited reversals, and native support for all 5 property entity types.",
  },
  {
    qAr: "هل يمكن إدارة اتحاد شاغلين أو جمعية ملاك مع توزيع المصروفات بحسب الحصص؟",
    qEn: "Can it manage an HOA / Mollak association with pro-rata area expense distribution?",
    aAr: "نعم، يدعم النظام توزيع المصروفات المشتركة (حراسة، صيانة مصاعد، إنارة عامة) بحسب نسبة كل وحدة في ملكية الأرض والأجزاء المشتركة، مع إصدار مطالبات موثقة ومتابعة مديونيات الأعضاء.",
    aEn: "Yes. Common operational expenses are automatically apportioned based on each unit's official pro-rata ownership share, with audited statements.",
  },
  {
    qAr: "كيف يضمن النظام عدم التلاعب المالي وسرية الحسابات؟",
    qEn: "How does AqarBooks prevent financial tampering and protect tenant data?",
    aAr: "من خلال ركيزتين أساسيتين: الأولى هي عزل البيانات الصارم عبر تقنية Row-Level Security في PostgreSQL، والثانية هي عدم إمكانية تعديل أو حذف القيود المرحّلة إطلاقاً (أي تصحيح يتم عبر قيد عكسي موثّق مع سجل تدقيق غير قابل للحذف).",
    aEn: "Through two strict pillars: database-level Row-Level Security (RLS) for complete multi-tenant isolation, and an immutable ledger where posted entries cannot be edited. Corrections require logged reversing entries.",
  },
  {
    qAr: "هل النظام ثنائي اللغة (عربي بالكامل وإنجليزي)؟",
    qEn: "Is the platform fully bilingual (Arabic RTL and English LTR)?",
    aAr: "نعم، الواجهة كاملة، شجرة الحسابات، سندات القبض، والتقارير المالية مبنية من الأساس لتدعم اللغة العربية RTL والإنجليزية LTR بخطوط عصرية ومظهر احترافي فائق.",
    aEn: "Yes. The complete UI, Chart of Accounts, receipt vouchers, and financial statements are natively designed for Arabic (RTL) and English (LTR) with modern high-contrast typography.",
  },
] as const;

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
      ? "نظام عقار بوكس المحاسبي المتكامل لإدارة العقارات والمنتجعات واتحادات الملاك بقيد مزدوج حقيقي ومطابقة ضريبية لمصر والخليج."
      : "AqarBooks Enterprise Double-Entry Real Estate & Resort Accounting ERP for Egypt and GCC.",
  };

  return (
    <div className="marketing relative flex min-h-full flex-1 flex-col bg-[#060a18] text-[#f8fafc] selection:bg-blue-900 selection:text-cyan-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingNav locale={locale as Locale} />

      {/* Hero Section */}
      <section className="relative overflow-hidden px-6 pt-16 pb-24 text-center">
        {/* Animated Background Flow Lines & Luminous Laser Currents */}
        <FlowLinesBackground />

        <Reveal className="relative z-10 mx-auto max-w-4xl">
          {/* Top Trust Signal Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-[#0b1126]/90 px-4 py-1.5 text-xs text-cyan-200 shadow-[0_0_25px_-4px_rgba(59,130,246,0.6)] backdrop-blur-md transition-transform hover:scale-105">
            <span className="font-bold">
              {isAr
                ? "قيد مزدوج حقيقي • متوافق مع الضرائب المصرية (VAT/WHT) ومنظومة زاتكا (ZATCA)"
                : "Full Double-Entry Engine • Egyptian Tax (VAT/WHT) & Saudi ZATCA Ready"}
            </span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.2]">
            {isAr ? (
              <>
                نظام محاسبي متكامل لإدارة{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400">
                  الكيانات العقارية
                </span>
              </>
            ) : (
              <>
                Integrated Accounting for{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-400">
                  Every Real Estate Entity
                </span>
              </>
            )}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-slate-300 sm:text-lg leading-relaxed font-normal">
            {isAr
              ? "قيود اليومية، اتحادات الملاك، الأبراج، المنتجعات، والخزينة، كلهم في منصة مالية واحدة آمنة ومحصّنة ضد التعديل العشوائي."
              : "General ledger, HOA finances, towers, resorts, and cashbox sessions, unified in one secure, audit-proof ERP across Egypt & the GCC."}
          </p>

          {/* Dual CTAs */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              locale={locale as Locale}
              className="glow-btn-primary rounded-xl px-7 py-3.5 text-sm font-bold text-white transition-transform active:scale-95 shadow-lg shadow-blue-900/50"
            >
              {isAr ? "طلب عرض توضيحي حي" : "Request a Live Demo"}
            </Link>
            <a
              href="#entities"
              className="rounded-xl border border-slate-700/80 bg-[#0b1126]/90 px-6 py-3.5 text-sm font-bold text-slate-200 transition-all hover:border-blue-500/50 hover:bg-[#0f1733] hover:text-white"
            >
              {isAr ? "استكشف الكيانات المدعومة" : "Explore Entity Models"}
            </a>
          </div>
        </Reveal>

        {/* Ultra-realistic Visual Hero Asset Card */}
        <div className="mt-14">
          <HeroVisual isAr={isAr} />
        </div>
      </section>

      {/* Real-time Atomic Ledger Ticker */}
      <LiveLedgerTicker isAr={isAr} />

      {/* The 5 Real Estate Entities Showcase Section */}
      <EntitiesShowcase isAr={isAr} />

      {/* Accounting Engine & Egyptian Taxes Section */}
      <AccountingEngineShowcase isAr={isAr} />

      {/* Full Core Modules Grid */}
      <section id="features" className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#070c1e]">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/40 px-4 py-1 text-xs font-bold text-cyan-300 mb-4 shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]">
              <Layers className="size-3.5 text-cyan-400" />
              <span>{isAr ? "الموديولات الوظيفية" : "Functional ERP Modules"}</span>
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {isAr ? "كل ما تحتاجه الإدارة المالية للعقار" : "Complete Real Estate Financial Toolkit"}
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-normal">
              {isAr
                ? "بنية متماسكة تشمل القيود، التحصيل، الصناديق، الشيكات، وإقرارات الضرائب لمصر والخليج."
                : "A cohesive infrastructure covering journals, billing, cashboxes, cheques, and regional tax compliance."}
            </p>
          </Reveal>

          <Reveal className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.key}
                  className="glass-card rounded-2xl p-7 border border-slate-800 bg-[#0b1126]/80 hover:border-blue-500/50 transition-all group shadow-md hover:shadow-xl cursor-pointer"
                >
                  <div className="size-11 rounded-xl bg-gradient-to-tr from-blue-950 to-slate-900 border border-blue-500/40 flex items-center justify-center text-cyan-300 mb-4 transition-transform group-hover:scale-110 shadow-xs">
                    <Icon className="size-5.5" />
                  </div>
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {isAr ? m.titleAr : m.titleEn}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400 font-normal">
                    {isAr ? m.descAr : m.descEn}
                  </p>
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* Security, Immutability & Audit Trail Section */}
      <section id="security" className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#060a18]">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-3xl mb-14">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {isAr
                ? "مصمم للأموال الحقيقية: أمان مشدد وتدقيق غير قابل للتلاعب"
                : "Built for Real Capital: Maximum Security & Audit Immutability"}
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-normal">
              {isAr
                ? "لا مكان للأخطاء العشوائية أو حذف المعاملات المالية الحساسة."
                : "Zero tolerance for accidental overrides or unaudited write operations."}
            </p>
          </Reveal>

          <Reveal className="grid gap-6 lg:grid-cols-2">
            {/* Lead pillar: wide featured row, not another equal card */}
            <div className="lg:col-span-2 rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-950/50 to-[#0b1126] p-8 flex flex-col sm:flex-row items-start gap-6 shadow-md">
              <div className="size-14 shrink-0 rounded-2xl bg-blue-950 border border-blue-500/40 flex items-center justify-center text-cyan-300 shadow-xs">
                <ShieldCheck className="size-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? SECURITY_PILLARS[0].titleAr : SECURITY_PILLARS[0].titleEn}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400 font-normal max-w-2xl">
                  {isAr ? SECURITY_PILLARS[0].descAr : SECURITY_PILLARS[0].descEn}
                </p>
              </div>
            </div>

            {SECURITY_PILLARS.slice(1).map((p, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-800 bg-[#0b1126]/90 p-7 space-y-3.5 shadow-md transition-all hover:border-blue-500/40"
              >
                <div className="size-10 rounded-xl bg-blue-950/90 border border-blue-500/40 flex items-center justify-center text-cyan-300 shadow-xs">
                  <ShieldCheck className="size-5.5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {isAr ? p.titleAr : p.titleEn}
                </h3>
                <p className="text-xs leading-relaxed text-slate-400 font-normal">
                  {isAr ? p.descAr : p.descEn}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Pricing Plans */}
      <section id="pricing" className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#070c1e]">
        <div className="mx-auto max-w-6xl">
          <Reveal className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              {isAr ? "باقات واضحة تناسب حجم نشاطك العقاري" : "Plans Tailored to Your Property Portfolio"}
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-normal">
              {isAr
                ? "سواء كنت تدير برجاً سكنياً واحداً أو محفظة منتجعات ومراكز تجارية متعددة في مصر أو الخليج."
                : "Whether managing a single residential tower or a multi-resort commercial portfolio across the region."}
            </p>
          </Reveal>

          <Reveal className="grid gap-8 sm:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`rounded-2xl p-8 flex flex-col justify-between transition-all ${
                  plan.highlighted
                    ? "border-2 border-blue-500 bg-gradient-to-b from-blue-950/60 via-[#0b1126] to-[#0b1126] shadow-[0_0_40px_-5px_rgba(59,130,246,0.4)] relative ring-2 ring-blue-500/30"
                    : "border border-slate-800 bg-[#0b1126]/90 shadow-md"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3.5 start-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-1 text-[11px] font-extrabold text-white uppercase tracking-wider shadow-md">
                    {isAr ? "الأكثر طلباً" : "Most Popular"}
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-extrabold text-white">
                    {isAr ? plan.nameAr : plan.nameEn}
                  </h3>
                  <p className="mt-2 text-xs text-slate-400 font-normal leading-relaxed">
                    {isAr ? plan.descAr : plan.descEn}
                  </p>

                  <div className="my-6 border-t border-slate-800 pt-6 space-y-3.5">
                    {(isAr ? plan.featuresAr : plan.featuresEn).map((feat, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-slate-200 font-medium">
                        <Check className="size-4 text-cyan-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link
                  href="/demo"
                  locale={locale as Locale}
                  className={`mt-6 w-full py-3 rounded-xl text-center text-xs font-bold transition-all ${
                    plan.highlighted
                      ? "glow-btn-primary text-white shadow-lg"
                      : "border border-slate-700 bg-slate-900/90 text-slate-200 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {isAr ? "طلب استشارة وعرض توضيحي" : "Request a Demo"}
                </Link>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#060a18]">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center mb-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              {isAr ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
            </h2>
            <p className="mt-2 text-sm text-slate-400 font-normal">
              {isAr ? "إجابات مباشرة عن المحاسبة، الأمان، والتوافق الضريبي الإقليمي." : "Direct answers on accounting, security, and regional tax compliance."}
            </p>
          </Reveal>

          <Reveal className="space-y-4">
            {FAQ.map((item, idx) => (
              <details
                key={idx}
                className="group rounded-2xl border border-slate-800 bg-[#0b1126]/90 px-6 py-4.5 open:border-blue-500/50 open:bg-[#0f1733] transition-all shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-white">
                  <span>{isAr ? item.qAr : item.qEn}</span>
                  <span className="ms-4 text-cyan-400 transition-transform duration-200 group-open:rotate-45 font-mono text-lg font-bold">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-xs leading-relaxed text-slate-300 border-t border-slate-800/80 pt-3 font-normal">
                  {isAr ? item.aAr : item.aEn}
                </p>
              </details>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Final Conversion CTA */}
      <section className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-gradient-to-b from-[#070c1e] to-[#050814] text-center overflow-hidden">
        <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/20 rounded-full blur-[140px] pointer-events-none" />

        <Reveal className="relative z-10 mx-auto max-w-3xl space-y-6">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {isAr
              ? "جاهز لترقية الإدارة المالية لعقاراتك في مصر والخليج؟"
              : "Ready to Upgrade Your Real Estate Finances?"}
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto font-normal">
            {isAr
              ? "احصل على عرض توضيحي حي ومباشر للنظام المحاسبي مع إمكانية تجربة دليل الحسابات ودورة التحصيل على بيانات واقعية."
              : "Get a live interactive walkthrough of the accounting engine, tax calculations, and multi-entity workflows."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href="/demo"
              locale={locale as Locale}
              className="glow-btn-primary rounded-xl px-8 py-3.5 text-sm font-bold text-white transition-transform active:scale-95 shadow-xl shadow-blue-900/60"
            >
              {isAr ? "طلب عرض تجريبي مخصص" : "Request a Tailored Demo"}
            </Link>
            <Link
              href="/contact"
              locale={locale as Locale}
              className="rounded-xl border border-slate-700 bg-slate-900/90 px-6 py-3.5 text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white"
            >
              {isAr ? "تواصل مع المبيعات" : "Contact Sales"}
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--mk-border)] bg-[#040711] px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-slate-400 sm:flex-row">
          <div className="flex items-center gap-3">
            <LogoMark className="size-8.5" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-white">
                  {isAr ? "عقار بوكس" : "AqarBooks"}
                </span>
                <span className="inline-flex rounded-full bg-purple-500/15 text-purple-300 border border-purple-400/30 text-[9px] font-black px-1.5 py-0.2 shadow-2xs">
                  PRO
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap tracking-wide -mt-0.5">
                {isAr ? "نـظـام الـمـحـاسـبـة وإدارة الـعـقـارات" : "Real Estate Accounting & Management System"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6 font-bold">
            <Link href="/contact" locale={locale as Locale} className="hover:text-cyan-300 transition-colors">
              {isAr ? "تواصل معنا" : "Contact"}
            </Link>
            <Link href="/demo" locale={locale as Locale} className="hover:text-cyan-300 transition-colors">
              {isAr ? "طلب عرض تجريبي" : "Request a Demo"}
            </Link>
            <Link href="/login" locale={locale as Locale} className="hover:text-cyan-300 transition-colors">
              {isAr ? "تسجيل الدخول" : "Sign in"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
