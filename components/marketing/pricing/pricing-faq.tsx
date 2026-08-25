"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingFaqSectionProps {
  locale: Locale;
}

export function PricingFaqSection({ locale }: PricingFaqSectionProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  // Accordion state
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="relative bg-[#F8FAFC] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-4xl px-6">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-mono font-bold text-slate-600 mb-3 shadow-2xs">
            <HelpCircle className="size-3.5 text-[#07425d]" />
            <span>{copy.faq.eyebrow}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-heading">
            {copy.faq.headline}
          </h2>
        </div>

        {/* Accordion List */}
        <div className="space-y-3.5">
          {copy.faq.items.map((item, idx) => {
            const isOpen = openIndex === idx;

            return (
              <div
                key={item.qEn}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(idx)}
                  className="cursor-pointer w-full flex items-center justify-between p-5 text-right rtl:text-right ltr:text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm sm:text-base font-bold text-slate-950">
                    {isAr ? item.qAr : item.qEn}
                  </span>
                  <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 ml-3 rtl:mr-3 rtl:ml-0">
                    {isOpen ? <ChevronUp className="size-4 text-[#07425d]" /> : <ChevronDown className="size-4" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                    <p className="text-xs sm:text-[13px] text-slate-700 font-medium leading-relaxed">
                      {isAr ? item.aAr : item.aEn}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
