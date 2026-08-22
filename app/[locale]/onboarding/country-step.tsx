"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Check, Globe, ShieldCheck, Coins, Sparkles, CheckCircle2 } from "lucide-react";
import { SUPPORTED_COUNTRIES, type CountryInfo } from "@/lib/countries";
import { CURRENCY_CODES, getCurrencyLabel } from "@/lib/currency";
import { CountryFlag } from "@/components/ui/country-flag";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Globe className="size-4.5 text-blue-600" />
            <label className="text-sm font-black text-slate-900">
              {isAr ? "الدولة والسوق المالي المستهدف" : "Target Market & Country"}
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {isAr
              ? "اختر دولتك لضبط العملة، المعايير المحاسبية، والربط الضريبي فوراً"
              : "Select your country to configure currency, accounting, and tax compliance"}
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 border border-blue-200/60">
          <Sparkles className="size-3 text-blue-500" />
          {isAr ? "تهيئة ذكية فورية" : "Instant Smart Preset"}
        </span>
      </div>

      {/* Countries Grid (4 Columns on tablet/desktop) */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
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
              className={`group relative flex flex-col items-center justify-between rounded-2xl border p-4 text-center transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-blue-600 bg-blue-50/90 shadow-md ring-2 ring-blue-600/30 scale-[1.03]"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm"
              }`}
            >
              {/* Top Selected Indicator Check */}
              {isSelected && (
                <span className="absolute top-2 end-2 flex size-4.5 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs animate-in zoom-in-50 duration-150">
                  <Check className="size-3 stroke-[3]" />
                </span>
              )}

              {/* Vector SVG Flag */}
              <div className="flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <CountryFlag
                  countryCode={country.code}
                  className="w-12 h-8.5 rounded-lg shadow-sm"
                />
              </div>

              {/* Country Name */}
              <div className="mt-3 w-full">
                <span
                  className={`block truncate text-xs font-bold ${
                    isSelected ? "text-blue-950" : "text-slate-800"
                  }`}
                >
                  {isAr ? country.nameAr : country.nameEn}
                </span>

                {/* Default Currency Tag */}
                <div className="mt-1.5 flex justify-center">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-extrabold transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                    }`}
                  >
                    {country.defaultCurrency}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Auto-configured Financial Standard Banner */}
      <div className="overflow-hidden rounded-2xl border border-blue-200/80 bg-linear-to-r from-blue-50/90 via-slate-50 to-indigo-50/60 p-4.5 shadow-2xs space-y-2.5 transition-all">
        <div className="flex items-center justify-between border-b border-blue-100/70 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-black text-blue-950">
            <ShieldCheck className="size-4.5 text-blue-600 shrink-0" />
            <span>
              {isAr ? "الأنظمة المالية والامتثال الضريبي:" : "Tax & Regulatory Standards:"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <CountryFlag countryCode={currentCountry.code} className="w-6 h-4 rounded-xs" />
            <span className="text-xs font-bold text-slate-800">
              {isAr ? currentCountry.nameAr : currentCountry.nameEn}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 text-xs font-medium text-slate-700 leading-relaxed">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{isAr ? currentCountry.taxNoteAr : currentCountry.taxNoteEn}</span>
        </div>
      </div>

      {/* Currency Customization Option */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
            <Coins className="size-4 text-blue-600" />
            {isAr ? "العملة الأساسية المعتمدة" : "Base Account Currency"}
          </label>
          <span className="text-[11px] font-semibold text-slate-400">
            {isAr ? "محددة تلقائياً ويمكن تخصيصها" : "Auto-configured · Editable"}
          </span>
        </div>

        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white py-3 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/15 transition-all font-bold cursor-pointer"
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
