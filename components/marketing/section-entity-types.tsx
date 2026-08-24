import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import { Building2, Building, Home, Store, Users, CheckCircle2 } from "lucide-react";

const ENTITY_STRUCTURES = [
  {
    num: "01",
    titleAr: "اتحادات وجمعيات الملاك (HOA / ملاك)",
    titleEn: "Owners Associations & HOAs",
    descAr: "موازنات سنوية معتمدة من الجمعية، وتوزيع مصاريف الحراسة والنظافة بنسب حصص الأرض، وتقارير تدقيق مالية موثقة للملاك.",
    descEn: "AGM-approved annual budgets, pro-rata common expense sharing by unit area, and certified financial auditor packets.",
    icon: Users,
    kpiAr: "موازنة معتمدة وحصص شائعة",
    kpiEn: "Pro-Rata Land Ownership Shares",
  },
  {
    num: "02",
    titleAr: "المجمعات والكمبوندات السكنية",
    titleEn: "Residential Compounds & Gated Communities",
    descAr: "إدارة تحصيلات الوحدات، ودائع الصيانة الرأسمالية (Sinking Funds)، ومتابعة مصروفات الزراعة والمسطحات والإنارة.",
    descEn: "Unit collections, sinking fund reserves, and common infrastructure maintenance cost centers.",
    icon: Home,
    kpiAr: "ودائع صيانة واحتياطي رأسمالي",
    kpiEn: "Sinking Funds & CAM Ledgers",
  },
  {
    num: "03",
    titleAr: "الأبراج السكنية والتجارية",
    titleEn: "Towers & High-Rise Buildings",
    descAr: "هيكل هرمي للأدوار والمباني، تتبع صيانة المصاعد والمضخات، وكشف حساب تفصيلي لكل وحدة مع إشعارات السداد.",
    descEn: "Vertical floor & unit hierarchies, elevator/chiller maintenance contracts, and detailed unit ledger statements.",
    icon: Building,
    kpiAr: "هيكل هرمي للأدوار والمرافق",
    kpiEn: "Vertical Floor & MEP Controls",
  },
  {
    num: "04",
    titleAr: "القرى والمنتجعات السياحية",
    titleEn: "Resorts & Hospitality Portfolios",
    descAr: "إدارة الفلل والشاليهات والكبائن، مصاريف التشغيل الموسمي، وفصل محاسبي مستقل لكل قرية أو مرحلة داخل المجموعة.",
    descEn: "Villas, chalets, seasonal operational cost centers, and isolated P&L ledgers per resort phase.",
    icon: Building2,
    kpiAr: "مراكز تكلفة وتشغيل مستقلة",
    kpiEn: "Isolated Phase & Resort P&L",
  },
  {
    num: "05",
    titleAr: "المراكز التجارية والمحلات (Retail)",
    titleEn: "Commercial Malls & Retail Plazas",
    descAr: "إدارة رسوم الخدمات المشتركة، احتساب الضرائب على الفواتير (14% VAT / WHT)، والربط المالي مع المستأجرين والشركاء.",
    descEn: "Commercial CAM dues, invoice tax calculation (VAT / WHT), and tenant financial reconciliation.",
    icon: Store,
    kpiAr: "فوترة ضريبية وخصم وتحصيل",
    kpiEn: "Invoice Tax & WHT Handling",
  },
] as const;

export function SectionEntityTypes({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="entities" className="relative bg-[#F8F9FA] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#07425d]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#07425d]/10 text-[10px]">09</span>
            <span>{isAr ? "بُني لهيكل عقارك" : "BUILT FOR YOUR PROPERTY STRUCTURE"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "من مبنى واحد. إلى محفظة كاملة." : "From a single building to a comprehensive portfolio."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "سواء كنت تدير اتحاد ملاك، برجًا سكنيًا أو مجموعة من العقارات، يتكيّف AqarBooks مع هيكل أعمالك — من الكيان إلى العقار والمبنى والوحدة — من غير ما تفصل الإدارة عن الحسابات."
              : "Whether managing an HOA, high-rise tower, or diversified real estate portfolio, AqarBooks adapts to your operational hierarchy without disconnecting management from accounting."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "اتحادات ملاك" : "HOAs"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "أبراج" : "Towers"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "مجمعات" : "Compounds"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "محافظ عقارية" : "Portfolios"}
            </span>
          </div>
        </div>

        {/* Big Planning Model Visual Header */}
        <div className="mt-12 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden">
          <div className="relative aspect-[16/7] sm:aspect-[21/8] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80">
            <Image
              src="/images/aqarbooks-entity-types.jpg"
              alt={isAr ? "مجسم الهياكل العقارية المعتمدة" : "Real Estate Structural Planning Study"}
              fill
              sizes="(max-width: 1280px) 100vw, 1200px"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
            <div className="absolute bottom-4 start-5 end-5 text-white flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">STRUCTURAL PLANNING MATRIX</span>
                <p className="text-base sm:text-lg font-black font-heading mt-0.5">
                  {isAr ? "هياكل محاسبية تفصيلية تناسب كل نمط عقاري" : "Tailored Financial Architectures for Real Estate"}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">
                MULTI-ENTITY / ISOLATED GL
              </span>
            </div>
          </div>

          {/* 5 Distinct Editorial Rows */}
          <div className="mt-8 divide-y divide-slate-150">
            {ENTITY_STRUCTURES.map((entity) => {
              const Icon = entity.icon;

              return (
                <div key={entity.num} className="py-5 first:pt-2 last:pb-2 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  <div className="lg:col-span-1 flex items-center gap-3">
                    <span className="font-mono text-sm font-black text-[#1A3C2E]">
                      {entity.num}
                    </span>
                    <div className="flex size-8 items-center justify-center rounded-xl bg-slate-100 text-[#1A3C2E] lg:hidden">
                      <Icon className="size-4" />
                    </div>
                  </div>

                  <div className="lg:col-span-4 flex items-center gap-3">
                    <div className="hidden lg:flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1A3C2E] border border-slate-200">
                      <Icon className="size-4.5" />
                    </div>
                    <h3 className="text-sm font-black text-slate-900">
                      {isAr ? entity.titleAr : entity.titleEn}
                    </h3>
                  </div>

                  <div className="lg:col-span-5 text-xs text-slate-600 font-medium leading-relaxed">
                    {isAr ? entity.descAr : entity.descEn}
                  </div>

                  <div className="lg:col-span-2 text-start lg:text-end">
                    <span className="inline-block text-[11px] font-bold text-[#1A3C2E] bg-[#1A3C2E]/5 px-2.5 py-1 rounded-lg border border-[#1A3C2E]/15">
                      {isAr ? entity.kpiAr : entity.kpiEn}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
