"use client";

import { useState } from "react";
import { Calculator, Clock, TrendingUp, DollarSign, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export function RoiCalculator({ isAr, locale }: { isAr: boolean; locale: Locale }) {
  const [unitCount, setUnitCount] = useState<number>(120);
  const [currency, setCurrency] = useState<"SAR" | "EGP" | "AED">("SAR");

  // Realistic estimates based on real estate management overhead:
  // Avg hours saved per unit/month: ~0.45 hrs (invoicing, collection, owner statements, reconciliations)
  const hoursSaved = Math.round(unitCount * 0.45);
  // Uncollected dues recovery estimate (~1.5% saved due to automated notices & tracking)
  const estimatedCollectionBoost = unitCount * 250;
  // Cost savings estimate
  const estimatedCostSaving = unitCount * 35;

  const CurrencySymbol = currency === "SAR" ? (isAr ? "ر.س" : "SAR") : currency === "EGP" ? (isAr ? "ج.م" : "EGP") : (isAr ? "د.إ" : "AED");
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <section className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#060a18] overflow-hidden">
      
      {/* Ambient background glow */}
      <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="mx-auto max-w-5xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/40 px-4 py-1 text-xs font-bold text-blue-300 shadow-[0_0_20px_-4px_rgba(59,130,246,0.4)]">
            <Calculator className="size-3.5 text-blue-400" />
            <span>{isAr ? "حاسبة العائد والوقت المسترد" : "Interactive ROI & Time Calculator"}</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {isAr ? "كم ستوفّر من الوقت والجهد كل شهر؟" : "How Much Time & Money Will You Save?"}
          </h2>
          
          <p className="text-sm text-slate-300 font-normal">
            {isAr
              ? "حرّك المؤشر بحسب عدد الوحدات أو الشاليهات التي تديرها لاكتشاف حجم التوفير المالي والتشغيلي المباشر."
              : "Drag the slider to match your portfolio size and discover immediate administrative and cash-flow gains."}
          </p>
        </div>

        {/* Calculator Interactive Box */}
        <div className="rounded-3xl border border-white/10 bg-slate-900/90 backdrop-blur-2xl p-6 sm:p-10 shadow-2xl shadow-black/60 space-y-8">
          
          {/* Top Controls: Slider & Currency */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <label className="text-sm font-bold text-white block">
                  {isAr ? "حجم المحفظة العقارية (عدد الوحدات / الشاليهات):" : "Portfolio Size (Units / Chalets):"}
                </label>
                <span className="text-xs text-slate-400">
                  {isAr ? "أبراج سكنية، منتجعات، محلات، أو مجمعات" : "Residential, resorts, commercial, or HOAs"}
                </span>
              </div>

              {/* Units Display Badge */}
              <div className="flex items-center gap-3">
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 rounded-2xl shadow-inner">
                  {unitCount} {isAr ? "وحدة" : "Units"}
                </span>
                
                {/* Currency Switcher */}
                <div className="flex rounded-xl bg-black/40 border border-white/10 p-1 text-xs font-bold font-mono">
                  {(["SAR", "EGP", "AED"] as const).map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setCurrency(curr)}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        currency === curr ? "bg-blue-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      {curr}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Slider */}
            <div className="space-y-2">
              <input
                type="range"
                min={10}
                max={1000}
                step={10}
                value={unitCount}
                onChange={(e) => setUnitCount(Number(e.target.value))}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-500">
                <span>10 {isAr ? "وحدات" : "units"}</span>
                <span>250 {isAr ? "وحدة" : "units"}</span>
                <span>500 {isAr ? "وحدة" : "units"}</span>
                <span>1,000+ {isAr ? "وحدة" : "units"}</span>
              </div>
            </div>
          </div>

          {/* Results Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
            
            {/* Metric 1: Hours Saved */}
            <div className="rounded-2xl border border-white/5 bg-[#050915]/90 p-5 space-y-2 text-start">
              <div className="flex items-center gap-2 text-purple-400">
                <Clock className="size-4.5" />
                <span className="text-xs font-bold">{isAr ? "ساعات عمل مستردة شهرياً" : "Monthly Hours Saved"}</span>
              </div>
              <p className="text-3xl font-black text-white font-mono tracking-tight">
                ~{hoursSaved} <span className="text-sm font-normal text-slate-400">{isAr ? "ساعة / شهر" : "hrs/mo"}</span>
              </p>
              <p className="text-[11px] text-slate-400 font-normal leading-tight">
                {isAr ? "بدل إدخال القيود اليدوية والمطابقة المرهقة" : "Eliminated manual entries and reconciliation time"}
              </p>
            </div>

            {/* Metric 2: Accelerated Collections */}
            <div className="rounded-2xl border border-white/5 bg-[#050915]/90 p-5 space-y-2 text-start">
              <div className="flex items-center gap-2 text-emerald-400">
                <TrendingUp className="size-4.5" />
                <span className="text-xs font-bold">{isAr ? "تسريع وتيرة التحصيل" : "Faster Collections"}</span>
              </div>
              <p className="text-3xl font-black text-white font-mono tracking-tight">
                +{estimatedCollectionBoost.toLocaleString()} <span className="text-sm font-normal text-slate-400">{CurrencySymbol}</span>
              </p>
              <p className="text-[11px] text-slate-400 font-normal leading-tight">
                {isAr ? "بفضل التنبيهات المباشرة وسندات القبض الرقمية" : "Via automated payment notices and digital vouchers"}
              </p>
            </div>

            {/* Metric 3: Cost Reduction */}
            <div className="rounded-2xl border border-white/5 bg-[#050915]/90 p-5 space-y-2 text-start">
              <div className="flex items-center gap-2 text-blue-400">
                <DollarSign className="size-4.5" />
                <span className="text-xs font-bold">{isAr ? "وفر إداري مباشر" : "Admin Cost Reduction"}</span>
              </div>
              <p className="text-3xl font-black text-white font-mono tracking-tight">
                ~{estimatedCostSaving.toLocaleString()} <span className="text-sm font-normal text-slate-400">{CurrencySymbol} / {isAr ? "شهر" : "mo"}</span>
              </p>
              <p className="text-[11px] text-slate-400 font-normal leading-tight">
                {isAr ? "تقليل أخطاء المحاسبة والغرامات الضريبية" : "Fewer accounting adjustments and zero tax penalties"}
              </p>
            </div>

          </div>

          {/* Action Prompt */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              <span>
                {isAr
                  ? "جاهز للبدء؟ احصل على تهيئة مجانية وعرض حي مخصص لحجم محفظتك."
                  : "Ready to start? Get a tailored demo mapped to your exact portfolio scale."}
              </span>
            </div>

            <Link
              href="/demo"
              locale={locale}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all active:scale-95 whitespace-nowrap"
            >
              <span>{isAr ? "احجز عرضك التوضيحي الآن" : "Book Your Live Demo"}</span>
              <Arrow className="size-4" />
            </Link>
          </div>

        </div>

      </div>

    </section>
  );
}
