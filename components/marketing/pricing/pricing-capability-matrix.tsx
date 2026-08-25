"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { Check, ChevronDown, ChevronUp, Layers, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingCapabilityMatrixProps {
  locale: Locale;
}

export function PricingCapabilityMatrix({ locale }: PricingCapabilityMatrixProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  // Domains open state (default all open or first 3 open)
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({
    gl: true,
    billing: true,
    cam: true,
    treasury: false,
    tax: false,
    governance: false,
    ai: false,
    support: false,
  });

  const toggleDomain = (domainId: string) => {
    setOpenDomains((prev) => ({
      ...prev,
      [domainId]: !prev[domainId],
    }));
  };

  const expandAll = () => {
    const allOpen = copy.capabilityMatrix.domains.reduce(
      (acc, d) => ({ ...acc, [d.id]: true }),
      {}
    );
    setOpenDomains(allOpen);
  };

  const collapseAll = () => {
    const allClosed = copy.capabilityMatrix.domains.reduce(
      (acc, d) => ({ ...acc, [d.id]: false }),
      {}
    );
    setOpenDomains(allClosed);
  };

  const renderStatusBadge = (status: string) => {
    if (status === "included") {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-md">
          <Check className="size-3.5" />
          <span>{copy.capabilityMatrix.statusLabels.included}</span>
        </span>
      );
    }
    if (status === "advanced") {
      return (
        <span className="inline-flex items-center font-mono font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-md">
          {copy.capabilityMatrix.statusLabels.advanced}
        </span>
      );
    }
    if (status === "onActivation") {
      return (
        <span className="inline-flex items-center font-mono font-bold text-xs text-sky-700 bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 rounded-md">
          {copy.capabilityMatrix.statusLabels.onActivation}
        </span>
      );
    }
    if (status === "custom") {
      return (
        <span className="inline-flex items-center font-mono font-bold text-xs text-purple-700 bg-purple-50 border border-purple-200/80 px-2.5 py-0.5 rounded-md">
          {copy.capabilityMatrix.statusLabels.custom}
        </span>
      );
    }
    if (status === "notIncluded") {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-400">
          <Minus className="size-3.5" />
          <span>{copy.capabilityMatrix.statusLabels.notIncluded}</span>
        </span>
      );
    }
    return <span className="font-mono font-bold text-xs text-slate-700">{status}</span>;
  };

  return (
    <section id="matrix" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-10 border-b border-slate-200">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1 text-xs font-mono font-bold text-slate-600 mb-3 shadow-2xs">
              <Layers className="size-3.5 text-[#07425d]" />
              <span>{copy.capabilityMatrix.eyebrow}</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-heading">
              {copy.capabilityMatrix.headline}
            </h2>

            <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
              {copy.capabilityMatrix.support}
            </p>
          </div>

          {/* Expand/Collapse Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={expandAll}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {copy.capabilityMatrix.expandAll}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {copy.capabilityMatrix.collapseAll}
            </button>
          </div>
        </div>


        {/* Matrix Domains List */}
        <div className="mt-8 space-y-4">
          {copy.capabilityMatrix.domains.map((domain) => {
            const isOpen = openDomains[domain.id] ?? false;

            return (
              <div
                key={domain.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all shadow-2xs"
              >
                {/* Domain Header Accordion Trigger */}
                <button
                  type="button"
                  onClick={() => toggleDomain(domain.id)}
                  className="cursor-pointer w-full flex items-center justify-between p-5 sm:p-6 bg-slate-50/70 hover:bg-slate-100/70 transition-colors text-right rtl:text-right ltr:text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-[#07425d] font-mono text-xs font-bold text-white">
                      {domain.num}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-slate-950 font-heading">
                      {isAr ? domain.titleAr : domain.titleEn}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="text-xs font-mono font-medium hidden sm:inline">
                      {domain.items.length} {isAr ? "قدرات معيارية" : "Capabilities"}
                    </span>
                    {isOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                  </div>
                </button>

                {/* Domain Items Table */}
                {isOpen && (
                  <div className="overflow-x-auto border-t border-slate-100">
                    <table className="w-full text-right rtl:text-right ltr:text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/40 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          <th className="p-4 sm:px-6 w-2/5">{isAr ? "الوظيفة والمعيار المحاسبي" : "Capability Spec"}</th>
                          <th className="p-4 w-1/5 text-center">{copy.tiers.essential.name}</th>
                          <th className="p-4 w-1/5 text-center bg-[#07425d]/5 text-[#07425d] font-bold">
                            {copy.tiers.professional.name}
                          </th>
                          <th className="p-4 w-1/5 text-center">{copy.tiers.enterprise.name}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                        {domain.items.map((item, idx) => (
                          <tr key={item.nameEn} className={idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"}>
                            <td className="p-4 sm:px-6 font-semibold text-slate-800">
                              {isAr ? item.nameAr : item.nameEn}
                            </td>
                            <td className="p-4 text-center">
                              {renderStatusBadge(item.essential)}
                            </td>
                            <td className="p-4 text-center bg-[#07425d]/[0.02]">
                              {renderStatusBadge(item.professional)}
                            </td>
                            <td className="p-4 text-center">
                              {renderStatusBadge(item.enterprise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
