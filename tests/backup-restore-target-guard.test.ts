import { describe, it, expect } from "vitest";
import {
  assertRestoreTargetIsSafe,
  ProductionRestoreDeniedError,
  AmbiguousRestoreTargetError,
  PRODUCTION_PROJECT_REF,
} from "@/lib/backup/restore-target-guard";

const validNonProdTarget = {
  projectRef: "some-disposable-scratch-ref",
  environmentClassification: "disposable-non-production" as const,
  validationModeAcknowledged: true,
};

describe("assertRestoreTargetIsSafe", () => {
  it("passes for a positively-classified, acknowledged, non-production target", () => {
    expect(() => assertRestoreTargetIsSafe(validNonProdTarget)).not.toThrow();
  });

  it("hard-denies the literal production project ref, unconditionally", () => {
    expect(() =>
      assertRestoreTargetIsSafe({
        projectRef: PRODUCTION_PROJECT_REF,
        environmentClassification: "disposable-non-production",
        validationModeAcknowledged: true,
      })
    ).toThrow(ProductionRestoreDeniedError);
  });

  it("refuses an empty project ref", () => {
    expect(() =>
      assertRestoreTargetIsSafe({ ...validNonProdTarget, projectRef: "" })
    ).toThrow(AmbiguousRestoreTargetError);
  });

  it("refuses a target classified as production even under a different ref", () => {
    expect(() =>
      assertRestoreTargetIsSafe({
        ...validNonProdTarget,
        environmentClassification: "production",
      })
    ).toThrow(AmbiguousRestoreTargetError);
  });

  it("refuses an unclassified target — no default assumption of safety", () => {
    expect(() =>
      assertRestoreTargetIsSafe({
        ...validNonProdTarget,
        environmentClassification: "unclassified",
      })
    ).toThrow(AmbiguousRestoreTargetError);
  });

  it("refuses when validation mode is not explicitly acknowledged", () => {
    expect(() =>
      assertRestoreTargetIsSafe({ ...validNonProdTarget, validationModeAcknowledged: false })
    ).toThrow(AmbiguousRestoreTargetError);
  });
});
