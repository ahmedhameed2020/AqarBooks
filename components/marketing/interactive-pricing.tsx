"use client";

import { useState } from "react";
import { Check, Sparkles, Zap, Shield, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export function InteractivePricing({ isAr, locale }: { isAr: boolean; locale: Locale }) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const PLANS = [
    {
      key: "STARTER",
      nameAr: "الباقة الأساسية",
      nameEn: "Starter",
      subAr: "عقار واحد / برج سكني / اتحاد ملاك",
      subEn: "Single Tower, Building or HOA",
      descAr: "مثالية للمباني المنفصلة واتحادات الشاغلين التي تبحث عن نظام مالي بسيط ومنضبط.",
      descEn: "Ideal for standalone buildings and individual HOAs looking for calm, balanced bookkeeping.",
      priceMonthly: isAr ? "٥٩٠ ر.س" : "$159",
      priceYearly: isAr ? "٤٧٠ ر.س" : "$129",
      featuresAr: [
        "إدارة حتى 100 وحدة سكنية أو تجارية",
        "دليل حسابات مخصص للعقار واتحاد الملاك",
        "إصدار مطالبات الصيانة وسندات التحصيل الرقمية",
        "جلسات الكاشير وتسوية الصناديق اليومية",
        "تقارير الإيرادات والمصروفات ومديونيات الملاك",
        "دعم العملات المحلية (EGP / SAR / AED)",
      ],
      featuresEn: [
        "Up to 100 residential or commercial units",
        "Dedicated Chart of Accounts for Property/HOA",
        "Digital maintenance dues and collection vouchers",
        "Single-session cashbox and daily reconciliations",
        "Revenue, expense and owner aging reports",
        "Local currencies support (EGP / SAR / AED)",
      ],
      highlighted: false,
      badge: null,
    },
    {
      key: "PROFESSIONAL",
      nameAr: "باقة إدارة العقارات والمنتجعات",
      nameEn: "Professional",
      subAr: "للشركات العقارية والمحافظ المتعددة",
      subEn: "Multi-Towers, Resorts & Real Estate Portfolios",
      descAr: "الحل الأمثل لإدارة عدة أبراج، قرى ساحلية، ومراكز تجارية مع إقرارات الضرائب الكاملة.",
      descEn: "The ultimate solution for operators managing multi-towers, resorts, and commercial malls.",
      priceMonthly: isAr ? "١,٢٩٠ ر.س" : "$349",
      priceYearly: isAr ? "٩٩٠ ر.س" : "$279",
      featuresAr: [
        "إدارة حتى 1,000 وحدة عبر عدة كيانات",
        "محرك الضرائب الإقليمي (VAT 14%/15% / WHT / ZATCA)",
        "تتبع دورة حياة الشيكات والمقاصة البنكية",
        "اعتمادات الموردين ومصروفات الصيانة التشغيلية",
        "ميزان مراجعة، ميزانية عمومية، وقائمة دخل لحظية",
        "دعم الفلل والوحدات متعددة الملاك والمحلات",
        "ترحيل ذري مع سجل تدقيق غير قابل للتعديل",
      ],
      featuresEn: [
        "Up to 1,000 units across multi-entities",
        "Regional Tax Engine (VAT 14%/15% / WHT / ZATCA)",
        "Cheque lifecycle and bank clearing workflows",
        "Vendor invoice approvals and OPEX tracking",
        "Real-time Trial Balance, Balance Sheet and P&L",
        "Multi-owner villa and commercial store support",
        "Atomic DB posting with immutable audit log",
      ],
      highlighted: true,
      badge: isAr ? "الأكثر اختياراً للشركات" : "Most Popular",
    },
    {
      key: "ENTERPRISE",
      nameAr: "باقة المجموعات والعلامة الخاصة",
      nameEn: "Enterprise & White-Label",
      subAr: "للمطورين العقاريين وصناديق الاستثمار",
      subEn: "Developers & Investment Holdings",
      descAr: "بنية مخصصة بالكامل للشركات القابضة الكبرى مع ربط برمجي API وقواعد بيانات مستقلة.",
      descEn: "Fully bespoke infrastructure with custom branding, direct API hooks, and dedicated DBs.",
      priceMonthly: isAr ? "حسب الاحتياج" : "Custom",
      priceYearly: isAr ? "حسب الاحتياج" : "Custom",
      featuresAr: [
        "وحدات، كيانات، ومستخدمين غير محدودين",
        "تخصيص كامل للهوية البصرية (White-Label)",
        "ربط برمجي كامل عبر REST API / Webhooks",
        "خوادم وقواعد بيانات مخصصة أو داخلية (On-Prem)",
        "مدير حساب مالي مخصص ودعم على مدار الساعة 24/7",
        "اتفاقية مستوى خدمة مخصصة (Enterprise SLA)",
      ],
      featuresEn: [
        "Unlimited units, entities and team seats",
        "Complete custom branding (White-Label)",
        "Direct REST API & Webhook integrations",
        "Dedicated or On-Premise isolated DB options",
        "Dedicated financial account manager & 24/7 support",
        "Enterprise-grade customized SLA",
      ],
      highlighted: false,
      badge: null,
    },
  ];

  return (
    <section id="pricing" className="relative py-28 px-6 border-t border-[var(--mk-border)] bg-[#070c1e] overflow-hidden">
      
      <div className="mx-auto max-w-6xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white">
            {isAr ? "باقات شفافة تناسب حجم نشاطك" : "Transparent Plans for Every Scale"}
          </h2>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto font-normal">
            {isAr
              ? "ابدأ بتجربة مجانية، واختر الباقة التي تلبي احتياجات مبانيك ومحافظك العقارية بكل مرونة."
              : "Start with a live demo and choose the tier that fits your portfolio scale effortlessly."}
          </p>

          {/* Billing Cycle Toggle Switch */}
          <div className="pt-4 flex items-center justify-center gap-3">
            <div className="inline-flex items-center p-1 rounded-2xl bg-slate-900 border border-white/10 shadow-lg">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  billingCycle === "monthly"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {isAr ? "الدفع الشهري" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("yearly")}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === "yearly"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <span>{isAr ? "الاشتراك السنوي" : "Annual"}</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-400/30">
                  {isAr ? "وفر 20%" : "Save 20%"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch pt-4">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-3xl p-7 sm:p-9 flex flex-col justify-between transition-all relative ${
                plan.highlighted
                  ? "border-2 border-blue-500/80 bg-gradient-to-b from-blue-950/40 via-slate-900/90 to-slate-900/90 shadow-[0_0_50px_-10px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/30 lg:-translate-y-2"
                  : "border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl hover:border-white/20"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3.5 start-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-lg shadow-blue-600/40">
                    <Sparkles className="size-3" />
                    <span>{plan.badge}</span>
                  </span>
                </div>
              )}

              <div>
                <div className="space-y-2 pb-6 border-b border-white/10">
                  <h3 className="text-xl font-black text-white">{isAr ? plan.nameAr : plan.nameEn}</h3>
                  <p className="text-xs font-bold text-blue-400">{isAr ? plan.subAr : plan.subEn}</p>
                  <p className="text-xs text-slate-400 leading-relaxed font-normal">{isAr ? plan.descAr : plan.descEn}</p>

                  <div className="pt-4 flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                      {billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly}
                    </span>
                    {plan.priceMonthly !== "حسب الاحتياج" && plan.priceMonthly !== "Custom" && (
                      <span className="text-xs text-slate-400 font-normal">
                        / {isAr ? "شهرياً" : "per month"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Features list */}
                <div className="py-6 space-y-3.5">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {isAr ? "المزايا المشمولة:" : "What's included:"}
                  </p>
                  {(isAr ? plan.featuresAr : plan.featuresEn).map((feat, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs text-slate-200">
                      <div className="size-4.5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                        <Check className="size-3" />
                      </div>
                      <span className="leading-snug">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <Link
                  href="/demo"
                  locale={locale}
                  className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-600/30 active:scale-95"
                      : "border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white hover:text-white"
                  }`}
                >
                  <span>{isAr ? "طلب استشارة وعرض توضيحي" : "Get Started / Request Demo"}</span>
                  <Arrow className="size-3.5" />
                </Link>
              </div>

            </div>
          ))}
        </div>

      </div>

    </section>
  );
}
