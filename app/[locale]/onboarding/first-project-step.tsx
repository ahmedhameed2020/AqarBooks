"use client";

import { Building, Sparkles, Layers, ShieldCheck, CheckCircle2, DollarSign, Rocket } from "lucide-react";
import { getCountryByCode } from "@/lib/countries";
import { getCurrencyLabel } from "@/lib/currency";
import { CountryFlag } from "@/components/ui/country-flag";

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
      <div className="overflow-hidden rounded-2xl border border-blue-200/80 bg-linear-to-br from-blue-50/70 via-white to-indigo-50/40 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-blue-100/80 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-600" />
            <span className="text-xs font-extrabold text-blue-950">
              {isAr ? "بطاقة معاينة الحساب والمنظومة" : "Workspace Live Preview"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="size-3" />
            {isAr ? "جاهز للتشغيل" : "Ready to Launch"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {isAr ? "المنشأة" : "Organization"}
            </span>
            <span className="font-extrabold text-slate-900 truncate block text-sm">
              {orgName.trim() || (isAr ? "—" : "—")}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {isAr ? "الدولة والعملة" : "Country & Currency"}
            </span>
            <div className="flex items-center gap-2">
              <CountryFlag countryCode={country.code} className="w-5 h-3.5 rounded-xs" />
              <span className="font-extrabold text-slate-900">
                {currency} ({currencyDisplay})
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {isAr ? "نوع النشاط" : "Entity Type"}
            </span>
            <span className="font-bold text-slate-700 truncate block">
              {entityTypeLabel || (isAr ? "—" : "—")}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {isAr ? "المشروع الأول" : "First Project"}
            </span>
            <span className="font-bold text-slate-700 truncate block">
              {resortName.trim() || (isAr ? "—" : "—")}{" "}
              {resortCode ? <span className="font-mono text-slate-500">({resortCode})</span> : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
