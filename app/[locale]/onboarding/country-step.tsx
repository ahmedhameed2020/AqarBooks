"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Check, Globe, ShieldCheck, Coins } from "lucide-react";
import { SUPPORTED_COUNTRIES, type CountryInfo } from "@/lib/countries";
import { CURRENCY_CODES, getCurrencyLabel } from "@/lib/currency";

const LRI = "\u2066"; // LEFT-TO-RIGHT ISOLATE
const PDI = "\u2069"; // POP DIRECTIONAL ISOLATE

interface CountryStepProps {
  isAr: boolean;
  selectedCountryCode: string;
  onSelectCountry: (country: CountryInfo) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
}

export function CountryStep({
  isAr,
  selectedCountryCode,
  onSelectCountry,
  currency,
  onCurrencyChange,
}: CountryStepProps) {
  const currentCountry =
    SUPPORTED_COUNTRIES.find((c) => c.code === selectedCountryCode) || SUPPORTED_COUNTRIES[0];
  const countryButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleCountryKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let newIndex: number;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      newIndex = (currentIndex + 1) % SUPPORTED_COUNTRIES.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      newIndex = (currentIndex - 1 + SUPPORTED_COUNTRIES.length) % SUPPORTED_COUNTRIES.length;
    } else {
      return;
    }
    e.preventDefault();
    const next = SUPPORTED_COUNTRIES[newIndex];
    onSelectCountry(next);
    countryButtonRefs.current[newIndex]?.focus();
  };

  return (
    <div className="space-y-6 text-start">
      {/* Country Selection Header */}
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <Globe className="size-4 text-blue-600" />
          {isAr ? "اختر الدولة أو السوق المستهدف" : "Select Country or Target Market"}
        </label>
        <p className="text-xs text-slate-500">
          {isAr
            ? "سيتم ضبط العملة الافتراضية والأنظمة الضريبية والمالية تلقائياً بحسب الدولة"
            : "Default currency, tax regulations, and accounting standards will be configured automatically"}
        </p>
      </div>

      {/* Countries Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-2 gap-2.5"
        role="radiogroup"
        aria-label={isAr ? "اختيار الدولة" : "Country selection"}
      >
        {SUPPORTED_COUNTRIES.map((country, idx) => {
          const isSelected = country.code === currentCountry.code;
          return (
            <button
              key={country.code}
              ref={(el) => {
                countryButtonRefs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelectCountry(country)}
              onKeyDown={(e) => handleCountryKeyDown(e, idx)}
              className={`group relative flex items-start gap-3 rounded-xl border p-3 text-start transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-600/20"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
              }`}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-100 text-lg shadow-2xs">
                {country.flag}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`block truncate text-xs font-bold ${
                      isSelected ? "text-blue-950" : "text-slate-800"
                    }`}
                  >
                    {isAr ? country.nameAr : country.nameEn}
                  </span>
                  {isSelected && (
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="size-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {country.defaultCurrency}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Auto-configured Financial Standard Banner */}
      <div className="rounded-xl border border-blue-100 bg-linear-to-br from-blue-50/80 to-slate-50 p-3.5 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-900">
          <ShieldCheck className="size-4 text-blue-600 shrink-0" />
          <span>
            {isAr ? "التهيئة المالية والضريبية الذكية:" : "Smart Financial & Tax Preset:"}
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          {isAr ? currentCountry.taxNoteAr : currentCountry.taxNoteEn}
        </p>
      </div>

      {/* Currency Customization Option */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Coins className="size-3.5 text-slate-500" />
            {isAr ? "العملة الافتراضية للحساب" : "Account Default Currency"}
          </label>
          <span className="text-[11px] text-slate-400">
            {isAr ? "محددة تلقائياً ويمكن تعديلها" : "Auto-set · Customizable"}
          </span>
        </div>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-medium"
        >
          {CURRENCY_CODES.map((code) => {
            const label = getCurrencyLabel(code, isAr);
            const isolatedCode = `${LRI}${code}${PDI}`;
            return (
              <option key={code} value={code}>
                {label === code ? isolatedCode : `${isolatedCode} · ${label}`}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
