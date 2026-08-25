"use client";

import type { Locale } from "@/i18n/routing";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingHeroProps {
  locale: Locale;
  billingCycle: "monthly" | "annual";
  onBillingCycleChange: (cycle: "monthly" | "annual") => void;
}

export function PricingHero({
  locale,
  billingCycle,
  onBillingCycleChange,
}: PricingHeroProps) {
  const copy = getPricingCopy(locale);

  return (
    <section className="relative overflow-hidden bg-white pt-24 pb-12 border-b border-slate-200/80">
      {/* Background Architectural Grid Pattern */}
      <div 
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#07425d08_1px,transparent_1px),linear-gradient(to_bottom,#07425d08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" 
        aria-hidden="true" 
      />

      <div className="relative mx-auto max-w-7xl px-6 text-center">
        {/* Section Eyebrow */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-bold text-[#07425d] mb-4">
          <ShieldCheck className="size-3.5" />
          <span>{copy.hero.eyebrow}</span>
        </div>

        {/* Executive Headline (Value -> Scale -> Price) */}
        <h1 className="mx-auto max-w-4xl text-3xl font-black text-slate-950 font-heading tracking-tight sm:text-5xl sm:leading-[1.15]">
          {copy.hero.headline}
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg font-medium text-slate-600 leading-relaxed">
          {copy.hero.support}
        </p>

        {/* 4 Trust Anchors */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 text-xs sm:text-sm font-semibold text-slate-700">
          {copy.hero.trustAnchors.map((anchor) => (
            <div
              key={anchor}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 shadow-2xs"
            >
              <CheckCircle2 className="size-3.5 text-[#059669]" />
              <span>{anchor}</span>
            </div>
          ))}
        </div>

        {/* Interactive Billing Toggle (Monthly / Annual - Save 20%) */}
        <div className="mt-10 inline-flex items-center rounded-2xl border border-slate-200 bg-slate-100 p-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => onBillingCycleChange("monthly")}
            className={`cursor-pointer rounded-xl px-5 py-2 text-xs sm:text-sm font-bold transition-all ${
              billingCycle === "monthly"
                ? "bg-white text-slate-950 shadow-xs"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            {copy.billing.monthly}
          </button>

          <button
            type="button"
            onClick={() => onBillingCycleChange("annual")}
            className={`group relative cursor-pointer inline-flex items-center gap-2 rounded-xl px-5 py-2 text-xs sm:text-sm font-bold transition-all ${
              billingCycle === "annual"
                ? "bg-[#07425d] text-white shadow-xs"
                : "text-slate-600 hover:text-slate-950"
            }`}
          >
            <span>{copy.billing.annual}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase transition-colors ${
                billingCycle === "annual"
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {copy.billing.saveBadge}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
