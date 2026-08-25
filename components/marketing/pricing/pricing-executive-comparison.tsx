"use client";

import type { Locale } from "@/i18n/routing";
import { Check, Minus, Sparkles, TableProperties } from "lucide-react";
import { getPricingCopy } from "./pricing-copy";

interface PricingExecutiveComparisonProps {
  locale: Locale;
}

export function PricingExecutiveComparison({ locale }: PricingExecutiveComparisonProps) {
  const isAr = locale === "ar";
  const copy = getPricingCopy(locale);

  // Top 10 decisive capabilities
  const rows = [
    {
      nameAr: "سعة الوحدات المدارة",
      nameEn: "Managed Units Capacity",
      essential: "حتى 150 وحدة",
      professional: "حتى 500 وحدة",
      enterprise: "مخصص (1,000+)",
    },
    {
      nameAr: "المستخدمين الماليين المخولين",
      nameEn: "Finance & Admin Users",
      essential: "3 مستخدمين",
      professional: "10 مستخدمين",
      enterprise: "مخصص بلا قيود",
    },
    {
      nameAr: "الكيانات القانونية والشركات",
      nameEn: "Legal Entities Supported",
      essential: "كيان واحد",
      professional: "متعدد الكيانات",
      enterprise: "مجموعة قابضة ومراحل",
    },
    {
      nameAr: "المحرك المحاسبي ودفتر الأستاذ المزدوج",
      nameEn: "Atomic Double-Entry Core",
      essential: "included",
      professional: "included",
      enterprise: "included",
    },
    {
      nameAr: "فصل ودائع الصيانة والاحتياطي الرأسمالي (CAM)",
      nameEn: "CAM Sinking Fund Ring-Fencing",
      essential: "notIncluded",
      professional: "included",
      enterprise: "included",
    },
    {
      nameAr: "الاعتماد المالي الثنائي وفصل الصلاحيات (Maker-Checker)",
      nameEn: "Maker-Checker Approval Workflows",
      essential: "notIncluded",
      professional: "included",
      enterprise: "included",
    },
    {
      nameAr: "المطابقة البنكية الذكية واستيراد الكشوف",
      nameEn: "Smart Bank Feed Reconciliation",
      essential: "notIncluded",
      professional: "included",
      enterprise: "included",
    },
    {
      nameAr: "بنية الفاتورة الإلكترونية والضرائب (ETA / ZATCA)",
      nameEn: "E-Invoicing Architecture (ETA / ZATCA)",
      essential: "notIncluded",
      professional: "onActivation",
      enterprise: "custom",
    },
    {
      nameAr: "ذكاء اصطناعي لقراءة الفواتير (OCR) واقتراح القيود",
      nameEn: "AI Supplier OCR & Auto-Journals",
      essential: "notIncluded",
      professional: "included",
      enterprise: "custom",
    },
    {
      nameAr: "تسويات المعاملات البينية والقوائم المجمعة",
      nameEn: "Intercompany & Group Consolidation",
      essential: "notIncluded",
      professional: "notIncluded",
      enterprise: "custom",
    },
  ];

  const renderStatus = (status: string) => {
    if (status === "included") {
      return (
        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-md">
          <Check className="size-3.5" />
          <span>{copy.capabilityMatrix.statusLabels.included}</span>
        </span>
      );
    }
    if (status === "onActivation") {
      return (
        <span className="inline-flex items-center font-mono font-bold text-xs text-sky-700 bg-sky-50 border border-sky-200/80 px-2.5 py-1 rounded-md">
          {copy.capabilityMatrix.statusLabels.onActivation}
        </span>
      );
    }
    if (status === "custom") {
      return (
        <span className="inline-flex items-center font-mono font-bold text-xs text-purple-700 bg-purple-50 border border-purple-200/80 px-2.5 py-1 rounded-md">
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
    return <span className="font-mono font-bold text-xs text-slate-800">{status}</span>;
  };

  return (
    <section id="executive-comparison" className="relative bg-[#F8FAFC] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs font-mono font-bold text-slate-600 mb-3 shadow-2xs">
            <TableProperties className="size-3.5 text-[#07425d]" />
            <span>{copy.executiveComparison.eyebrow}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-black text-slate-950 font-heading">
            {copy.executiveComparison.headline}
          </h2>

          <p className="mt-3 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {copy.executiveComparison.support}
          </p>
        </div>

        {/* Comparison Table */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-right rtl:text-right ltr:text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                  <th className="p-4 sm:p-5 w-2/5">{isAr ? "القدرة المالية / التشغيلية" : "Operational Capability"}</th>
                  <th className="p-4 sm:p-5 w-1/5 text-center">{copy.tiers.essential.name}</th>
                  <th className="p-4 sm:p-5 w-1/5 text-center bg-[#07425d]/5 text-[#07425d] font-black">
                    {copy.tiers.professional.name}
                  </th>
                  <th className="p-4 sm:p-5 w-1/5 text-center">{copy.tiers.enterprise.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                {rows.map((row, idx) => (
                  <tr key={row.nameEn} className={idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}>
                    <td className="p-4 sm:p-5 font-bold text-slate-900">
                      {isAr ? row.nameAr : row.nameEn}
                    </td>
                    <td className="p-4 sm:p-5 text-center">
                      {renderStatus(row.essential)}
                    </td>
                    <td className="p-4 sm:p-5 text-center bg-[#07425d]/[0.02]">
                      {renderStatus(row.professional)}
                    </td>
                    <td className="p-4 sm:p-5 text-center">
                      {renderStatus(row.enterprise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
