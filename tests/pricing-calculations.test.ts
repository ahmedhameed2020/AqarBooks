import { describe, expect, it } from "vitest";
import {
  ESSENTIAL_ANNUAL_MONTHLY_EGP,
  ESSENTIAL_ANNUAL_SAVING_EGP,
  ESSENTIAL_ANNUAL_TOTAL_EGP,
  ESSENTIAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_MONTHLY_EGP,
  PROFESSIONAL_ANNUAL_SAVING_EGP,
  PROFESSIONAL_ANNUAL_TOTAL_EGP,
  PROFESSIONAL_MONTHLY_EGP,
  formatEgp,
} from "../components/marketing/pricing/pricing-data";
import { getPricingCopy } from "../components/marketing/pricing/pricing-copy";

describe("Pricing Calculations & Commercial Consistency", () => {
  it("validates exact 20% annual discount mathematics for Essential tier", () => {
    // Monthly: 1,490
    expect(ESSENTIAL_MONTHLY_EGP).toBe(1490);
    // 12 months at full price: 17,880
    const fullYearEssential = ESSENTIAL_MONTHLY_EGP * 12;
    expect(fullYearEssential).toBe(17880);

    // Annual package: 14,280 (1,190 * 12)
    expect(ESSENTIAL_ANNUAL_MONTHLY_EGP).toBe(1190);
    expect(ESSENTIAL_ANNUAL_TOTAL_EGP).toBe(14280);

    // Annual saving: 17,880 - 14,280 = 3,600
    expect(ESSENTIAL_ANNUAL_SAVING_EGP).toBe(3600);
    const savingPct = (ESSENTIAL_ANNUAL_SAVING_EGP / fullYearEssential) * 100;
    expect(savingPct).toBeGreaterThanOrEqual(20);
    expect(savingPct).toBeLessThan(20.5);
  });

  it("validates exact 20% annual discount mathematics for Professional tier", () => {
    // Monthly: 3,490
    expect(PROFESSIONAL_MONTHLY_EGP).toBe(3490);
    // 12 months at full price: 41,880
    const fullYearPro = PROFESSIONAL_MONTHLY_EGP * 12;
    expect(fullYearPro).toBe(41880);

    // Annual package: 33,480 (2,790 * 12)
    expect(PROFESSIONAL_ANNUAL_MONTHLY_EGP).toBe(2790);
    expect(PROFESSIONAL_ANNUAL_TOTAL_EGP).toBe(33480);

    // Annual saving: 41,880 - 33,480 = 8,400 EGP
    expect(PROFESSIONAL_ANNUAL_SAVING_EGP).toBe(8400);
    const savingPct = (PROFESSIONAL_ANNUAL_SAVING_EGP / fullYearPro) * 100;
    expect(savingPct).toBeGreaterThanOrEqual(20);
    expect(savingPct).toBeLessThan(20.2);
  });

  it("ensures copy file has 8 domains and complete bilingual structure", () => {
    const copyAr = getPricingCopy("ar");
    const copyEn = getPricingCopy("en");

    expect(copyAr.capabilityMatrix.domains.length).toBe(8);
    expect(copyEn.capabilityMatrix.domains.length).toBe(8);

    expect(copyAr.tiers.essential).toBeDefined();
    expect(copyAr.tiers.professional).toBeDefined();
    expect(copyAr.tiers.enterprise).toBeDefined();

    expect(copyAr.faq.items.length).toBeGreaterThanOrEqual(6);
    expect(copyEn.faq.items.length).toBeGreaterThanOrEqual(6);

    // Check "What counts as a unit" is present
    const unitFaqAr = copyAr.faq.items.find(f => f.qAr.includes("وحدة عقارية"));
    expect(unitFaqAr).toBeDefined();
  });
});
