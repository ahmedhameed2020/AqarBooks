import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { ArrowUpRight, CheckCircle2, ShieldCheck, PlayCircle } from "lucide-react";

export function SectionFinalCta({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative bg-white pt-24 pb-16 border-t border-slate-200/90 overflow-hidden">
      {/* Subtle Architectural Drafting Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-80 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        
        {/* Double-Bezel System-Grade Enclosure */}
        <div className="rounded-[2.5rem] p-2 sm:p-3 bg-[#07425d]/5 border border-[#07425d]/15 shadow-2xl max-w-4xl mx-auto">
          <div className="rounded-[calc(2.5rem-0.75rem)] bg-white p-8 sm:p-14 border border-slate-200/90 text-center">
            
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d] mb-6">
              <ShieldCheck className="size-3.5" />
              <span>{isAr ? "جاهز لترتيب حسابات ودفاتر عقارك؟" : "READY TO ORGANIZE YOUR PROPERTY BOOKS?"}</span>
            </div>

            {/* Headline */}
            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 font-heading leading-tight tracking-tight">
              {isAr ? "افتح الدفتر المالي الحقيقي لعقارك اليوم." : "Open the true financial ledger for your property today."}
            </h2>

            {/* Subtitle */}
            <p className="mt-4 text-base sm:text-lg text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
              {isAr
                ? "الوحدة، المالك، التحصيل، فواتير الصيانة، والقيد المالي — في منظومة واحدة تريحك وتضمن حق كل طرف."
                : "Units, owners, collections, vendor bills, and journal entries — in a single platform protecting every party's rights."}
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              
              {/* Primary Button-in-Button CTA */}
              <Link
                href="/demo"
                locale={locale}
                className="group relative inline-flex items-center gap-3 rounded-2xl bg-[#07425d] ps-6 pe-3 py-3 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:translate-y-px"
              >
                <span>{isAr ? "جرّب العرض الحي" : "Explore Live Demo"}</span>
                <span className="flex size-7 items-center justify-center rounded-xl bg-white/15 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5">
                  <ArrowUpRight className="size-4" />
                </span>
              </Link>

              {/* Secondary CTA */}
              <Link
                href="/#story"
                locale={locale}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-slate-50/80 px-6 py-3.5 text-sm font-bold text-slate-800 transition-all hover:bg-white hover:border-slate-400 active:translate-y-px"
              >
                <PlayCircle className="size-4 text-[#07425d]" />
                <span>{isAr ? "شاهد كيف يعمل النظام" : "See How It Works"}</span>
              </Link>
            </div>

            {/* Trust Strip */}
            <div className="mt-10 pt-6 border-t border-slate-200/80 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-700 font-mono font-bold">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                Double-entry accounting
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                Audit trail
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                Multi-entity
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                Arabic / English
              </span>
              <span className="text-slate-300 hidden sm:inline">·</span>
              <span className="inline-flex items-center gap-1.5 text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                <CheckCircle2 className="size-3.5 text-[#7e1898]" />
                AI governance
              </span>
            </div>

          </div>
        </div>

        {/* Clean Editorial Footer */}
        <MarketingFooter locale={locale} />
      </div>
    </section>
  );
}
