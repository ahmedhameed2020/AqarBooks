import { describe, it, expect } from "vitest";
import { runAiCertificationSuite } from "@/lib/ai/eval/eval-runner";
import {
  DEVELOPMENT_EVALUATION_DATASET,
  BLIND_HOLDOUT_EVALUATION_DATASET,
  GOLDEN_EVALUATION_DATASET,
} from "@/lib/ai/eval/golden-dataset";

describe("Phase 3.5 — Pre-Production AI Certification & Quality Regression Suite", () => {
  it("should have both Development and Blind Holdout datasets configured", () => {
    expect(DEVELOPMENT_EVALUATION_DATASET.length).toBeGreaterThanOrEqual(8);
    expect(BLIND_HOLDOUT_EVALUATION_DATASET.length).toBeGreaterThanOrEqual(4);
    expect(GOLDEN_EVALUATION_DATASET.length).toBeGreaterThanOrEqual(12);
  });

  it("should maintain 0 cross-tenant violations across the full test suite", async () => {
    const summary = await runAiCertificationSuite({ mode: "ALL" });
    if (summary.failedCases > 0) {
      console.log("Failed Cases in Full Suite:", summary.results.filter((r) => !r.passed));
    }

    // Auditor Invariant 1: 0 Cross-Tenant violations observed
    expect(summary.crossTenantViolationsCount).toBe(0);
    expect(summary.auditorSecurityVerdict).toContain("0 Cross-Tenant violations observed");

    // Auditor Invariant 2: 100% Security Pass Rate
    expect(summary.securityPassRate).toBe(100);

    // Pass rate >= 90%
    expect(summary.passRatePercentage).toBeGreaterThanOrEqual(90);
  });

  it("should pass the Blind Holdout Set independently during release verification", async () => {
    const holdoutSummary = await runAiCertificationSuite({ mode: "HOLDOUT" });
    if (holdoutSummary.failedCases > 0) {
      console.log("Failed Blind Holdout Cases:", holdoutSummary.results.filter((r) => !r.passed));
    }

    expect(holdoutSummary.crossTenantViolationsCount).toBe(0);
    expect(holdoutSummary.passRatePercentage).toBeGreaterThanOrEqual(90);
    expect(holdoutSummary.provenance.deploymentSha).toBeDefined();
  });
});
