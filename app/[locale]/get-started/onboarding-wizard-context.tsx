"use client";

import { createContext, useContext, useState } from "react";

/**
 * In-memory state for the assisted-onboarding wizard (Company + Plan --
 * Account is no longer part of this context, see below).
 *
 * WHY IN-MEMORY, NOT sessionStorage
 * This provider lives in app/[locale]/get-started/layout.tsx, which stays
 * mounted across client-side navigation between /company, /plan and
 * /review (standard Next.js App Router shared-layout behaviour) -- so plain
 * React state already survives moving between steps without any
 * persistence layer. The tradeoff is a hard refresh loses progress -- every
 * step below Company guards against that by redirecting back to the step
 * whose state is missing, rather than rendering with holes.
 *
 * WHY ACCOUNT IS NOT HELD HERE ANYMORE
 * Step 1 (app/[locale]/get-started/page.tsx +
 * lib/actions/onboarding-request.ts's startOnboardingAccountAction) now
 * ends in a real, signed-in session -- whether that account is brand new or
 * already existed. Every step after that reads the requester's identity
 * from the session (auth.uid()), never from client state, so there is
 * nothing account-shaped left to carry here -- and a password never has to
 * exist in this context or in browser storage at all.
 */

export type EntityType =
  | "DEVELOPER"
  | "FACILITY_MANAGEMENT"
  | "OWNERS_ASSOCIATION"
  | "INDIVIDUAL_OWNER"
  | "TOURIST_RESORT"
  | "TOURIST_VILLAGE"
  | "RESIDENTIAL_COMPOUND"
  | "OTHER";

export type PlanKey = "STARTER" | "PROFESSIONAL" | "ENTERPRISE";

export const PLAN_KEYS: readonly PlanKey[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];

export interface OnboardingCompanyDraft {
  organizationName: string;
  entityType: EntityType | "";
  entityTypeCustomLabel: string;
  country: string;
  city: string;
  expectedPropertiesCount: string;
  expectedUnitsCount: string;
  notes: string;
}

interface OnboardingWizardContextValue {
  company: OnboardingCompanyDraft | null;
  planKey: PlanKey | null;
  setCompany: (draft: OnboardingCompanyDraft) => void;
  setPlanKey: (key: PlanKey) => void;
}

const OnboardingWizardContext = createContext<OnboardingWizardContextValue | null>(null);

export function OnboardingWizardProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<OnboardingCompanyDraft | null>(null);
  const [planKey, setPlanKey] = useState<PlanKey | null>(null);

  return (
    <OnboardingWizardContext.Provider value={{ company, planKey, setCompany, setPlanKey }}>
      {children}
    </OnboardingWizardContext.Provider>
  );
}

export function useOnboardingWizard(): OnboardingWizardContextValue {
  const ctx = useContext(OnboardingWizardContext);
  if (!ctx) {
    throw new Error("useOnboardingWizard must be used within OnboardingWizardProvider");
  }
  return ctx;
}
