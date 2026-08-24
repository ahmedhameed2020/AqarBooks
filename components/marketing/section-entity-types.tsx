import type { Locale } from "@/i18n/routing";
import { Building2, Building, Home, Store, Users, CheckCircle2, ShieldCheck, Layers, Landmark } from "lucide-react";

interface EntityArchetype {
  num: string;
  titleAr: string;
  titleEn: string;
  categoryAr: string;
  categoryEn: string;
  descAr: string;
  descEn: string;
  fingerprint: string[];
  metrics: { labelAr: string; labelEn: string; val: string }[];
  icon: typeof Building2;
}

const ENTITY_FINGERPRINTS: EntityArchetype[] = [
  {
    num: "01",
    titleAr: "المجمعات والكمبوندات السكنية",
    titleEn: "Residential Compounds",
    categoryAr: "سكني مغلق",
    categoryEn: "Gated Residential",
    descAr: "إدارة متكاملة لنسب الإشغال، تحصيلات الوحدات الدورية، وودائع الصيانة الرأسمالية (Sinking Funds) المعزولة.",
    descEn: "Occupancy rates, periodic unit collections, and ring-fenced capital sinking reserve fund ledgers.",
    fingerprint: ["Occupancy Tracking", "CAM Sinking Fund", "Unit Collections", "Gate Pass Clearing"],
    metrics: [
      { labelAr: "معدل التحصيل", labelEn: "Collection Rate", val: "98.4%" },
      { labelAr: "رصيد الودائع", labelEn: "Sinking Reserve", val: "14.2M EGP" },
    ],
    icon: Home,
  },
  {
    num: "02",
    titleAr: "الأبراج السكنية والتجارية",
    titleEn: "Commercial Towers & High-Rises",
    categoryAr: "أبراج متعددة الأدوار",
    categoryEn: "Vertical Real Estate",
    descAr: "هيكل هرمي للأدوار والمساحات التأجيرية، إدارة عقود الإيجار، وتوزيع مصاريف المرافق والمصاعد والتكييف المركزي.",
    descEn: "Lease income schedules, vertical MEP cost centers, chiller utility splits, and ETA compliant corporate invoicing.",
    fingerprint: ["Lease Schedules", "Commercial CAM", "ETA E-Invoice", "Tenant Receivables"],
    metrics: [
      { labelAr: "إيراد الإيجار", labelEn: "Lease Income", val: "4.8M / Q" },
      { labelAr: "الأدوار والوحدات", labelEn: "Vertical Units", val: "42 Floors" },
    ],
    icon: Building,
  },
  {
    num: "03",
    titleAr: "القرى والمنتجعات السياحية",
    titleEn: "Resorts & Hospitality Portfolios",
    categoryAr: "منتجعات ساحلية وسياحية",
    categoryEn: "Hospitality & Leisure",
    descAr: "إدارة الفلل والشاليهات، فصول التشغيل الموسمي، وفصل محاسبي مستقل لكل مرحلة وقرية داخل الكيان الأم.",
    descEn: "Owners & chalets, shared seasonal operating expenses, and isolated P&L ledgers per phase or bay.",
    fingerprint: ["Seasonal Operations", "Phase-Level P&L", "Owner Accounts", "Utility Allocations"],
    metrics: [
      { labelAr: "المراحل النشطة", labelEn: "Active Phases", val: "04 Zones" },
      { labelAr: "كفاءة التشغيل", labelEn: "Op Efficiency", val: "94.8%" },
    ],
    icon: Building2,
  },
  {
    num: "04",
    titleAr: "اتحادات وجمعيات الملاك (HOA)",
    titleEn: "HOAs & Owners Associations",
    categoryAr: "حوكمة وإدارة مجتمعية",
    categoryEn: "Statutory Governance",
    descAr: "موازنات تقديرية معتمدة من الجمعية العمومية، توزيع المصاريف بنسب الحصص الشائعة، وتقارير تدقيق سنوية للملاك.",
    descEn: "AGM-approved statutory budgets, pro-rata share assessments, and certified financial audits for owners.",
    fingerprint: ["AGM Budgeting", "Pro-Rata Land Share", "Escrow Auditing", "Member Packets"],
    metrics: [
      { labelAr: "الموازنة المعتمدة", labelEn: "AGM Budget", val: "100% Balanced" },
      { labelAr: "سجل التدقيق", labelEn: "Audit Trail", val: "Zero Gap" },
    ],
    icon: Users,
  },
  {
    num: "05",
    titleAr: "المحافظ والكيانات المختلطة",
    titleEn: "Mixed-Use Portfolios & Holdings",
    categoryAr: "محافظ قابضة ومتعددة",
    categoryEn: "Multi-Entity Holdings",
    descAr: "ربط عدة كيانات عقارية وشركات إدارة تحت حساب موحد، مع قيود التسوية البينية والقوائم المالية المجمعة.",
    descEn: "Multiple entities, diversified real estate assets, intercompany transfers, and consolidated financials.",
    fingerprint: ["Multi-Entity Scope", "Intercompany Clear", "Consolidated P&L", "Portfolio Rollup"],
    metrics: [
      { labelAr: "الكيانات المدارة", labelEn: "Active Entities", val: "12 Assets" },
      { labelAr: "القوائم المجمعة", labelEn: "Consolidation", val: "Instant GL" },
    ],
    icon: Landmark,
  },
];

export function SectionEntityTypes({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="entities" className="relative bg-[#F8FAFC] py-24 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">09</span>
            <span>{isAr ? "البصمة المالية للكيانات العقارية" : "FINANCIAL ARCHETYPES & STRUCTURES"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "بُني لخصوصية هيكلك العقاري والمالي." : "Tailored to the financial fingerprint of your real estate entity."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "لا توجد عقارات متطابقة محاسبياً. يمنح AqarBooks كل نمط عقاري هيكلاً دفترياً مخصصاً يطابق طبيعة تدفقاته المالية والتزاماته القانونية."
              : "No two properties share the exact financial DNA. AqarBooks equips each entity archetype with tailored chart of accounts, budget controls, and audit models."}
          </p>
        </div>

        {/* 5 Distinct Financial Archetype Cards */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ENTITY_FINGERPRINTS.map((entity, idx) => {
            const Icon = entity.icon;
            const isWide = idx === 4; // Mixed-use card spans on larger screens if needed
            return (
              <div
                key={entity.num}
                className={`rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between ${
                  isWide ? "md:col-span-2 lg:col-span-1" : ""
                }`}
              >
                <div>
                  {/* Top Badge & Number */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-[#07425d]/10 text-[#07425d]">
                        <Icon className="size-4.5" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-500">
                        {isAr ? entity.categoryAr : entity.categoryEn}
                      </span>
                    </div>

                    <span className="font-mono text-xs font-black text-slate-400">
                      {entity.num}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-base font-black text-slate-950 font-heading mt-4">
                    {isAr ? entity.titleAr : entity.titleEn}
                  </h3>

                  {/* Description */}
                  <p className="mt-2 text-xs text-slate-600 font-medium leading-relaxed">
                    {isAr ? entity.descAr : entity.descEn}
                  </p>

                  {/* Financial Fingerprint Chips */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {entity.fingerprint.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700 border border-slate-200/60"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Tailored Metrics */}
                <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2 bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60">
                  {entity.metrics.map((m, mIdx) => (
                    <div key={mIdx} className="text-start">
                      <span className="text-[10px] font-mono text-slate-400 block font-bold">
                        {isAr ? m.labelAr : m.labelEn}
                      </span>
                      <span className="text-xs font-black text-[#07425d] font-mono tabular-nums">
                        {m.val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
