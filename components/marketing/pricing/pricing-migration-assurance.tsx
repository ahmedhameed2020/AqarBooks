"use client";

import type { Locale } from "@/i18n/routing";
import { CheckCircle2, Milestone, ShieldCheck } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingMigrationAssuranceProps {
  locale: Locale;
}

export function PricingMigrationAssurance({ locale }: PricingMigrationAssuranceProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  return (
    <section id="migration-assurance" className="relative bg-[#F8FAFC] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-mono font-bold text-slate-600 mb-3 shadow-2xs">
            <Milestone className="size-3.5 text-[#07425d]" />
            <span>{copy.migrationAssurance.eyebrow}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-heading">
            {copy.migrationAssurance.headline}
          </h2>

          <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {copy.migrationAssurance.support}
          </p>
        </div>

        {/* 5-Step Process Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {copy.migrationAssurance.steps.map((step, idx) => (
            <div
              key={step.num}
              className="relative rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-xs font-black text-[#07425d] bg-[#07425d]/10 px-2.5 py-1 rounded-md">
                    {step.num}
                  </span>
                  {idx === 4 && (
                    <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>

                <h3 className="text-sm font-black text-slate-950 font-heading">
                  {isAr ? step.titleAr : step.titleEn}
                </h3>

                <p className="mt-2 text-xs text-slate-600 font-medium leading-relaxed">
                  {isAr ? step.descAr : step.descEn}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                <span>{isAr ? "معيار معتمد" : "Verified Stage"}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
