"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { RefreshCw, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { completeOnboarding, type OnboardingState } from "@/lib/actions/onboarding";
import type { Locale } from "@/i18n/routing";
import { EntityTypeStep, type EntityTypeValue } from "./entity-type-step";
import { FirstProjectStep } from "./first-project-step";

const slugify = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);

export function OnboardingWizard({ locale }: { locale: string }) {
  const isAr = locale === "ar";
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    completeOnboarding.bind(null, locale as Locale),
    { ok: true }
  );

  const [step, setStep] = useState<1 | 2>(1);
  const [orgName, setOrgName] = useState("");
  const [entityType, setEntityType] = useState<EntityTypeValue | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [resortName, setResortName] = useState("");
  const [resortCode, setResortCode] = useState("");
  const [resortCodeEdited, setResortCodeEdited] = useState(false);
  const [currency, setCurrency] = useState("EGP");
  const [step1Error, setStep1Error] = useState<string | null>(null);

  // Focus management: when the step changes, move keyboard focus to the
  // first focusable field of the newly-mounted step so a keyboard/screen
  // reader user isn't left on a "Next"/"Back" button that no longer makes
  // sense in the new context. Skipped on first mount so we don't steal
  // focus away from wherever the page (AuthShell, etc.) wants it initially.
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

  function handleResortNameChange(value: string) {
    setResortName(value);
    if (!resortCodeEdited) {
      setResortCode(slugify(value) || "RES-01");
    }
  }

  function handleResortCodeChange(value: string) {
    setResortCodeEdited(true);
    setResortCode(value);
  }

  function handleNext() {
    if (orgName.trim().length < 2) {
      setStep1Error(isAr ? "اسم المؤسسة يجب أن يكون حرفين على الأقل" : "Organization name must be at least 2 characters");
      return;
    }
    if (!entityType) {
      setStep1Error(isAr ? "اختر نوع الكيان" : "Select an entity type");
      return;
    }
    if (entityType === "OTHER" && customLabel.trim().length < 2) {
      setStep1Error(isAr ? "يرجى وصف نوع الكيان" : "Please describe the entity type");
      return;
    }
    setStep1Error(null);
    setStep(2);
  }

  const showFieldError = (field: OnboardingState["field"]) =>
    !state.ok && state.field === field ? state.error : undefined;

  return (
    <form action={formAction} className="space-y-5">
      {!state.ok && !state.field && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-xs font-semibold text-red-700"
        >
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2" aria-label={isAr ? "خطوات التسجيل" : "Onboarding steps"}>
        {[1, 2].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <div
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
                step >= n ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {step > n ? <Check className="size-3.5" /> : n}
            </div>
            {n === 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  step > 1 ? "bg-blue-600" : "bg-slate-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Consolidated hidden inputs -- the only fields the server action actually
          receives. Always mounted regardless of which step is visible, so the
          step components above can be freely unmounted for the entrance
          animation without losing data on submit. */}
      <input type="hidden" name="orgName" value={orgName} />
      <input type="hidden" name="entityType" value={entityType ?? ""} />
      <input type="hidden" name="customLabel" value={customLabel} />
      <input type="hidden" name="resortName" value={resortName} />
      <input type="hidden" name="resortCode" value={resortCode} />
      <input type="hidden" name="currency" value={currency} />

      <div
        key={step}
        ref={stepContainerRef}
        className="animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
      >
        {step === 1 ? (
          <>
            <EntityTypeStep
              isAr={isAr}
              orgName={orgName}
              onOrgNameChange={setOrgName}
              entityType={entityType}
              onEntityTypeChange={setEntityType}
              customLabel={customLabel}
              onCustomLabelChange={setCustomLabel}
              orgNameError={step1Error ?? showFieldError("orgName")}
              customLabelError={showFieldError("customLabel")}
            />

            {step1Error && (
              <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
                {step1Error}
              </p>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isAr ? "التالي" : "Next"}</span>
              {isAr ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
            </button>
          </>
        ) : (
          <>
            <FirstProjectStep
              isAr={isAr}
              resortName={resortName}
              onResortNameChange={handleResortNameChange}
              resortCode={resortCode}
              onResortCodeChange={handleResortCodeChange}
              currency={currency}
              onCurrencyChange={setCurrency}
              resortNameError={showFieldError("resortName")}
            />

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                {isAr ? "رجوع" : "Back"}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
              >
                {pending ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>{isAr ? "جارٍ إنشاء المؤسسة..." : "Creating your organization..."}</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    <span>{isAr ? "إنشاء المؤسسة" : "Create Organization"}</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
