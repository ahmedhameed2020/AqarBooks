"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { PricingHero } from "./pricing-hero";
import { PricingTierCards } from "./founding-plan-section";
import { PricingScaleMatcher } from "./pricing-scale-matcher";
import { PricingExecutiveComparison } from "./pricing-executive-comparison";
import { PricingCapabilityMatrix } from "./pricing-capability-matrix";
import { PricingMigrationAssurance } from "./pricing-migration-assurance";
import { PricingTrustLayer } from "./pricing-trust-layer";
import { PricingFaqSection } from "./pricing-faq";
import { PricingFinalCta } from "./pricing-final-cta";

interface PricingViewProps {
  locale: Locale;
  foundingSlotsRemaining?: number | null;
}

export function PricingView({ locale, foundingSlotsRemaining }: PricingViewProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");

  return (
    <div className="flex flex-col">
      {/* Zone 01: Hero with value proposition, trust anchors & billing toggle */}
      <PricingHero
        locale={locale}
        billingCycle={billingCycle}
        onBillingCycleChange={setBillingCycle}
      />

      {/* Zone 02: 3-Tier Double-Bezel Cards (Essential, Professional, Enterprise) */}
      <PricingTierCards
        locale={locale}
        billingCycle={billingCycle}
        foundingSlotsRemaining={foundingSlotsRemaining}
      />

      {/* Zone 03: Interactive Multi-Variable Operating Scale Matcher */}
      <PricingScaleMatcher locale={locale} />

      {/* Zone 04: Executive 10-Point Comparison Summary */}
      <PricingExecutiveComparison locale={locale} />

      {/* Zone 05: Expandable 8-Domain Real-Estate Accounting Capability Matrix */}
      <PricingCapabilityMatrix locale={locale} />

      {/* Zone 06: 5-Stage Implementation & Go-Live Migration Assurance */}
      <PricingMigrationAssurance locale={locale} />

      {/* Zone 07: 3 Enterprise Trust & Guarantee Blocks */}
      <PricingTrustLayer locale={locale} />

      {/* Zone 08: CFO & Auditor FAQ Accordion */}
      <PricingFaqSection locale={locale} />

      {/* Zone 09: Double-Bezel Level A Final CTA */}
      <PricingFinalCta locale={locale} />
    </div>
  );
}
