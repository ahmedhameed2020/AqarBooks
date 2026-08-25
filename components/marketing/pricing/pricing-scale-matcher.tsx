"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, Check, Compass, Sliders, Sparkles, Building2, Users, Building, ShieldCheck } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingScaleMatcherProps {
  locale: Locale;
}

export function PricingScaleMatcher({ locale }: PricingScaleMatcherProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  // Matcher state
  const [units, setUnits] = useState<number>(120);
  const [entities, setEntities] = useState<"1" | "2-3" | "4+">("1");
  const [users, setUsers] = useState<"1-3" | "4-10" | "11+">("1-3");
  const [complexity, setComplexity] = useState<"simple" | "moderate" | "complex">("moderate");

  // Determine recommended plan based on multi-factor inputs
  const getRecommendation = () => {
    if (units > 500 || entities === "4+" || users === "11+" || complexity === "complex") {
      return {
        planId: "enterprise",
        planName: isAr ? "Enterprise (المؤسسات والمحافظ الكبرى)" : "Enterprise & Custom Scale",
        tierBadge: isAr ? "باقة المؤسسات" : "Enterprise Tier",
        colorClass: "border-purple-600 bg-purple-50/50 text-purple-950",
        badgeBg: "bg-purple-600 text-white",
        btnClass: "bg-purple-900 hover:bg-purple-950 text-white",
        href: "/contact?plan=enterprise",
        reason: isAr
          ? "نشاطك يتطلب قوائم مالية مجمعة، مراكز تكلفة مستقلة، أو سعة تتجاوز 500 وحدة وحوكمة بينية."
          : "Your operations require multi-entity consolidation, custom cost centers, or >500 units scale.",
      };
    }

    if (units > 150 || entities === "2-3" || users === "4-10" || complexity === "moderate") {
      return {
        planId: "professional",
        planName: isAr ? "Professional (المنظومة القياسية للكمبوندات والأبراج)" : "Professional Plan (Founding Cohort)",
        tierBadge: isAr ? "الأكثر تطابقاً مع احتياجك" : "Best Operational Match",
        colorClass: "border-[#07425d] bg-[#07425d]/5 text-slate-950",
        badgeBg: "bg-[#07425d] text-white",
        btnClass: "bg-[#07425d] hover:bg-[#06354a] text-white",
        href: "/contact?plan=professional&program=founding",
        reason: isAr
          ? "هيكلك يتطلب فصلاً لودائع الصيانة CAM، حوكمة الاعتمادات Maker-Checker، ومطابقة بنكية متقدمة."
          : "Your structure requires CAM sinking fund splits, Maker-Checker governance, and smart reconciliation.",
      };
    }

    return {
      planId: "essential",
      planName: isAr ? "Essential (الأساسيات للعقارات المستقلة)" : "Essential Plan",
      tierBadge: isAr ? "الأنسب للمباني الفردية" : "Ideal for Single Buildings",
      colorClass: "border-slate-300 bg-white text-slate-950",
      badgeBg: "bg-slate-800 text-white",
      btnClass: "bg-slate-900 hover:bg-slate-800 text-white",
      href: "/contact?plan=essential",
      reason: isAr
        ? "حجم نشاطك ودرجة التعقيد البسيطة تناسبها باقة الأساسيات لبدء تشغيل محاسبي متكامل ومنضبط."
        : "Your operational scale fits perfectly with our Essential tier for clean double-entry books.",
    };
  };

  const rec = getRecommendation();

  return (
    <section id="scale-matcher" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1 text-xs font-mono font-bold text-slate-600 mb-3">
            <Compass className="size-3.5 text-[#07425d]" />
            <span>{copy.scaleMatcher.eyebrow}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-heading">
            {copy.scaleMatcher.headline}
          </h2>

          <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {copy.scaleMatcher.support}
          </p>
        </div>

        {/* Matcher Box (2-column on desktop: selectors left, result card right) */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Column (7 cols) */}
          <div className="lg:col-span-7 rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-8 space-y-6">
            
            {/* Factor 1: Units Slider */}
            <div>
              <div className="flex items-center justify-between gap-4 mb-2">
                <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="size-4 text-[#07425d]" />
                  <span>{copy.scaleMatcher.labels.units}</span>
                </label>
                <span className="font-mono font-black text-base sm:text-lg text-[#07425d] bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-2xs">
                  {units >= 1000 ? "1,000+ وحدة" : `${units} وحدة`}
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="1000"
                step="20"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#07425d]"
              />
              <div className="flex justify-between text-[11px] font-mono text-slate-600 mt-1">
                <span>20 وحدة (مبنى فردي)</span>
                <span>500 وحدة (كمبوند متكامل)</span>
                <span>1,000+ (محفظة كبرى)</span>
              </div>
            </div>

            {/* Factor 2: Legal Entities */}
            <div>
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 mb-2.5">
                <Building className="size-4 text-[#07425d]" />
                <span>{copy.scaleMatcher.labels.entities}</span>
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {(["1", "2-3", "4+"] as const).map((ent) => (
                  <button
                    key={ent}
                    type="button"
                    onClick={() => setEntities(ent)}
                    className={`cursor-pointer py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all text-center ${
                      entities === ent
                        ? "border-[#07425d] bg-[#07425d] text-white shadow-2xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {ent === "1" ? (isAr ? "كيان واحد (شركة واحدة)" : "1 Single Entity") : ent === "2-3" ? (isAr ? "2 إلى 3 كيانات / فروع" : "2 - 3 Entities") : (isAr ? "4+ شركات قابضة" : "4+ Holding Entities")}
                  </button>
                ))}
              </div>
            </div>

            {/* Factor 3: Users */}
            <div>
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 mb-2.5">
                <Users className="size-4 text-[#07425d]" />
                <span>{copy.scaleMatcher.labels.users}</span>
              </label>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {(["1-3", "4-10", "11+"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUsers(u)}
                    className={`cursor-pointer py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all text-center ${
                      users === u
                        ? "border-[#07425d] bg-[#07425d] text-white shadow-2xs"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {u === "1-3" ? (isAr ? "1 - 3 محاسبين" : "1 - 3 Users") : u === "4-10" ? (isAr ? "4 - 10 مستخدمين" : "4 - 10 Users") : (isAr ? "11+ فريق كبير" : "11+ Users")}
                  </button>
                ))}
              </div>
            </div>

            {/* Factor 4: Accounting Complexity */}
            <div>
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2 mb-2.5">
                <Sliders className="size-4 text-[#07425d]" />
                <span>{copy.scaleMatcher.labels.complexity}</span>
              </label>
              <div className="space-y-2">
                {copy.scaleMatcher.complexityOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setComplexity(opt.id as any)}
                    className={`cursor-pointer w-full text-left rtl:text-right p-3 rounded-xl border text-xs sm:text-[13px] font-semibold transition-all flex items-center justify-between ${
                      complexity === opt.id
                        ? "border-[#07425d] bg-[#07425d]/10 text-[#07425d] shadow-2xs font-bold"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span>{isAr ? opt.labelAr : opt.labelEn}</span>
                    {complexity === opt.id && <Check className="size-4 shrink-0 text-[#07425d]" />}
                  </button>
                ))}
              </div>
            </div>

          </div>


          {/* Result Recommendation Card (5 cols) */}
          <div className={`lg:col-span-5 rounded-3xl border-2 p-7 sm:p-8 flex flex-col justify-between shadow-lg transition-all ${rec.colorClass}`}>
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-4">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                  {copy.scaleMatcher.resultTitle}
                </span>
                <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase shadow-xs ${rec.badgeBg}`}>
                  {rec.tierBadge}
                </span>
              </div>

              <h3 className="text-2xl font-black font-heading mt-4 text-slate-950">
                {rec.planName}
              </h3>

              <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-700">
                {rec.reason}
              </p>

              <div className="mt-6 rounded-2xl bg-white/90 p-4 border border-slate-200/80 space-y-2">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase block">
                  {isAr ? "الملخص التشغيلي المخصص لك:" : "Your Operating Configuration:"}
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">{isAr ? "الوحدات:" : "Units:"}</span>
                    <span className="font-mono font-bold">{units}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">{isAr ? "الشركات:" : "Entities:"}</span>
                    <span className="font-mono font-bold">{entities}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">{isAr ? "المستخدمين:" : "Users:"}</span>
                    <span className="font-mono font-bold">{users}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">{isAr ? "التعقيد:" : "Complexity:"}</span>
                    <span className="font-mono font-bold uppercase text-[10px]">{complexity}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8">
              <Link
                href={rec.href}
                className={`w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-xs sm:text-sm font-black transition-all shadow-md active:scale-[0.99] ${rec.btnClass}`}
              >
                <span>{isAr ? "اختيار هذه الباقة وبدء التأسيس ↗" : "Select This Plan & Start Onboarding ↗"}</span>
                <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
