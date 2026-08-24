import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, CheckCircle2, ShieldCheck, ArrowDown } from "lucide-react";
import { HeroDigitalTwin } from "./hero-digital-twin";

export function EditorialHero({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative overflow-hidden bg-white pt-10 pb-20 border-b border-slate-200/80">
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Top Trust Anchor */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-150/80 text-[11px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-800 font-extrabold">{isAr ? "نظام محاسبي متخصص" : "Specialized ERP"}</span>
            <span className="text-slate-300">/</span>
            <span>{isAr ? "إدارة الكيانات والمنتجعات واتحادات الملاك" : "Real Estate Entities & Resorts"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-slate-600 font-mono text-[10px]">
            <span>DOUBLE-ENTRY CORE</span>
            <span>•</span>
            <span>AUDITED LEDGER</span>
          </div>
        </div>

        {/* Editorial Headline & Proposition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-10 pb-12 items-end">
          <div className="lg:col-span-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-700/15 bg-sky-50/80 px-3.5 py-1 text-xs font-black text-sky-950 mb-6">
              <ShieldCheck className="size-3.5 text-[#07425d]" />
              <span>{isAr ? "محاسبة عقارية بقيد مزدوج" : "True Double-Entry Real Estate ERP"}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 font-heading leading-[1.18]">
              {isAr ? (
                <>
                  العقار مش إضافة للمحاسبة. <br className="hidden sm:inline" />
                  <span className="text-[#07425d]">هو جزء من القيد.</span>
                </>
              ) : (
                <>
                  Real estate isn’t an add-on. <br className="hidden sm:inline" />
                  <span className="text-[#07425d]">It’s part of the journal entry.</span>
                </>
              )}
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-2xl">
              {isAr
                ? "كل تحصيل أو مصروف أو استحقاق يحتفظ بسياقه الكامل — العقار، الوحدة، العميل والحساب — حتى القيد ودفتر الأستاذ. سجل مالي واحد، بلا فصل بين التشغيل والمحاسبة."
                : "Every collection, expense, or levy retains its complete context — property, unit, member, and account — all the way to the ledger."}
            </p>

            {/* Proof Points Strip */}
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-700">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "قيد مزدوج حقيقي" : "True Double-Entry"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "تتبع على مستوى الوحدة" : "Unit-Level Granularity"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "دفتر أستاذ موحّد" : "Unified General Ledger"}</span>
              </span>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3.5 lg:items-end">
            <Link
              href="/demo"
              locale={locale}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#07425d] px-7 py-3.5 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:scale-98"
            >
              <span>{isAr ? "استكشف النظام" : "Explore the Platform"}</span>
              <ArrowUpRight className="size-4" />
            </Link>

            <a
              href="#story"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-xs font-bold text-slate-800 transition-all hover:bg-slate-50 hover:border-slate-400"
            >
              <span>{isAr ? "شاهد كيف تتحول المعاملة إلى قيد" : "See How Transactions Become Journals"}</span>
              <ArrowDown className="size-3.5 text-slate-500" />
            </a>
          </div>
        </div>

        {/* COMBINED HERO VISUAL: Interactive Digital Twin + ERP Overlay */}
        <HeroDigitalTwin isAr={isAr} />
      </div>
    </section>
  );
}
