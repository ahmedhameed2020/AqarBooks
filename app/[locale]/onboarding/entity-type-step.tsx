"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import {
  Building,
  Wrench,
  Users,
  User,
  Palmtree,
  Home,
  Building2,
  MoreHorizontal,
  Check,
  Sparkles,
} from "lucide-react";
import { getCountryByCode } from "@/lib/countries";

export const ENTITY_TYPE_OPTIONS = [
  {
    value: "DEVELOPER",
    icon: Building,
    ar: "مطوّر عقاري",
    en: "Developer",
    descAr: "تطوير وإنشاء المشاريع والوحدات والمجمعات",
    descEn: "Development & construction of projects and units",
  },
  {
    value: "FACILITY_MANAGEMENT",
    icon: Wrench,
    ar: "إدارة مرافق",
    en: "Facility Management",
    descAr: "تشغيل وصيانة الأصول والخدمات المشتركة",
    descEn: "Operation & maintenance of shared assets",
  },
  {
    value: "OWNERS_ASSOCIATION",
    icon: Users,
    ar: "اتحاد ملاك",
    en: "Owners Association",
    descAr: "إدارة العقارات المشتركة وتحصيل الاشتراكات",
    descEn: "Shared property management & fee collections",
  },
  {
    value: "INDIVIDUAL_OWNER",
    icon: User,
    ar: "مالك فرد",
    en: "Individual Owner",
    descAr: "محفظة عقارية خاصة وتأجير وإدارة أصول",
    descEn: "Private real estate portfolio & rental management",
  },
  {
    value: "TOURIST_RESORT",
    icon: Palmtree,
    ar: "منتجع سياحي",
    en: "Tourist Resort",
    descAr: "شاليهات، أنشطة فندقية، وخدمات الضيافة",
    descEn: "Chalets, hospitality services, & resort management",
  },
  {
    value: "TOURIST_VILLAGE",
    icon: Home,
    ar: "قرية سياحية",
    en: "Tourist Village",
    descAr: "مجمعات ساحلية ووحدات مصيفية وترفيهية",
    descEn: "Coastal villages, vacation homes & recreation",
  },
  {
    value: "RESIDENTIAL_COMPOUND",
    icon: Building2,
    ar: "كمباوند سكني",
    en: "Residential Compound",
    descAr: "مجمعات سكنية مغلقة وخدمات أمنية وحراسة",
    descEn: "Gated communities & residential residential towers",
  },
  {
    value: "OTHER",
    icon: MoreHorizontal,
    ar: "أخرى",
    en: "Other",
    descAr: "نشاط عقاري أو مالي ذو طبيعة مخصصة",
    descEn: "Custom real estate or financial activity",
  },
] as const;

export type EntityTypeValue = (typeof ENTITY_TYPE_OPTIONS)[number]["value"];

interface EntityTypeStepProps {
  isAr: boolean;
  selectedCountryCode: string;
  orgName: string;
  onOrgNameChange: (value: string) => void;
  entityType: EntityTypeValue | null;
  onEntityTypeChange: (value: EntityTypeValue) => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  orgNameError?: string;
  customLabelError?: string;
}

export function EntityTypeStep({
  isAr,
  selectedCountryCode,
  orgName,
  onOrgNameChange,
  entityType,
  onEntityTypeChange,
  customLabel,
  onCustomLabelChange,
  orgNameError,
  customLabelError,
}: EntityTypeStepProps) {
  const country = getCountryByCode(selectedCountryCode);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleOptionKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let newIndex: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      newIndex = (currentIndex + 1) % ENTITY_TYPE_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      newIndex = (currentIndex - 1 + ENTITY_TYPE_OPTIONS.length) % ENTITY_TYPE_OPTIONS.length;
    } else {
      return;
    }
    e.preventDefault();
    onEntityTypeChange(ENTITY_TYPE_OPTIONS[newIndex].value);
    buttonRefs.current[newIndex]?.focus();
  };

  const placeholder = isAr ? country.orgPlaceholderAr : country.orgPlaceholderEn;

  return (
    <div className="space-y-6 text-start">
      {/* Organization Name Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "اسم المنشأة أو الشركة" : "Organization / Company Name"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "مطلوب" : "Required"}
          </span>
        </div>
        <input
          type="text"
          value={orgName}
          onChange={(e) => onOrgNameChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white py-3 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-medium"
          required
          minLength={2}
          maxLength={150}
          aria-invalid={orgNameError ? true : undefined}
          aria-describedby={orgNameError ? "org-name-error" : undefined}
        />
        {orgNameError && (
          <p id="org-name-error" role="alert" className="text-xs font-semibold text-red-600">
            {orgNameError}
          </p>
        )}
      </div>

      {/* Entity Type Selection */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label id="entity-type-label" className="text-xs font-bold text-slate-700 block">
            {isAr ? "نوع النشاط أو الكيان العقاري" : "Real Estate Entity Type"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "يحدد الهيكل المحاسبي الأنسب" : "Tailors financial modules"}
          </span>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
          role="radiogroup"
          aria-labelledby="entity-type-label"
        >
          {ENTITY_TYPE_OPTIONS.map((opt, idx) => {
            const Icon = opt.icon;
            const isSelected = entityType === opt.value;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  buttonRefs.current[idx] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onEntityTypeChange(opt.value)}
                onKeyDown={(e) => handleOptionKeyDown(e, idx)}
                className={`group relative flex items-start gap-3 rounded-xl border p-3 text-start transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-600/20"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    isSelected
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 group-hover:bg-white"
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`block truncate text-xs font-bold ${
                        isSelected ? "text-blue-950" : "text-slate-900"
                      }`}
                    >
                      {isAr ? opt.ar : opt.en}
                    </span>
                    {isSelected && (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-tight text-slate-500 line-clamp-1">
                    {isAr ? opt.descAr : opt.descEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Label Input if "OTHER" */}
      {entityType === "OTHER" && (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 transition-all">
          <label className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <Sparkles className="size-3.5 text-amber-600" />
            {isAr ? "صف طبيعة نشاطك المخصص" : "Describe your custom entity type"}
          </label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder={isAr ? "مثال: إدارة محافظ استثمار عقاري فندقي" : "e.g. Hospitality Real Estate Fund"}
            className="w-full rounded-lg border border-amber-300 bg-white py-2 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            required
            minLength={2}
            maxLength={100}
            aria-invalid={customLabelError ? true : undefined}
            aria-describedby={customLabelError ? "custom-label-error" : undefined}
          />
          {customLabelError && (
            <p id="custom-label-error" role="alert" className="text-xs font-semibold text-red-600">
              {customLabelError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
