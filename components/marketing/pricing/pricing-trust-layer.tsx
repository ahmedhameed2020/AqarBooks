"use client";

import type { Locale } from "@/i18n/routing";
import { Database, FileCheck2, Headphones, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingTrustLayerProps {
  locale: Locale;
}

export function PricingTrustLayer({ locale }: PricingTrustLayerProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  const icons = [Database, FileCheck2, Headphones];

  return (
    <section id="trust-layer" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {copy.trustLayer.blocks.map((block, idx) => {
            const Icon = icons[idx] || ShieldCheck;

            return (
              <div
                key={block.titleEn}
                className="rounded-3xl border border-slate-200 bg-slate-50/50 p-8 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-all"
              >
                <div>
                  <div className="size-12 rounded-2xl bg-[#07425d]/10 flex items-center justify-center text-[#07425d] mb-6">
                    <Icon className="size-6" />
                  </div>

                  <h3 className="text-lg font-black text-slate-950 font-heading">
                    {isAr ? block.titleAr : block.titleEn}
                  </h3>

                  <p className="mt-3 text-xs sm:text-[13px] text-slate-600 font-medium leading-relaxed">
                    {isAr ? block.descAr : block.descEn}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200/70 flex items-center gap-2 text-xs font-mono font-bold text-slate-500">
                  <Lock className="size-3.5 text-[#07425d]" />
                  <span>{isAr ? "ضمان مالي وتشغيلي" : "Enterprise Guarantee"}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
