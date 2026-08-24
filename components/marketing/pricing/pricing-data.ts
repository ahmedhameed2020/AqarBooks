import type { Locale } from "@/i18n/routing";

/* ── Authoritative commercial figures ──────────────────────────────────────
   Founding Program, first 10 paying real-estate entities. Every derived
   number below is COMPUTED from these four base values rather than typed a
   second time, so the page can never drift into showing an annual saving
   that does not follow from its own monthly and annual prices.            */

export const MONTHLY_EGP = 3_490;
export const ANNUAL_EGP = 35_880;
export const ONBOARDING_EGP = 2_900;
export const FUTURE_ANCHOR_EGP = 4_990;

export const UNITS_CAPACITY = 500;
export const USERS_CAPACITY = 10;

/** 35,880 / 12 = 2,990 */
export const ANNUAL_MONTHLY_EQUIVALENT_EGP = ANNUAL_EGP / 12;
/** 3,490 x 12 = 41,880 */
export const MONTHLY_ANNUALIZED_EGP = MONTHLY_EGP * 12;
/** 41,880 - 35,880 = 6,000 */
export const ANNUAL_SAVING_EGP = MONTHLY_ANNUALIZED_EGP - ANNUAL_EGP;

/* ── Founding availability ─────────────────────────────────────────────────
   The remaining-slots badge renders ONLY when `FOUNDING_SLOTS_REMAINING` is
   configured on the server with an integer in [1, 10]. A "founding customer"
   means paid and activated -- never a lead, demo, trial or verbal
   commitment -- so nothing in this repo can derive the number on its own.
   No env var, no badge. It is read server-side (not NEXT_PUBLIC_) so the
   value is never bundled into client JS.                                  */

const FOUNDING_PROGRAM_SIZE = 10;

export function getFoundingSlotsRemaining(): number | null {
  const raw = process.env.FOUNDING_SLOTS_REMAINING;
  if (!raw) return null;

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > FOUNDING_PROGRAM_SIZE) return null;

  return parsed;
}

/* ── Number formatting ─────────────────────────────────────────────────────
   Western digits with thousands separators in both locales, matching the
   rest of the marketing site and the app's financial tables.             */

export function formatEgp(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
    numberingSystem: "latn",
  }).format(value);
}
