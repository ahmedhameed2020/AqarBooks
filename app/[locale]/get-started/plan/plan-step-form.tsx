"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useOnboardingWizard, type PlanKey } from "../onboarding-wizard-context";

/**
 * Marketing labels differ from the canonical DB keys on purpose (see
 * components/marketing/pricing/pricing-copy.ts, which calls these same
 * three tiers Essential/Professional/Enterprise) -- the value submitted is
 * always the canonical STARTER/PROFESSIONAL/ENTERPRISE key.
 */
const PLANS: Array<{ key: PlanKey; nameAr: string; nameEn: string; summaryAr: string; summaryEn: string }> = [
  {
    key: "STARTER",
    nameAr: "الأساسيات",
    nameEn: "Essential",
    summaryAr: "لمبنى واحد أو منشأة عقارية مستقلة -- محاسبة كاملة بأساسيات مضبوطة.",
    summaryEn: "For a single building or an independent property -- full double-entry accounting.",
  },
  {
    key: "PROFESSIONAL",
    nameAr: "المتقدمة",
    nameEn: "Professional",
    summaryAr: "لحوكمة متعددة الكيانات، فصل ودائع الصيانة، واعتمادات Maker-Checker.",
    summaryEn: "For multi-entity governance, CAM fund splits, and Maker-Checker approvals.",
  },
  {
    key: "ENTERPRISE",
    nameAr: "المؤسسات",
    nameEn: "Enterprise",
    summaryAr: "للمحافظ الكبرى والقوائم المجمعة -- تسعير وإعداد مخصصان.",
    summaryEn: "For large portfolios and consolidated statements -- custom pricing and setup.",
  },
];

export function PlanStepForm({ locale, initialPlan }: { locale: Locale; initialPlan?: PlanKey }) {
  const isAr = locale === "ar";
  const router = useRouter();
  const { company, planKey, setPlanKey } = useOnboardingWizard();

  useEffect(() => {
    if (!company) {
      router.replace("/get-started/company");
    }
  }, [company, router]);

  const seededPlan = useRef(false);
  useEffect(() => {
    if (!seededPlan.current && !planKey && initialPlan) {
      setPlanKey(initialPlan);
    }
    seededPlan.current = true;
  }, [initialPlan, planKey, setPlanKey]);

  const [selected, setSelected] = useState<PlanKey | null>(planKey ?? initialPlan ?? null);

  if (!company) {
    return null;
  }

  function handleContinue() {
    if (!selected) return;
    setPlanKey(selected);
    router.push("/get-started/review");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {PLANS.map((plan) => {
          const isSelected = selected === plan.key;
          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => setSelected(plan.key)}
              className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-start transition-colors ${
                isSelected
                  ? "border-[#07425d] bg-[#07425d]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <p className="font-bold text-slate-900">{isAr ? plan.nameAr : plan.nameEn}</p>
                <p className="mt-1 text-xs text-slate-600">{isAr ? plan.summaryAr : plan.summaryEn}</p>
              </div>
              {isSelected && (
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#07425d] text-white">
                  <Check className="size-3.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/get-started/company")} className="flex-1">
          {isAr ? "رجوع" : "Back"}
        </Button>
        <Button type="button" onClick={handleContinue} disabled={!selected} className="flex-1">
          {isAr ? "متابعة" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
