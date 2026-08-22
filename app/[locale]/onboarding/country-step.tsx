"use client";

import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Check, Globe, ShieldCheck, Coins, Sparkles } from "lucide-react";
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
        <div className="flex items-center gap-2">
          <Globe className="size-4.5 text-blue-600" />
          <label className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
            {isAr ? "اختر الدولة أو السوق المالي المستهدف" : "Select Target Market / Country"}
          </label>
        </div>
        <p className="text-xs text-slate-500">
          {isAr
            ? "سيتم تخصيص العملة، الضرائب، ونماذج الحسابات فوراً بما يتوافق مع أنظمة دولتك"
            : "Currency, tax regulations, and charts of accounts are customized to match your country"}
        </p>
      </div>

      {/* Countries Grid (4 columns on sm/md screens) */}
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
              className={`group relative flex flex-col items-center justify-between rounded-2xl border p-3.5 text-center transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-blue-600 bg-blue-50/90 shadow-md ring-2 ring-blue-600/30 scale-[1.02]"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-xs"
              }`}
            >
              {/* Checkmark badge */}
              {isSelected && (
                <span className="absolute top-2 end-2 flex size-4 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs">
                  <Check className="size-2.5 stroke-[3]" />
                </span>
              )}

              {/* Large Flag Badge */}
              <div className="flex size-11 items-center justify-center rounded-xl bg-white border border-slate-100 text-2xl shadow-xs transition-transform group-hover:scale-105">
                {country.flag}
              </div>

              {/* Country Name */}
              <div className="mt-2.5 w-full">
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
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                      isSelected
                        ? "bg-blue-600 text-white"
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
      <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-slate-50 to-indigo-50/50 p-4 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
            <ShieldCheck className="size-4 text-blue-600 shrink-0" />
            <span>
              {isAr ? "التهيئة والامتثال الضريبي الذكي:" : "Smart Compliance & Accounting Preset:"}
            </span>
          </div>
          <span className="text-base">{currentCountry.flag}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600 font-medium">
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
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all font-medium"
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
