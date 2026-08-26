import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, ShieldCheck, ArrowDown, PlayCircle } from "lucide-react";
import { HeroDigitalTwin } from "./hero-digital-twin";

export function EditorialHero({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative overflow-hidden bg-white pt-8 pb-20 border-b border-slate-200/80">
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        
        {/* Top Trust Anchor */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-150/80 text-[11px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-800 font-extrabold">{isAr ? "نظام مالي متخصص للكيانات العقارية" : "Specialized Real Estate Financial ERP"}</span>
            <span className="text-slate-300">/</span>
            <span>{isAr ? "إدارة الكيانات والمنتجعات واتحادات الملاك" : "Compounds, Towers, Resorts & HOAs"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-slate-600 font-mono text-[10px]">
            <span>DOUBLE-ENTRY CORE</span>
            <span>•</span>
            <span>AUDITED LEDGER</span>
          </div>
        </div>

        {/* Editorial Headline & Proposition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8 pb-10 items-end">
          <div className="lg:col-span-8">
            
            {/* Eyebrow Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d] mb-4">
              <ShieldCheck className="size-3.5" />
              <span>{isAr ? "نظام مالي متخصص للكيانات العقارية" : "Specialized Financial ERP for Real Estate"}</span>
            </div>

            {/* Locked H1 */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 font-heading leading-[1.14]">
              {isAr ? "لكل عقار هوية مالية." : "Every Property Has a Financial Identity."}
            </h1>

            {/* Locked Supporting Copy */}
            <p className="mt-4 text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-2xl">
              {isAr
                ? "من الكيان والمبنى والوحدة إلى القيد والتحصيل والتقرير المالي — يحوّل AqarBooks هيكل العقار إلى منظومة محاسبية مترابطة وقابلة للتتبع."
                : "From entity, building, and unit to journal entry, collection, and financial statements — AqarBooks transforms physical property structures into an interlinked, fully traceable accounting system."}
            </p>
          </div>

          {/* Action Controls */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-col gap-3 lg:items-end">
            {/* Primary Button-in-Button CTA */}
            <Link
              href="/demo"
              locale={locale}
              className="group relative inline-flex w-full sm:w-auto items-center justify-between sm:justify-center gap-3 rounded-2xl bg-[#07425d] ps-6 pe-3 py-3 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:translate-y-px"
            >
              <span>{isAr ? "جرّب العرض الحي" : "Explore Live Demo"}</span>
              <span className="flex size-7 items-center justify-center rounded-xl bg-white/15 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5">
                <ArrowUpRight className="size-4" />
              </span>
            </Link>

            {/* Secondary CTA */}
            <a
              href="#story"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50/80 px-5 py-3 text-xs font-bold text-slate-800 transition-all hover:bg-white hover:border-slate-400 active:translate-y-px"
            >
              <PlayCircle className="size-4 text-[#07425d]" />
              <span>{isAr ? "كيف يعمل AqarBooks" : "How AqarBooks Works"}</span>
            </a>
          </div>
        </div>

        {/* Level A System Object: The Interactive Digital Twin */}
        <HeroDigitalTwin isAr={isAr} />
      </div>
    </section>
  );
}
