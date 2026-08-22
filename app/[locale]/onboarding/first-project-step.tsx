"use client";

import { Building, Sparkles, Layers, ShieldCheck, CheckCircle2 } from "lucide-react";
import { getCountryByCode } from "@/lib/countries";
import { getCurrencyLabel } from "@/lib/currency";

interface FirstProjectStepProps {
  isAr: boolean;
  selectedCountryCode: string;
  orgName: string;
  entityTypeLabel: string;
  resortName: string;
  onResortNameChange: (value: string) => void;
  resortCode: string;
  onResortCodeChange: (value: string) => void;
  currency: string;
  resortNameError?: string;
}

export function FirstProjectStep({
  isAr,
  selectedCountryCode,
  orgName,
  entityTypeLabel,
  resortName,
  onResortNameChange,
  resortCode,
  onResortCodeChange,
  currency,
  resortNameError,
}: FirstProjectStepProps) {
  const country = getCountryByCode(selectedCountryCode);
  const currencyDisplay = getCurrencyLabel(currency, isAr);
  const placeholder = isAr ? country.projectPlaceholderAr : country.projectPlaceholderEn;

  return (
    <div className="space-y-6 text-start">
      {/* Project Name Input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "اسم المشروع أو العقار الأول" : "First Project or Property Name"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "مطلوب" : "Required"}
          </span>
        </div>
        <input
          type="text"
          value={resortName}
          onChange={(e) => onResortNameChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 bg-white py-3 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-medium"
          required
          minLength={2}
          maxLength={150}
          aria-invalid={resortNameError ? true : undefined}
          aria-describedby={resortNameError ? "resort-name-error" : undefined}
        />
        {resortNameError && (
          <p id="resort-name-error" role="alert" className="text-xs font-semibold text-red-600">
            {resortNameError}
          </p>
        )}
      </div>

      {/* Project Code */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 block">
            {isAr ? "كود المشروع المختصر" : "Project Identifier Code"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "يُولّد تلقائياً ويمكن تعديله" : "Auto-generated & editable"}
          </span>
        </div>
        <input
          type="text"
          value={resortCode}
          onChange={(e) => onResortCodeChange(e.target.value.toUpperCase())}
          placeholder="PRJ-01"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          dir="ltr"
        />
      </div>

      {/* Live Workspace Preview Card */}
      <div className="overflow-hidden rounded-2xl border border-blue-200/80 bg-linear-to-b from-blue-50/50 via-white to-slate-50 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-blue-100/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-950">
              {isAr ? "معاينة المنظومة الجاهزة" : "Live Workspace Summary"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            <CheckCircle2 className="size-3" />
            {isAr ? "جاهز للبدء" : "Ready"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              {isAr ? "المؤسسة" : "Organization"}
            </span>
            <span className="font-bold text-slate-800 truncate block">
              {orgName.trim() || (isAr ? "—" : "—")}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              {isAr ? "الدولة والعملة" : "Country & Currency"}
            </span>
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>{country.flag}</span>
              <span>{currency} ({currencyDisplay})</span>
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              {isAr ? "النشاط" : "Entity Type"}
            </span>
            <span className="font-semibold text-slate-700 truncate block">
              {entityTypeLabel || (isAr ? "—" : "—")}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block">
              {isAr ? "المشروع الأول" : "First Project"}
            </span>
            <span className="font-semibold text-slate-700 truncate block">
              {resortName.trim() || (isAr ? "—" : "—")}{" "}
              {resortCode ? `(${resortCode})` : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
