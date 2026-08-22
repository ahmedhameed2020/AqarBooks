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
  Flame,
} from "lucide-react";
import { getCountryByCode } from "@/lib/countries";
import { CountryFlag } from "@/components/ui/country-flag";

export const ENTITY_TYPE_OPTIONS = [
  {
    value: "DEVELOPER",
    icon: Building,
    ar: "مطوّر عقاري",
    en: "Developer",
    descAr: "تطوير وإنشاء المشاريع والوحدات والمجمعات",
    descEn: "Development & construction of projects and units",
    badgeAr: "شائع",
    badgeEn: "Popular",
    color: "blue",
  },
  {
    value: "FACILITY_MANAGEMENT",
    icon: Wrench,
    ar: "إدارة مرافق وتشغيل",
    en: "Facility Management",
    descAr: "تشغيل وصيانة الأصول والخدمات المشتركة",
    descEn: "Operation & maintenance of shared assets",
    badgeAr: "شائع",
    badgeEn: "Popular",
    color: "indigo",
  },
  {
    value: "OWNERS_ASSOCIATION",
    icon: Users,
    ar: "اتحاد ملاك وجمعيات",
    en: "Owners Association",
    descAr: "إدارة العقارات المشتركة وتحصيل الاشتراكات",
    descEn: "Shared property management & fee collections",
    color: "emerald",
  },
  {
    value: "INDIVIDUAL_OWNER",
    icon: User,
    ar: "مالك فرد / محفظة",
    en: "Individual Owner",
    descAr: "محفظة عقارية خاصة وتأجير وإدارة أصول",
    descEn: "Private real estate portfolio & rental management",
    color: "amber",
  },
  {
    value: "TOURIST_RESORT",
    icon: Palmtree,
    ar: "منتجع سياحي وفندقي",
    en: "Tourist Resort",
    descAr: "شاليهات، أنشطة فندقية، وخدمات الضيافة",
    descEn: "Chalets, hospitality services, & resort management",
    color: "teal",
  },
  {
    value: "TOURIST_VILLAGE",
    icon: Home,
    ar: "قرية سياحية",
    en: "Tourist Village",
    descAr: "مجمعات ساحلية ووحدات مصيفية وترفيهية",
    descEn: "Coastal villages, vacation homes & recreation",
    color: "cyan",
  },
  {
    value: "RESIDENTIAL_COMPOUND",
    icon: Building2,
    ar: "كمباوند ومجمع سكني",
    en: "Residential Compound",
    descAr: "مجمعات سكنية مغلقة وخدمات أمنية وحراسة",
    descEn: "Gated communities & residential towers",
    color: "violet",
  },
  {
    value: "OTHER",
    icon: MoreHorizontal,
    ar: "نشاط مخصص آخر",
    en: "Custom Activity",
    descAr: "نشاط عقاري أو مالي ذو طبيعة مخصصة",
    descEn: "Custom real estate or financial activity",
    color: "slate",
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
          <label className="text-xs font-bold text-slate-800 block">
            {isAr ? "اسم المنشأة أو الشركة العقارية" : "Organization / Real Estate Company"}
          </label>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <CountryFlag countryCode={country.code} className="w-4 h-3 rounded-2xs" />
            <span>{isAr ? country.nameAr : country.nameEn}</span>
          </div>
        </div>
        <input
          type="text"
          value={orgName}
          onChange={(e) => onOrgNameChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white py-3 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition-all font-semibold"
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
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label id="entity-type-label" className="text-xs font-bold text-slate-800 block">
            {isAr ? "طبيعة النشاط العقاري" : "Real Estate Business Activity"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "يحدد الهيكل المحاسبي الأنسب" : "Tailors financial ledger"}
          </span>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
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
                className={`group relative flex items-start gap-3.5 rounded-2xl border p-3.5 text-start transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/90 shadow-md ring-2 ring-blue-600/30 scale-[1.01]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-xs"
                }`}
              >
                {/* Icon Container */}
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                    isSelected
                      ? "border-blue-600 bg-blue-600 text-white shadow-xs"
                      : "border-slate-200 bg-slate-50 text-slate-700 group-hover:bg-white group-hover:border-slate-300"
                  }`}
                >
                  <Icon className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`block truncate text-xs font-bold ${
                          isSelected ? "text-blue-950" : "text-slate-900"
                        }`}
                      >
                        {isAr ? opt.ar : opt.en}
                      </span>
                      {"badgeAr" in opt && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-800">
                          <Flame className="size-2.5" />
                          {isAr ? opt.badgeAr : opt.badgeEn}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs">
                        <Check className="size-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">
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
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 transition-all">
          <label className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
            <Sparkles className="size-3.5 text-amber-600" />
            {isAr ? "صف طبيعة نشاطك العقاري المخصص" : "Describe your custom entity type"}
          </label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder={isAr ? "مثال: إدارة صناديق استثمار وتطوير فندقي" : "e.g. Real Estate Investment Trust"}
            className="w-full rounded-xl border border-amber-300 bg-white py-2.5 px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20 font-medium"
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
