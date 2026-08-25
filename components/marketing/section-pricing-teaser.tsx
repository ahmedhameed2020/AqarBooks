import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  ArrowUpRight,
  CheckCircle2,
  Crown,
  Layers,
  ShieldCheck,
  Sparkles,
  Zap,
  SlidersHorizontal,
  TableProperties,
  Lock,
} from "lucide-react";
import {
  ESSENTIAL_ANNUAL_MONTHLY_EGP,
  ESSENTIAL_ANNUAL_TOTAL_EGP,
  ESSENTIAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_SAVING_EGP,
  PROFESSIONAL_ANNUAL_TOTAL_EGP,
  PROFESSIONAL_MONTHLY_EGP,
  formatEgp,
} from "./pricing/pricing-data";

export function SectionPricingTeaser({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  // Authoritative Formatted Values
  const essentialAnnualMonthlyStr = formatEgp(ESSENTIAL_ANNUAL_MONTHLY_EGP, locale);
  const essentialAnnualTotalStr = formatEgp(ESSENTIAL_ANNUAL_TOTAL_EGP, locale);
  const essentialMonthlyStr = formatEgp(ESSENTIAL_MONTHLY_EGP, locale);

  const professionalAnnualMonthlyStr = formatEgp(PROFESSIONAL_ANNUAL_MONTHLY_EGP, locale);
  const professionalAnnualTotalStr = formatEgp(PROFESSIONAL_ANNUAL_TOTAL_EGP, locale);
  const professionalMonthlyStr = formatEgp(PROFESSIONAL_MONTHLY_EGP, locale);
  const professionalSavingStr = formatEgp(PROFESSIONAL_ANNUAL_SAVING_EGP, locale);

  return (
    <section id="pricing-preview" className="relative bg-white py-24 border-b border-slate-200/80 overflow-hidden">
      {/* Background Architectural Grid Pattern */}
      <div 
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#07425d08_1px,transparent_1px),linear-gradient(to_bottom,#07425d08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" 
        aria-hidden="true" 
      />

      <div className="relative mx-auto max-w-7xl px-6">
        
        {/* Section Header (Value -> Scale -> Orientation) */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3.5 py-1 rounded-full border border-[#07425d]/20 mb-3.5">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">10</span>
            <span>{isAr ? "خطط تناسب حجم تشغيلك" : "BUILT FOR YOUR OPERATING SCALE"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 font-heading leading-tight tracking-tight">
            {isAr
              ? "اختر مستوى التشغيل المالي المناسب لكيانك العقاري"
              : "Choose the financial operating level that fits your organization."}
          </h2>

          <p className="mt-4 text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-2xl">
            {isAr
              ? "من إدارة كيان عقاري واحد إلى المحافظ متعددة الكيانات، تمنحك AqarBooks مستوى المحاسبة والرقابة والأتمتة المناسب لكل مرحلة."
              : "Start with the controls you need today, then scale entities, properties, teams and automation as your operation grows."}
          </p>

          {/* Trust Strip */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-700">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1">
              <CheckCircle2 className="size-3.5 text-[#059669]" />
              <span>{isAr ? "قيد مزدوج حقيقي لدفتر الأستاذ" : "True Double-Entry Core"}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1">
              <CheckCircle2 className="size-3.5 text-[#059669]" />
              <span>{isAr ? "أرصدة افتتاحية متطابقة قبل الانطلاق" : "Reconciled Opening Balances"}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1">
              <CheckCircle2 className="size-3.5 text-[#059669]" />
              <span>{isAr ? "ملكية تامة وتصدير فوري للبيانات" : "100% Data Ownership & Export"}</span>
            </div>
          </div>
        </div>


        {/* Three Pricing Preview Cards */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Card 1: Essential (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-[#F8FAFC]/90 p-7 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-all">
            <div>
              {/* Header */}
              <div className="pb-5 border-b border-slate-200/80">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  {isAr ? "للكيانات الفردية المركزة" : "Focused property operations"}
                </span>
                <h3 className="text-xl font-black text-slate-950 font-heading mt-1">
                  Essential
                </h3>
              </div>

              {/* Price */}
              <div className="py-5 border-b border-slate-200/80">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black font-mono tabular-nums text-slate-950">
                    {essentialAnnualMonthlyStr}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-600">
                    {isAr ? "ج.م / شهر" : "EGP / mo"}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-col gap-0.5">
                  <span className="text-xs font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 w-fit">
                    {isAr ? `تُدفع ${essentialAnnualTotalStr} ج.م سنوياً` : `EGP ${essentialAnnualTotalStr} billed annually`}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium mt-1">
                    {isAr ? `أو ${essentialMonthlyStr} ج.م بالدفع الشهري` : `or EGP ${essentialMonthlyStr} monthly`}
                  </span>
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <Layers className="size-3.5 text-[#07425d]" />
                  <span>{isAr ? "حتى 100 وحدة · 3 مستخدمين · كيان واحد" : "Up to 100 units · 3 users · Single entity"}</span>
                </div>
              </div>

              {/* Decisive Capabilities */}
              <div className="py-5">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase block mb-3">
                  {isAr ? "القدرات المحاسبية الأساسية:" : "Decisive Capabilities:"}
                </span>
                <ul className="space-y-2.5">
                  {[
                    isAr ? "قيد مزدوج حقيقي متوازن ذرياً" : "True atomic double-entry core",
                    isAr ? "إصدار المطالبات وسندات القبض المعتمدة" : "Standard dues billing & receipts",
                    isAr ? "سجلات أستاذ مساعدة للوحدات والملاك" : "Unit & member sub-ledgers",
                    isAr ? "صلاحيات المستخدمين وسجل المراجعة الأساسي" : "Role-based access & audit log",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-700 font-medium">
                      <CheckCircle2 className="size-4 text-[#07425d] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-5 border-t border-slate-200/80">
              <Link
                href="/contact?plan=essential"
                locale={locale}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3.5 text-xs sm:text-sm font-bold text-slate-900 transition-all hover:bg-slate-50 hover:border-slate-400 shadow-2xs active:scale-[0.99]"
              >
                <span>{isAr ? "ابدأ بالأساسيات" : "Start with Essential"}</span>
                <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
              </Link>
            </div>
          </div>


          {/* Card 2: Professional (Dominant Visual Anchor - 4 cols) */}
          <div className="lg:col-span-4 rounded-3xl p-1.5 sm:p-2 bg-[#07425d]/10 border-2 border-[#07425d] shadow-xl flex flex-col justify-between relative">
            
            {/* Top Badge */}
            <div className="absolute -top-3.5 inset-x-0 flex justify-center items-center gap-2 px-4 pointer-events-none">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#07425d] px-3.5 py-1 text-[11px] font-black text-white shadow-md">
                <Crown className="size-3 text-amber-300" />
                <span>{isAr ? "برنامج المؤسسين" : "Founding Customer Program"}</span>
              </span>
            </div>

            <div className="rounded-[calc(1.5rem-0.375rem)] bg-white p-6 sm:p-7 flex-1 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="pt-2 pb-5 border-b border-slate-100">
                  <span className="text-[11px] font-mono font-bold text-[#07425d] uppercase tracking-wider block">
                    {isAr ? "المنظومة القياسية للكمبوندات والأبراج" : "Compounds, towers & multi-building"}
                  </span>
                  <h3 className="text-2xl font-black text-slate-950 font-heading mt-1">
                    Professional
                  </h3>
                </div>

                {/* Price */}
                <div className="py-5 border-b border-slate-100">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-[#07425d]">
                      {professionalAnnualMonthlyStr}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-600">
                      {isAr ? "ج.م / شهر" : "EGP / mo"}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-300 w-fit">
                      {isAr ? `تُدفع ${professionalAnnualTotalStr} ج.م سنوياً (وفّر ${professionalSavingStr} ج.م)` : `EGP ${professionalAnnualTotalStr} billed annually (Save EGP ${professionalSavingStr})`}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium mt-1">
                      {isAr ? `أو ${professionalMonthlyStr} ج.م بالدفع الشهري` : `or EGP ${professionalMonthlyStr} monthly`}
                    </span>
                  </div>

                  <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-lg border border-[#07425d]/20">
                    <ShieldCheck className="size-3.5 text-[#07425d]" />
                    <span>{isAr ? "حتى 500 وحدة · 10 مستخدمين · متعدد الكيانات" : "Up to 500 units · 10 users · Multi-entity"}</span>
                  </div>
                </div>

                {/* Decisive Capabilities */}
                <div className="py-5">
                  <span className="text-xs font-mono font-bold text-[#07425d] uppercase block mb-3">
                    {isAr ? "قدرات الحوكمة وفصل الحسابات:" : "Governance & Multi-Fund Capabilities:"}
                  </span>
                  <ul className="space-y-2.5">
                    {[
                      isAr ? "فصل ودائع الصيانة والاحتياطي الرأسمالي (CAM)" : "CAM operating vs sinking fund splits",
                      isAr ? "اعتماد مالي ثنائي وفصل الصلاحيات (Maker-Checker)" : "Maker-Checker approval governance",
                      isAr ? "مطابقة بنكية ذكية واستيراد كشوف الحسابات" : "Smart bank statement reconciliation",
                      isAr ? "بنية مهيأة لمتطلبات الفاتورة الإلكترونية (ETA / ZATCA)" : "Architecture ready for ETA / ZATCA workflows",
                      isAr ? "ذكاء اصطناعي لقراءة الفواتير (OCR) واقتراح القيود" : "AI supplier invoice OCR & journal drafting",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-800 font-semibold">
                        <CheckCircle2 className="size-4 text-[#059669] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* CTA */}
              <div className="pt-5 border-t border-slate-100">
                <Link
                  href="/contact?plan=professional&program=founding"
                  locale={locale}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#07425d] px-5 py-4 text-xs sm:text-sm font-black text-white transition-all hover:bg-[#06354a] shadow-md active:scale-[0.99]"
                >
                  <span>{isAr ? "انضم إلى برنامج المؤسسين ↗" : "Join the Founding Program ↗"}</span>
                  <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
                </Link>
              </div>
            </div>
          </div>


          {/* Card 3: Enterprise (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-[#F8FAFC]/90 p-7 sm:p-8 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-all">
            <div>
              {/* Header */}
              <div className="pb-5 border-b border-slate-200/80">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  {isAr ? "للمحافظ والمنتجعات الكبرى" : "Portfolios & holding groups"}
                </span>
                <h3 className="text-xl font-black text-slate-950 font-heading mt-1">
                  Enterprise
                </h3>
              </div>

              {/* Price */}
              <div className="py-5 border-b border-slate-200/80">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black font-heading text-slate-950">
                    {isAr ? "تسعير مخصص" : "Custom Quote"}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-col gap-0.5">
                  <span className="text-xs text-slate-600 font-medium">
                    {isAr ? "عقود تشغيل سنوية مصممة حسب حجم نشاطك" : "Tailored annual operating contract"}
                  </span>
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <Zap className="size-3.5 text-amber-600" />
                  <span>{isAr ? "نطاق تشغيل مخصص · مستخدمين بلا قيود" : "Custom operating scale · Custom users"}</span>
                </div>
              </div>

              {/* Decisive Capabilities */}
              <div className="py-5">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase block mb-3">
                  {isAr ? "قدرات المؤسسات والمجموعات:" : "Holding & Custom Capabilities:"}
                </span>
                <ul className="space-y-2.5">
                  {[
                    isAr ? "قوائم مالية مجمعة للمجموعة وتسويات بينية" : "Consolidated financials & intercompany clearing",
                    isAr ? "مراكز تكلفة مستقلة للمراحل والمباني" : "Isolated phase & project cost centers",
                    isAr ? "شجرة حسابات مخصصة بالكامل وربط API مفتوح" : "Custom chart of accounts & enterprise API",
                    isAr ? "مدير حسابات مخصص واتفاقية مستوى خدمة (SLA)" : "Dedicated account manager & enterprise SLA",
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs sm:text-[13px] text-slate-700 font-medium">
                      <CheckCircle2 className="size-4 text-[#07425d] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-5 border-t border-slate-200/80">
              <Link
                href="/contact?plan=enterprise"
                locale={locale}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3.5 text-xs sm:text-sm font-bold text-slate-900 transition-all hover:bg-slate-50 hover:border-slate-400 shadow-2xs active:scale-[0.99]"
              >
                <span>{isAr ? "تحدث مع فريق AqarBooks ↗" : "Talk to AqarBooks ↗"}</span>
                <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
              </Link>
            </div>
          </div>

        </div>


        {/* Conversion Bridge Bar (To Full Pricing & Scale Matcher) */}
        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50/90 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3 text-center sm:text-right rtl:sm:text-right ltr:sm:text-left">
            <div className="size-10 rounded-xl bg-[#07425d]/10 flex items-center justify-center text-[#07425d] shrink-0 hidden sm:flex">
              <TableProperties className="size-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-slate-900">
                {isAr
                  ? "تحتاج مقارنة تفصيلية دقيقة عبر 41 معياراً ومحركاً محاسبياً؟"
                  : "Need a comprehensive feature breakdown across all 41 accounting criteria?"}
              </p>
              <p className="text-[11px] text-slate-500 font-medium">
                {isAr
                  ? "تصفح مصفوفة الإدارات المالية الـ 8 أو استخدم حاسبة الباقات التفاعلية."
                  : "Explore the 8 financial domains matrix or match your operating structure."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 shrink-0">
            <Link
              href="/pricing#scale-matcher"
              locale={locale}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-2xs"
            >
              <SlidersHorizontal className="size-3.5 text-[#07425d]" />
              <span>{isAr ? "طابق هيكل أعمالك" : "Find Your Plan"}</span>
            </Link>

            <Link
              href="/pricing"
              locale={locale}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#07425d] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#06354a] transition-all"
            >
              <span>{isAr ? "جدول مقارنة الباقات الكامل ↗" : "Compare All Capabilities ↗"}</span>
              <ArrowUpRight className="size-3.5 rtl:rotate-[-90deg]" />
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
