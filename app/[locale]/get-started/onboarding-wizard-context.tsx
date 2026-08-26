"use client";

import { createContext, useContext, useState } from "react";

/**
 * In-memory state for the four-step assisted-onboarding wizard.
 *
 * WHY IN-MEMORY, NOT sessionStorage
 * This provider lives in app/[locale]/get-started/layout.tsx, which stays
 * mounted across client-side navigation between /get-started, /company,
 * /plan and /review (standard Next.js App Router shared-layout behaviour) --
 * so plain React state already survives moving between steps without any
 * persistence layer. The account step collects a password; never writing it
 * to sessionStorage/localStorage means it never touches browser storage in
 * plaintext. The tradeoff is a hard refresh loses progress -- every step
 * below Account guards against that by redirecting back to the step whose
 * state is missing, rather than rendering with holes.
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

export interface OnboardingAccountDraft {
  fullName: string;
  workEmail: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

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
  account: OnboardingAccountDraft | null;
  company: OnboardingCompanyDraft | null;
  planKey: PlanKey | null;
  setAccount: (draft: OnboardingAccountDraft) => void;
  setCompany: (draft: OnboardingCompanyDraft) => void;
  setPlanKey: (key: PlanKey) => void;
}

const OnboardingWizardContext = createContext<OnboardingWizardContextValue | null>(null);

export function OnboardingWizardProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<OnboardingAccountDraft | null>(null);
  const [company, setCompany] = useState<OnboardingCompanyDraft | null>(null);
  const [planKey, setPlanKey] = useState<PlanKey | null>(null);

  return (
    <OnboardingWizardContext.Provider value={{ account, company, planKey, setAccount, setCompany, setPlanKey }}>
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
