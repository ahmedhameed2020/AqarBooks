"use client";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, CheckCircle2, Crown, Layers, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";
import {
  ESSENTIAL_ANNUAL_MONTHLY_EGP,
  ESSENTIAL_ANNUAL_TOTAL_EGP,
  ESSENTIAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_SAVING_EGP,
  PROFESSIONAL_ANNUAL_TOTAL_EGP,
  PROFESSIONAL_MONTHLY_EGP,
  formatEgp,
  getFoundingSlotsRemaining,
} from "./pricing-data";

interface PricingTierCardsProps {
  locale: Locale;
  billingCycle: "monthly" | "annual";
  foundingSlotsRemaining?: number | null;
}

export function PricingTierCards({
  locale,
  billingCycle,
  foundingSlotsRemaining,
}: PricingTierCardsProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);
  const isAnnual = billingCycle === "annual";

  // Essential Pricing
  const essentialMonthlyPrice = isAnnual ? ESSENTIAL_ANNUAL_MONTHLY_EGP : ESSENTIAL_MONTHLY_EGP;
  const essentialTotalAnnualStr = formatEgp(ESSENTIAL_ANNUAL_TOTAL_EGP, locale);

  // Professional Pricing
  const professionalMonthlyPrice = isAnnual ? PROFESSIONAL_ANNUAL_MONTHLY_EGP : PROFESSIONAL_MONTHLY_EGP;
  const professionalTotalAnnualStr = formatEgp(PROFESSIONAL_ANNUAL_TOTAL_EGP, locale);
  const professionalSavingStr = formatEgp(PROFESSIONAL_ANNUAL_SAVING_EGP, locale);

  return (
    <section id="plans" className="relative bg-[#F8FAFC] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Tier Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* 1. Essential Tier Card (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-sm transition-all hover:border-slate-300">
            <div>
              {/* Card Header */}
              <div className="pb-6 border-b border-slate-100">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  {copy.tiers.essential.eyebrow}
                </span>
                <h2 className="text-xl font-black text-slate-950 font-heading mt-1">
                  {copy.tiers.essential.name}
                </h2>
                <p className="mt-2 text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed">
                  {copy.tiers.essential.description}
                </p>
              </div>

              {/* Price Block */}
              <div className="py-6 border-b border-slate-100">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-slate-950">
                    {formatEgp(essentialMonthlyPrice, locale)}
                  </span>
                  <span className="text-sm font-bold text-slate-600">
                    {copy.billing.monthlySuffix}
                  </span>
                </div>

                <div className="mt-2 min-h-[22px]">
                  {isAnnual ? (
                    <span className="text-xs font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {copy.billing.annualBilledSuffix(essentialTotalAnnualStr)}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-medium">
                      {isAr ? "دفع شهري مرن بدون التزام سنوي" : "Flexible month-to-month billing"}
                    </span>
                  )}
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                  <Layers className="size-3.5 text-[#07425d]" />
                  <span>{copy.tiers.essential.capacityLabel}</span>
                </div>
              </div>

              {/* Feature Highlights */}
              <div className="py-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase block mb-3">
                  {isAr ? "القدرات المحاسبية الأساسية:" : "Included Accounting Capabilities:"}
                </span>
                <ul className="space-y-2.5">
                  {copy.tiers.essential.highlights.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 font-medium">
                      <CheckCircle2 className="size-4 text-[#07425d] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-6 border-t border-slate-100">
              <Link
                href="/contact?plan=essential"
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3.5 text-xs sm:text-sm font-bold text-slate-900 transition-all hover:bg-slate-100 hover:border-slate-400 shadow-2xs active:scale-[0.99]"
              >
                <span>{copy.tiers.essential.ctaText}</span>
                <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
              </Link>
              <p className="mt-2 text-center text-[11px] text-slate-400 font-medium">
                {copy.tiers.essential.ctaSubtext}
              </p>
            </div>
          </div>


          {/* 2. Professional Tier Card (Highlighted - 4 cols) */}
          <div className="lg:col-span-4 rounded-3xl p-1.5 sm:p-2 bg-[#07425d]/10 border-2 border-[#07425d] shadow-xl flex flex-col justify-between relative">
            
            {/* Top Badges */}
            <div className="absolute -top-3.5 inset-x-0 flex justify-center items-center gap-2 px-4 pointer-events-none">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#07425d] px-3.5 py-1 text-[11px] font-black text-white shadow-md">
                <Crown className="size-3 text-amber-300" />
                <span>{copy.tiers.professional.popularBadge}</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-bold text-purple-200 border border-purple-400/30 shadow-md">
                <Sparkles className="size-3 text-purple-300" />
                <span>{copy.tiers.professional.foundingBadge}</span>
              </span>
            </div>

            <div className="rounded-[calc(1.5rem-0.375rem)] bg-white p-6 sm:p-7 flex-1 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="pt-2 pb-6 border-b border-slate-100">
                  <span className="text-[11px] font-mono font-bold text-[#07425d] uppercase tracking-wider block">
                    {copy.tiers.professional.eyebrow}
                  </span>
                  <h2 className="text-2xl font-black text-slate-950 font-heading mt-1">
                    {copy.tiers.professional.name}
                  </h2>
                  <p className="mt-2 text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed">
                    {copy.tiers.professional.description}
                  </p>

                  {/* Scarcity Note */}
                  <div className="mt-3 rounded-xl bg-purple-50/70 border border-purple-200/80 p-2.5 text-[11px] text-purple-950 font-medium flex items-center justify-between">
                    <span>{copy.tiers.professional.foundingCohortNote}</span>
                    {foundingSlotsRemaining && (
                      <span className="shrink-0 font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                        {copy.tiers.professional.slotsRemainingText(foundingSlotsRemaining)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price Block */}
                <div className="py-6 border-b border-slate-100">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black font-mono tabular-nums text-[#07425d]">
                      {formatEgp(professionalMonthlyPrice, locale)}
                    </span>
                    <span className="text-sm font-bold text-slate-600">
                      {copy.billing.monthlySuffix}
                    </span>
                  </div>

                  <div className="mt-2 min-h-[22px]">
                    {isAnnual ? (
                      <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-300">
                        {copy.billing.annualBilledSuffix(professionalTotalAnnualStr)} · {isAr ? `وفّر ${professionalSavingStr} ج.م` : `Save EGP ${professionalSavingStr}`}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">
                        {isAr ? "دفع شهري مرن (وفّر 20% بالتحويل للسنوي)" : "Monthly billing (Save 20% on Annual)"}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-lg border border-[#07425d]/20">
                    <ShieldCheck className="size-3.5 text-[#07425d]" />
                    <span>{copy.tiers.professional.capacityLabel}</span>
                  </div>
                </div>

                {/* Feature Highlights */}
                <div className="py-6">
                  <span className="text-xs font-mono font-bold text-[#07425d] uppercase block mb-3">
                    {isAr ? "قدرات الحوكمة وفصل الحسابات:" : "Governance & Multi-Fund Capabilities:"}
                  </span>
                  <ul className="space-y-2.5">
                    {copy.tiers.professional.highlights.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-800 font-medium">
                        <CheckCircle2 className="size-4 text-[#059669] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* CTA Button */}
              <div className="pt-6 border-t border-slate-100">
                <Link
                  href="/contact?plan=professional&program=founding"
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#07425d] px-5 py-4 text-xs sm:text-sm font-black text-white transition-all hover:bg-[#06354a] shadow-md active:scale-[0.99]"
                >
                  <span>{copy.tiers.professional.ctaText}</span>
                  <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
                </Link>
                <p className="mt-2 text-center text-[11px] text-slate-500 font-medium">
                  {copy.tiers.professional.ctaSubtext}
                </p>
              </div>
            </div>
          </div>


          {/* 3. Enterprise Tier Card (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between shadow-sm transition-all hover:border-slate-300">
            <div>
              {/* Header */}
              <div className="pb-6 border-b border-slate-100">
                <span className="text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider block">
                  {copy.tiers.enterprise.eyebrow}
                </span>
                <h2 className="text-xl font-black text-slate-950 font-heading mt-1">
                  {copy.tiers.enterprise.name}
                </h2>
                <p className="mt-2 text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed">
                  {copy.tiers.enterprise.description}
                </p>
              </div>

              {/* Price Block */}
              <div className="py-6 border-b border-slate-100">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-black font-heading text-slate-950">
                    {isAr ? "تسعير مخصص" : "Custom Quote"}
                  </span>
                </div>

                <div className="mt-2 min-h-[22px]">
                  <span className="text-xs text-slate-500 font-medium">
                    {copy.billing.customSuffix}
                  </span>
                </div>

                <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                  <Zap className="size-3.5 text-amber-600" />
                  <span>{copy.tiers.enterprise.capacityLabel}</span>
                </div>
              </div>

              {/* Feature Highlights */}
              <div className="py-6">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase block mb-3">
                  {isAr ? "قدرات المؤسسات والمجموعات:" : "Holding & Custom Capabilities:"}
                </span>
                <ul className="space-y-2.5">
                  {copy.tiers.enterprise.highlights.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-[13px] text-slate-700 font-medium">
                      <CheckCircle2 className="size-4 text-[#07425d] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* CTA Button */}
            <div className="pt-6 border-t border-slate-100">
              <Link
                href="/contact?plan=enterprise"
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 px-5 py-3.5 text-xs sm:text-sm font-bold text-slate-900 transition-all hover:bg-slate-100 hover:border-slate-400 shadow-2xs active:scale-[0.99]"
              >
                <span>{copy.tiers.enterprise.ctaText}</span>
                <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
              </Link>
              <p className="mt-2 text-center text-[11px] text-slate-400 font-medium">
                {copy.tiers.enterprise.ctaSubtext}
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
