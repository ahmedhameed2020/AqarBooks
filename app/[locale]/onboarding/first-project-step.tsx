"use client";

import { CURRENCY_CODES, getCurrencyLabel } from "@/lib/currency";

interface FirstProjectStepProps {
  isAr: boolean;
  resortName: string;
  onResortNameChange: (value: string) => void;
  resortCode: string;
  onResortCodeChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  resortNameError?: string;
}

export function FirstProjectStep({
  isAr,
  resortName,
  onResortNameChange,
  resortCode,
  onResortCodeChange,
  currency,
  onCurrencyChange,
  resortNameError,
}: FirstProjectStepProps) {
  return (
    <div className="space-y-5 text-start">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "اسم المشروع أو المنتجع الأول" : "First project or resort name"}
        </label>
        <input
          type="text"
          value={resortName}
          onChange={(e) => onResortNameChange(e.target.value)}
          placeholder={isAr ? "منتجع النخيل الذهبي" : "Golden Palm Resort"}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          required
          minLength={2}
          aria-invalid={resortNameError ? true : undefined}
          aria-describedby={resortNameError ? "resort-name-error" : undefined}
        />
        {resortNameError && (
          <p id="resort-name-error" role="alert" className="text-xs font-semibold text-red-600">
            {resortNameError}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "كود المشروع" : "Project code"}
        </label>
        <input
          type="text"
          value={resortCode}
          onChange={(e) => onResortCodeChange(e.target.value.toUpperCase())}
          placeholder="RES-01"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
          dir="ltr"
        />
        <p className="text-[11px] text-slate-400">
          {isAr
            ? "يتولّد تلقائيًا من اسم المشروع، وتقدر تعدّله"
            : "Auto-generated from the project name — feel free to edit it"}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
          {isAr ? "العملة الافتراضية" : "Default currency"}
        </label>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 px-3.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/10 transition-all"
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code} — {getCurrencyLabel(code, isAr)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
