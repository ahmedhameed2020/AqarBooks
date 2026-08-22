"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Building,
  Rocket,
  ShieldAlert,
} from "lucide-react";
import { completeOnboarding, type OnboardingState } from "@/lib/actions/onboarding";
import type { Locale } from "@/i18n/routing";
import { SUPPORTED_COUNTRIES, type CountryInfo } from "@/lib/countries";
import { CountryStep } from "./country-step";
import { EntityTypeStep, ENTITY_TYPE_OPTIONS, type EntityTypeValue } from "./entity-type-step";
import { FirstProjectStep } from "./first-project-step";

const slugify = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);

// Fields that may be rejected by the server action
const STEP_ORG_FIELDS = ["orgName", "entityType", "customLabel"] as const;

export function OnboardingWizard({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding.bind(null, locale as Locale),
    { ok: true }
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("EG");
  const [currency, setCurrency] = useState<string>("EGP");
  const [orgName, setOrgName] = useState("");
  const [entityType, setEntityType] = useState<EntityTypeValue | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [resortName, setResortName] = useState("");
  const [resortCode, setResortCode] = useState("");
  const [resortCodeEdited, setResortCodeEdited] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Focus management when step changes
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const target = stepContainerRef.current?.querySelector<HTMLElement>(
      "input, select, textarea, button"
    );
    target?.focus();
  }, [step]);

  // If server rejects step-2 fields, navigate back to step 2
  useEffect(() => {
    if (
      !state.ok &&
      state.field &&
      (STEP_ORG_FIELDS as readonly string[]).includes(state.field) &&
      step === 3
    ) {
      setStep(2);
    }
  }, [state, step]);

  function handleSelectCountry(country: CountryInfo) {
    setSelectedCountryCode(country.code);
    setCurrency(country.defaultCurrency);
    setValidationError(null);
  }

  function handleResortNameChange(value: string) {
    setResortName(value);
    if (!resortCodeEdited) {
      setResortCode(slugify(value) || "PRJ-01");
    }
  }

  function handleResortCodeChange(value: string) {
    setResortCodeEdited(true);
    setResortCode(value);
  }

  function handleNext() {
    setValidationError(null);

    if (step === 1) {
      if (!selectedCountryCode) {
        setValidationError(isAr ? "يرجى اختيار الدولة للمتابعة" : "Please select a country to proceed");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (orgName.trim().length < 2) {
        setValidationError(
          isAr
            ? "اسم المنشأة يجب أن يكون حرفين على الأقل"
            : "Organization name must be at least 2 characters"
        );
        return;
      }
      if (!entityType) {
        setValidationError(
          isAr ? "يرجى اختيار نوع النشاط العقاري" : "Please select an entity type"
        );
        return;
      }
      if (entityType === "OTHER" && customLabel.trim().length < 2) {
        setValidationError(
          isAr ? "يرجى كتابة وصف النشاط المخصص" : "Please describe your custom entity type"
        );
        return;
      }
      setStep(3);
      return;
    }
  }

  function handleBack() {
    setValidationError(null);
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }

  const selectedEntityOption = ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType);
  const entityTypeLabel = selectedEntityOption
    ? isAr
      ? selectedEntityOption.ar
      : selectedEntityOption.en
    : "";

  const stepsConfig = [
    { num: 1, labelAr: "الدولة والعملة", labelEn: "Country & Currency", icon: Globe },
    { num: 2, labelAr: "بيانات المنشأة", labelEn: "Organization", icon: Building },
    { num: 3, labelAr: "المشروع الأول", labelEn: "First Project", icon: Rocket },
  ];

  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const NextIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      {/* Modern High-End Stepper */}
      <nav aria-label={isAr ? "خطوات التهيئة" : "Onboarding steps"} className="w-full">
        <ol className="flex items-center justify-between gap-2">
          {stepsConfig.map((s, idx) => {
            const Icon = s.icon;
            const isCompleted = step > s.num;
            const isCurrent = step === s.num;
            return (
              <li key={s.num} className="flex-1">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex w-full items-center">
                    {/* Connecting line before (if not first) */}
                    {idx > 0 && (
                      <div
                        className={`h-0.5 flex-1 transition-colors duration-300 ${
                          step >= s.num ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      />
                    )}

                    {/* Step Icon Badge */}
                    <div
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300 ${
                        isCompleted
                          ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                          : isCurrent
                          ? "border-blue-600 bg-white text-blue-600 shadow-md ring-4 ring-blue-600/10"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="size-4 stroke-[3]" />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>

                    {/* Connecting line after (if not last) */}
                    {idx < stepsConfig.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 transition-colors duration-300 ${
                          step > s.num ? "bg-blue-600" : "bg-slate-200"
                        }`}
                      />
                    )}
                  </div>

                  {/* Step Label */}
                  <span
                    className={`text-[11px] font-bold transition-colors ${
                      isCurrent
                        ? "text-blue-900"
                        : isCompleted
                        ? "text-slate-700"
                        : "text-slate-400"
                    }`}
                  >
                    {isAr ? s.labelAr : s.labelEn}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Validation & Server Error Banner */}
      {(validationError || (!state.ok && state.error)) && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs font-semibold text-red-800 text-start animate-in fade-in duration-200"
        >
          <ShieldAlert className="size-4 shrink-0 text-red-600 mt-0.5" />
          <span>{validationError || state.error}</span>
        </div>
      )}

      {/* Main Wizard Form */}
      <form action={formAction} className="space-y-6">
        {/* Hidden inputs to guarantee all fields are submitted reliably */}
        <input type="hidden" name="currency" value={currency} />
        <input type="hidden" name="orgName" value={orgName} />
        <input type="hidden" name="entityType" value={entityType || ""} />
        {entityType === "OTHER" && (
          <input type="hidden" name="customLabel" value={customLabel} />
        )}
        <input type="hidden" name="resortName" value={resortName} />
        <input type="hidden" name="resortCode" value={resortCode} />

        <div ref={stepContainerRef}>
          {step === 1 && (
            <CountryStep
              isAr={isAr}
              selectedCountryCode={selectedCountryCode}
              onSelectCountry={handleSelectCountry}
              currency={currency}
              onCurrencyChange={setCurrency}
            />
          )}

          {step === 2 && (
            <EntityTypeStep
              isAr={isAr}
              selectedCountryCode={selectedCountryCode}
              orgName={orgName}
              onOrgNameChange={setOrgName}
              entityType={entityType}
              onEntityTypeChange={setEntityType}
              customLabel={customLabel}
              onCustomLabelChange={setCustomLabel}
              orgNameError={!state.ok && state.field === "orgName" ? state.error : undefined}
              customLabelError={
                !state.ok && state.field === "customLabel" ? state.error : undefined
              }
            />
          )}

          {step === 3 && (
            <FirstProjectStep
              isAr={isAr}
              selectedCountryCode={selectedCountryCode}
              orgName={orgName}
              entityTypeLabel={entityTypeLabel}
              resortName={resortName}
              onResortNameChange={handleResortNameChange}
              resortCode={resortCode}
              onResortCodeChange={handleResortCodeChange}
              currency={currency}
              resortNameError={
                !state.ok && state.field === "resortName" ? state.error : undefined
              }
            />
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:opacity-50 transition-all cursor-pointer"
            >
              <BackIcon className="size-4" />
              <span>{isAr ? "السابق" : "Back"}</span>
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/30 transition-all cursor-pointer"
            >
              <span>{isAr ? "التالي: بيانات المنشأة" : "Next Step"}</span>
              <NextIcon className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/30 disabled:opacity-50 transition-all cursor-pointer"
            >
              {pending ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  <span>{isAr ? "جاري تهيئة منظومتك..." : "Setting up workspace..."}</span>
                </>
              ) : (
                <>
                  <Rocket className="size-4" />
                  <span>{isAr ? "تأكيد وبدء تشغيل المنظومة" : "Launch Workspace"}</span>
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
