"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, Home, Landmark, Palmtree, Store, CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";

export function EntitiesShowcase({ isAr }: { isAr: boolean }) {
  const [activeTab, setActiveTab] = useState<number>(0);

  const ENTITIES = [
    {
      id: "resort",
      icon: Palmtree,
      badgeAr: "المنتجعات والقرى الساحلية",
      badgeEn: "Coastal Resorts & Communities",
      titleAr: "منتجع سياحي وقرى ساحلية",
      titleEn: "Tourist Resorts & Coastal Villages",
      descAr:
        "إدارة متكاملة للشاليهات، الفلل الفندقية، اشتراكات الشواطئ والمارينا، رسوم الصيانة الموسمية، وجلسات كاشير متعددة للمرافق الترفيهية مع تسوية فروق الإقفال آلياً.",
      descEn:
        "Full lifecycle management for chalets, resort villas, marina passes, seasonal maintenance dues, and multi-pos cashier sessions with atomic variance logging.",
      pointsAr: [
        "إدارة رسوم الصيانة الموسمية والسنوية",
        "جلسات كاشير لنقاط الشواطئ والخدمات",
        "توزيع إيرادات ومصروفات المرافق المشتركة",
      ],
      pointsEn: [
        "Seasonal & periodic maintenance billing",
        "Beach & amenity cashier session controls",
        "Shared facility cost & revenue allocation",
      ],
      tagAr: "شاليهات • مارينا • خدمات شاطئية",
      tagEn: "Chalets • Marina • Amenities",
    },
    {
      id: "tower",
      icon: Building2,
      badgeAr: "الأبراج والعمائر السكنية",
      badgeEn: "Residential Towers & High-Rises",
      titleAr: "عمارة / برج سكني متكامل",
      titleEn: "Residential Tower & Building",
      descAr:
        "هيكلة الوحدات السكنية حسب الطوابق، حساب نسبة كل وحدة في الأرض والخدمات المشتركة، صيانة المصاعد والمولدات، ومتابعة وديعة الصيانة دون خلط بالحسابات الجارية.",
      descEn:
        "Hierarchical unit structure per floor, pro-rata shared asset ratio calculation, elevator/generator reserves, and dedicated maintenance sinking funds.",
      pointsAr: [
        "توزيع حصص الأجزاء المشتركة بدقة",
        "حسابات مستقلة لوديعة الصيانة",
        "إصدار إشعارات المطالبة والتنبيه بالدفع",
      ],
      pointsEn: [
        "Pro-rata common area ratio allocation",
        "Isolated maintenance deposit sinking fund",
        "Automated digital payment due notices",
      ],
      tagAr: "طوابق • شقق • مصاعد • وديعة صيانة",
      tagEn: "Floors • Apartments • Sinking Fund",
    },
    {
      id: "villa",
      icon: Home,
      badgeAr: "الوحدات والفلل المستقلة",
      badgeEn: "Villas & Independent Units",
      titleAr: "وحدة سكنية / فيلا خاصة",
      titleEn: "Standalone Villa & Private Unit",
      descAr:
        "ربط ملكية متعدد للوحدة الواحدة مع نسب مئوية محددة، تتبع جداول الأقساط، كشف حساب مالك تفصيلي، والتحصيل بتخصيص جزئي أو متعدد المستحقات في سند واحد.",
      descEn:
        "Multi-owner unit linking with custom ownership percentages, installment schedule tracking, detailed owner ledger statement, and multi-due allocation receipts.",
      pointsAr: [
        "ربط أكثر من مالك بنفس الوحدة بنسب دقيقة",
        "سندات قبض مخصصة لكل مستحق ومصاريفه",
        "كشف حساب تاريخي كامل لكل مالك",
      ],
      pointsEn: [
        "Multi-owner fractional link with defined %",
        "Receipt voucher with multi-due allocation",
        "Audit-ready historical owner statement",
      ],
      tagAr: "ملكية متعددة • أقساط • كشوف حساب",
      tagEn: "Multi-Owner • Installments • Statements",
    },
    {
      id: "commercial",
      icon: Store,
      badgeAr: "المحلات والمراكز التجارية",
      badgeEn: "Commercial Retail & Malls",
      titleAr: "محل ووحدة تجارية استثمارية",
      titleEn: "Commercial Retail & Mall Units",
      descAr:
        "إدارة عقود الإيجار والتشغيل التجاري، احتساب ضريبة القيمة المضافة VAT 14% آلياً، وخصم وتحصيل الضريبة من المنبع WHT، وربط القيود بدليل الحسابات مباشرة.",
      descEn:
        "Commercial lease contract tracking, automated VAT 14% and Withholding Tax (WHT) calculations, and direct ledger integration for retail operating expenses.",
      pointsAr: [
        "مطابقة تلقائية لضريبة القيمة المضافة 14%",
        "حساب وتوثيق ضرائب الخصم والتحصيل WHT",
        "فواتير تشغيلية للمراكز التجارية والمولات",
      ],
      pointsEn: [
        "Automated Egyptian VAT 14% compliance",
        "Withholding tax (WHT) ledger splits",
        "Commercial plaza operational billing",
      ],
      tagAr: "عقود إيجار • ضريبة VAT 14% • ضريبة WHT",
      tagEn: "Lease Contracts • VAT 14% • WHT Tax",
    },
    {
      id: "hoa",
      icon: Landmark,
      badgeAr: "اتحادات الملاك والشاغلين",
      badgeEn: "HOA & Owners Associations",
      titleAr: "اتحاد ملاك / اتحاد شاغلين",
      titleEn: "Community HOA & Owners Association",
      descAr:
        "نظام مالي وقانوني لإدارة ميزانية اتحاد الملاك المعتمدة، تحصيل اشتراكات الخدمات الشهرية والسنوية، صرف فواتير الحراسة والنظافة، وتوليد تقارير الجمعية العمومية بدقة متناهية.",
      descEn:
        "Financial & governance engine for approved HOA budgets, recurring member dues collection, security/cleaning disbursements, and AGM financial audit reporting.",
      pointsAr: [
        "إدارة موازنة الاتحاد المعتمدة من الجمعية العمومية",
        "توزيع مصاريف الحراسة والصيانة والإنارة بنسبة الحصص",
        "تقارير مالية جاهزة لاجتماعات الجمعية العمومية",
      ],
      pointsEn: [
        "AGM-approved community annual budget tracking",
        "Proportional utility & security cost distribution",
        "Ready-to-present audited financial statements",
      ],
      tagAr: "جمعية عمومية • اشتراكات • مصاريف مشتركة",
      tagEn: "AGM Reports • Member Dues • Common Costs",
    },
  ];

  const current = ENTITIES[activeTab];

  return (
    <section id="entities" className="relative py-24 px-6 overflow-hidden bg-[#060a18]">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-purple-950/20 rounded-full blur-[140px] pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/40 px-4 py-1.5 text-xs font-bold text-purple-300 mb-4 shadow-[0_0_20px_-4px_rgba(139,92,246,0.5)]">
            <ShieldCheck className="size-3.5 text-purple-400" />
            <span>{isAr ? "المرونة الهيكلية لأسواق مصر والخليج" : "Egypt & GCC Real Estate Models"}</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {isAr ? (
              <>
                نظام واحد يدير <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-400">الكيانات العقارية الخمسة</span> بكفاءة
              </>
            ) : (
              <>
                One Engine Powering <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-400">All 5 Real Estate Entities</span>
              </>
            )}
          </h2>
          <p className="mt-4 text-base text-slate-400 leading-relaxed font-normal">
            {isAr
              ? "على عكس البرامج المحدودة بنوع عقار واحد، صُمم عقار بوكس بدليل حسابات مرن يخدم القرى السياحية (الساحل والبحر الأحمر)، الأبراج السكنية والتجارية (دبي، الرياض، القاهرة)، الفلل، واتحادات الملاك وملاك الشاغلين."
              : "Unlike single-purpose tools, AqarBooks provides native accounting architecture tuned for coastal resorts, residential towers, private villas, commercial retail plazas, and HOAs across Egypt & GCC."}
          </p>
        </div>

        {/* Visual Architectural Composite Render */}
        <div className="mb-10 overflow-hidden rounded-2xl border border-[var(--mk-border-strong)] bg-[#070c1e] shadow-2xl relative group">
          <div className="relative aspect-[21/9] w-full min-h-[260px] sm:min-h-[380px]">
            <Image
              src="/images/aqarbooks-entities.jpg"
              alt="AqarBooks 5 Entity Types Architecture"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060a18] via-transparent to-transparent opacity-90" />
            <div className="absolute bottom-4 start-6 end-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-[#060a18]/90 backdrop-blur-md px-4 py-2 border border-purple-500/40 text-xs font-bold text-purple-200 shadow-xl">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>{isAr ? "دليل حسابات شجري مخصص لكل نوع كيان عقاري" : "Custom Chart of Accounts for Each Entity Type"}</span>
              </div>
              <span className="text-xs text-slate-400 hidden md:inline font-mono font-medium">
                {isAr ? "دعم العملات: EGP • SAR • AED • USD" : "Currencies: EGP • SAR • AED • USD"}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Entity Selector Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
          {ENTITIES.map((ent, idx) => {
            const Icon = ent.icon;
            const isSelected = activeTab === idx;
            return (
              <button
                key={ent.id}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`flex flex-col items-start gap-2.5 p-4 rounded-xl border text-start transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-purple-500/80 bg-gradient-to-b from-purple-950/70 to-[var(--mk-surface)] shadow-[0_0_30px_-5px_rgba(139,92,246,0.4)] ring-1 ring-purple-500/50"
                    : "border-[var(--mk-border)] bg-[var(--mk-surface)]/70 hover:border-purple-500/40 hover:bg-[var(--mk-surface)]"
                }`}
              >
                <div
                  className={`size-9 rounded-lg flex items-center justify-center transition-colors ${
                    isSelected
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/50"
                      : "bg-[#0b1126] text-slate-400"
                  }`}
                >
                  <Icon className="size-4.5" />
                </div>
                <div>
                  <p className={`text-xs font-bold transition-colors ${isSelected ? "text-purple-200" : "text-white"}`}>
                    {isAr ? ent.titleAr.split("/")[0] : ent.titleEn.split("&")[0]}
                  </p>
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-normal">
                    {isAr ? ent.tagAr : ent.tagEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Entity Detailed Card */}
        <div className="glass-card rounded-2xl p-6 sm:p-8 border border-[var(--mk-border-strong)] bg-[var(--mk-surface)] shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-lg bg-purple-950/80 px-3 py-1 text-xs font-mono font-bold text-purple-300 border border-purple-500/40">
                <span>{isAr ? current.badgeAr : current.badgeEn}</span>
              </div>
              <h3 className="text-2xl font-extrabold text-white">
                {isAr ? current.titleAr : current.titleEn}
              </h3>
              <p className="text-sm leading-relaxed text-slate-300 font-normal">
                {isAr ? current.descAr : current.descEn}
              </p>

              <div className="pt-2 space-y-2.5">
                {(isAr ? current.pointsAr : current.pointsEn).map((pt, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-slate-200 font-medium">
                    <CheckCircle2 className="size-4.5 text-purple-400 shrink-0" />
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 rounded-xl border border-[var(--mk-border)] bg-[#070c1e]/90 p-5 space-y-4 font-mono text-xs shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-sans">
                  {isAr ? "دليل الحسابات المرتبط:" : "Mapped GL Accounts:"}
                </span>
                <span className="text-purple-300 font-extrabold text-sm">1000 - 5999</span>
              </div>
              <div className="space-y-2.5 font-mono">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-sans">{isAr ? "قواعد العزل (Multi-Tenant):" : "Tenant Isolation:"}</span>
                  <span className="text-emerald-400 font-bold">PostgreSQL RLS (100%)</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-sans">{isAr ? "طريقة الترحيل (Posting):" : "Posting Mode:"}</span>
                  <span className="text-blue-400 font-bold">Atomic Transaction</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-sans">{isAr ? "آلية التعديل والتصحيح:" : "Correction Policy:"}</span>
                  <span className="text-purple-300 font-bold">{isAr ? "عكس القيد (Reversal)" : "Reversal Only"}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400 font-sans">{isAr ? "التوافق الضريبي الإقليمي:" : "Regional Tax:"}</span>
                  <span className="text-emerald-300 font-bold">VAT (EG/KSA) • ZATCA</span>
                </div>
              </div>
              <div className="rounded-lg bg-[#0b1126] p-3.5 border border-purple-500/30 text-[11px] text-slate-300 leading-relaxed font-sans shadow-inner">
                {isAr
                  ? "✓ جاهز فوراً للربط مع الضرائب المصرية (VAT / WHT) وهيئة الزكاة والضريبة والجمارك (ZATCA) وإصدار السندات المعتمدة."
                  : "✓ Pre-configured for Egyptian Tax (VAT/WHT) and Saudi ZATCA e-invoicing standards."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
