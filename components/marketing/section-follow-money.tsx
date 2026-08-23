import type { Locale } from "@/i18n/routing";
import { ArrowDown, ArrowRight, CheckCircle2, Receipt, FileText, BookOpen, BarChart3, ShieldCheck } from "lucide-react";

const MONEY_CHAIN_STEPS = [
  {
    step: "01",
    titleAr: "استحقاق الرسوم",
    titleEn: "Levy Assessment",
    id: "EVT-2026-08241",
    badgeAr: "استحقاق صيانة",
    badgeEn: "CAM Due",
    amount: "25,000 ج.م",
    descAr: "توليد استحقاق صيانة وإدارة دورية على وحدة B-214 بنسبة الحصة 1.42%.",
    descEn: "Periodic CAM fee assessed on Unit B-214 based on 1.42% pro-rata share.",
    icon: FileText,
  },
  {
    step: "02",
    titleAr: "إصدار سند التحصيل",
    titleEn: "Payment Receipt",
    id: "RC-2026-01842",
    badgeAr: "سند قبض معتمد",
    badgeEn: "Valid Receipt",
    amount: "28,500 ج.م",
    descAr: "تحصيل نقدي بالخزينة بقيمة 25,000 ج.م مضافاً إليها 3,500 ج.م ضريبة (14% VAT).",
    descEn: "Cash received for 25,000 EGP plus 3,500 EGP statutory 14% VAT.",
    icon: Receipt,
  },
  {
    step: "03",
    titleAr: "القيد المزدوج الآلي",
    titleEn: "Double-Entry JV",
    id: "JV-2026-00418",
    badgeAr: "قيد متوازن 100%",
    badgeEn: "Balanced JV",
    amount: "28,500 = 28,500",
    descAr: "ترحيل ذري: مدين الصندوق 28,500 / دائن الإيراد 25,000 ودائن الضريبة 3,500.",
    descEn: "Atomic post: Dr Cash 28,500 / Cr Revenue 25,000 & Cr Output VAT 3,500.",
    icon: ShieldCheck,
  },
  {
    step: "04",
    titleAr: "دفتر الأستاذ العام",
    titleEn: "General Ledger",
    id: "GL-10101 / GL-40101",
    badgeAr: "تغذية الحسابات",
    badgeEn: "GL Posting",
    amount: "+28,500 ج.م",
    descAr: "تحديث لحظي لحساب النقدية بالخزينة وحساب إيرادات النشاط بدون تدخل يدوي.",
    descEn: "Real-time updates to cashbook and revenue ledger accounts with zero manual re-entry.",
    icon: BookOpen,
  },
  {
    step: "05",
    titleAr: "ميزان المراجعة والتقارير",
    titleEn: "Trial Balance & Audit",
    id: "TB-2026-Q3",
    badgeAr: "قوائم مالية نهائية",
    badgeEn: "Financial Reports",
    amount: "ميزان متطابق",
    descAr: "انعكاس فوري على كشف حساب الوحدة، ميزان المراجعة، والإقرار الضريبي.",
    descEn: "Instant reflection on Unit Statement, Trial Balance, and Monthly VAT Return.",
    icon: BarChart3,
  },
] as const;

export function SectionFollowMoney({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="follow-money" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1A3C2E]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#1A3C2E]/10 text-[10px]">04</span>
            <span>{isAr ? "الرحلة المالية الكاملة" : "THE COMPLETE FINANCIAL JOURNEY"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "من أول جنيه مستحق. لحد آخر رقم في القوائم." : "From the very first pound due to the final figure in the reports."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "نفس المعاملة، ونفس الأثر المالي، تقدر تتبعه من الاستحقاق والتحصيل إلى القيد ودفتر الأستاذ والقوائم — مع الاحتفاظ بارتباطه بالعقار والوحدة والعميل طوال الرحلة."
              : "The exact same transaction and accounting impact, fully traceable from levy and collection to journal entry, general ledger, and financial statements — preserving property and member provenance all the way."}
          </p>

          {/* Transaction Flow Strip */}
          <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-xl bg-slate-100/90 p-2 border border-slate-200 text-xs font-bold text-slate-800">
            <span>{isAr ? "استحقاق" : "Levy"}</span>
            <span className="text-[#1A3C2E]">←</span>
            <span>{isAr ? "تحصيل" : "Collection"}</span>
            <span className="text-[#1A3C2E]">←</span>
            <span>{isAr ? "قيد" : "Journal"}</span>
            <span className="text-[#1A3C2E]">←</span>
            <span>{isAr ? "دفتر الأستاذ" : "General Ledger"}</span>
            <span className="text-[#1A3C2E]">←</span>
            <span>{isAr ? "القوائم" : "Statements"}</span>
          </div>
        </div>

        {/* The Visual Financial Chain */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          {MONEY_CHAIN_STEPS.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.step}
                className="relative rounded-2xl border border-slate-200/90 bg-[#FBFBFB] p-5 shadow-xs hover:border-[#1A3C2E]/40 hover:bg-white hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Step & Badge */}
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
                    <span className="font-mono text-xs font-black size-6 rounded-lg bg-[#1A3C2E] text-white flex items-center justify-center">
                      {item.step}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      {item.id}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="mt-4 flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#1A3C2E]/10 text-[#1A3C2E]">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="text-xs font-black text-slate-900 leading-snug">
                      {isAr ? item.titleAr : item.titleEn}
                    </h3>
                  </div>

                  {/* Amount Indicator */}
                  <div className="mt-3 rounded-xl bg-white p-2.5 border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 font-bold block">{isAr ? "القيمة المسجلة:" : "Recorded Value:"}</span>
                    <span className="text-sm font-black text-slate-950 font-mono tabular-nums mt-0.5 block">
                      {item.amount}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-[11px] text-slate-600 font-medium leading-relaxed">
                    {isAr ? item.descAr : item.descEn}
                  </p>
                </div>

                {/* Audit Check Footnote */}
                <div className="mt-4 pt-3 border-t border-slate-150 flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 className="size-3 text-emerald-600" />
                  <span>{isAr ? "مطابق وموثق" : "Verified & Linked"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
