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
} from "lucide-react";

export const ENTITY_TYPE_OPTIONS = [
  { value: "DEVELOPER", icon: Building, ar: "مطوّر عقاري", en: "Developer" },
  { value: "FACILITY_MANAGEMENT", icon: Wrench, ar: "إدارة مرافق", en: "Facility Management" },
  { value: "OWNERS_ASSOCIATION", icon: Users, ar: "اتحاد ملاك", en: "Owners Association" },
  { value: "INDIVIDUAL_OWNER", icon: User, ar: "مالك فرد", en: "Individual Owner" },
  { value: "TOURIST_RESORT", icon: Palmtree, ar: "منتجع سياحي", en: "Tourist Resort" },
  { value: "TOURIST_VILLAGE", icon: Home, ar: "قرية سياحية", en: "Tourist Village" },
  { value: "RESIDENTIAL_COMPOUND", icon: Building2, ar: "كمباوند سكني", en: "Residential Compound" },
  { value: "OTHER", icon: MoreHorizontal, ar: "أخرى", en: "Other" },
] as const;

export type EntityTypeValue = (typeof ENTITY_TYPE_OPTIONS)[number]["value"];

interface EntityTypeStepProps {
  isAr: boolean;
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
  orgName,
  onOrgNameChange,
  entityType,
  onEntityTypeChange,
  customLabel,
  onCustomLabelChange,
  orgNameError,
  customLabelError,
}: EntityTypeStepProps) {
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

  return (
    <div className="space-y-5 text-start">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "اسم المؤسسة" : "Organization Name"}
        </label>
        <input
          type="text"
          value={orgName}
          onChange={(e) => onOrgNameChange(e.target.value)}
          placeholder={isAr ? "شركة النخبة العقارية" : "Elite Real Estate Holdings"}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
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

      <div className="space-y-1.5">
        <label id="entity-type-label" className="text-xs font-bold text-slate-700 block">
          {isAr ? "نوع الكيان" : "Entity Type"}
        </label>
        <div
          className="grid grid-cols-2 gap-2.5"
          role="radiogroup"
          aria-labelledby="entity-type-label"
        >
          {ENTITY_TYPE_OPTIONS.map(({ value, icon: Icon, ar, en }, index) => {
            const selected = entityType === value;
            const isTabStop = entityType === null ? index === 0 : selected;
            return (
              <button
                key={value}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={isTabStop ? 0 : -1}
                onClick={() => onEntityTypeChange(value)}
                onKeyDown={(e) => handleOptionKeyDown(e, index)}
                className={`relative flex flex-col items-start gap-2 rounded-lg border p-3 text-start transition-all ${
                  selected
                    ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {selected && (
                  <span className="absolute end-2 top-2 flex size-4 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                )}
                <Icon className={`size-5 ${selected ? "text-blue-600" : "text-slate-400"}`} />
                <span
                  className={`text-xs font-bold ${selected ? "text-blue-900" : "text-slate-700"}`}
                >
                  {isAr ? ar : en}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {entityType === "OTHER" && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "صف نوع الكيان" : "Describe the entity type"}
          </label>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange(e.target.value)}
            placeholder={isAr ? "مثال: صندوق استثمار عقاري" : "e.g. Real estate investment fund"}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
            required
            minLength={2}
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
