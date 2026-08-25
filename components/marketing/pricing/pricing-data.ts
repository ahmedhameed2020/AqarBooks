import type { Locale } from "@/i18n/routing";

/* ── Authoritative Commercial Pricing Constants ───────────────────────────────
   Essential:
     Monthly: 1,490 EGP
     Annual:  14,280 EGP (1,190 EGP/mo equivalent)
     Saving:   3,600 EGP/year (1,490 * 12 - 14,280 = 3,600)
     Badge:   Save 20%

   Professional (Founding Customer Program):
     Monthly: 3,490 EGP
     Annual:  33,480 EGP (2,790 EGP/mo equivalent)
     Saving:   8,400 EGP/year (3,490 * 12 - 33,480 = 8,400)
     Badge:   Save 20%

   Enterprise:
     Tailored annual contract & custom operating scale                        */

// Essential Tier
export const ESSENTIAL_MONTHLY_EGP = 1_490;
export const ESSENTIAL_ANNUAL_MONTHLY_EGP = 1_190;
export const ESSENTIAL_ANNUAL_TOTAL_EGP = 14_280;
export const ESSENTIAL_ANNUAL_SAVING_EGP = (ESSENTIAL_MONTHLY_EGP * 12) - ESSENTIAL_ANNUAL_TOTAL_EGP; // 3,600 EGP
export const ESSENTIAL_UNITS_CAPACITY = 100;
export const ESSENTIAL_USERS_CAPACITY = 3;

// Professional Tier (Flagship Launch / Founding Cohort)
export const PROFESSIONAL_MONTHLY_EGP = 3_490;
export const PROFESSIONAL_ANNUAL_MONTHLY_EGP = 2_790;
export const PROFESSIONAL_ANNUAL_TOTAL_EGP = 33_480;
export const PROFESSIONAL_ANNUAL_SAVING_EGP = (PROFESSIONAL_MONTHLY_EGP * 12) - PROFESSIONAL_ANNUAL_TOTAL_EGP; // 8,400 EGP
export const PROFESSIONAL_UNITS_CAPACITY = 500;
export const PROFESSIONAL_USERS_CAPACITY = 10;
export const PROFESSIONAL_FUTURE_ANCHOR_EGP = 4_990;

// Founding Program Cohort Limit
export const FOUNDING_COHORT_SIZE = 10;

// Onboarding Package (Setup, Data Migration & Verification)
export const ONBOARDING_STANDARD_EGP = 2_900;

export function getFoundingSlotsRemaining(): number | null {
  const raw = process.env.FOUNDING_SLOTS_REMAINING;
  if (!raw) return null;

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > FOUNDING_COHORT_SIZE) return null;

  return parsed;
}

export function formatEgp(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
    numberingSystem: "latn",
  }).format(value);
}

