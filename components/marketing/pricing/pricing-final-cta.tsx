"use client";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingFinalCtaProps {
  locale: Locale;
}

export function PricingFinalCta({ locale }: PricingFinalCtaProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  return (
    <section className="relative bg-white py-20">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Double-Bezel Executive Container */}
        <div className="rounded-3xl p-1.5 sm:p-2 bg-gradient-to-b from-[#07425d]/20 to-slate-200 border border-[#07425d]/30 shadow-2xl">
          <div className="rounded-[calc(1.5rem-0.375rem)] bg-gradient-to-b from-[#07425d] to-[#052b3d] px-8 py-16 text-center text-white relative overflow-hidden">
            
            {/* Background Accent */}
            <div 
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:3rem_3rem]" 
              aria-hidden="true" 
            />

            <div className="relative max-w-3xl mx-auto">
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-300 uppercase block mb-3">
                {copy.finalCta.eyebrow}
              </span>

              <h2 className="text-3xl sm:text-5xl font-black font-heading tracking-tight">
                {copy.finalCta.headline}
              </h2>

              <p className="mt-4 text-sm sm:text-base font-medium text-slate-200 leading-relaxed max-w-2xl mx-auto">
                {copy.finalCta.support}
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/contact"
                  className="cursor-pointer inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-black text-[#07425d] shadow-lg hover:bg-slate-100 transition-all active:scale-[0.99]"
                >
                  <span>{copy.finalCta.primaryCta}</span>
                  <ArrowUpRight className="size-4 rtl:rotate-[-90deg]" />
                </Link>

                <Link
                  href="/contact?type=walkthrough"
                  className="cursor-pointer inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-8 py-4 text-sm font-bold text-white hover:bg-white/20 transition-all backdrop-blur-xs"
                >
                  <span>{copy.finalCta.secondaryCta}</span>
                </Link>
              </div>

              {/* Trust Strip */}
              <div className="mt-10 pt-6 border-t border-white/10 text-xs font-mono font-medium text-slate-300">
                <span>{copy.finalCta.trustStrip}</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
