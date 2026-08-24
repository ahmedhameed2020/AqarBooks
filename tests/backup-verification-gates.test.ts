import { describe, it, expect } from "vitest";
import { evaluateRecovery, MANDATORY_GATES, type GateResult } from "@/lib/backup/verification-gates";

function passAll(): GateResult[] {
  return MANDATORY_GATES.map((gate) => ({ gate, passed: true }));
}

describe("evaluateRecovery", () => {
  it("returns VERIFIED_RECOVERY when every mandatory gate passed", () => {
    const { verdict, failedGates } = evaluateRecovery(passAll());
    expect(verdict).toBe("VERIFIED_RECOVERY");
    expect(failedGates).toEqual([]);
  });

  it("returns RESTORE_INVALID when a single gate failed, even if all others passed — no partial credit", () => {
    const results = passAll();
    results[2] = { ...results[2], passed: false, detail: "trial balance delta != 0" };
    const { verdict, failedGates } = evaluateRecovery(results);
    expect(verdict).toBe("RESTORE_INVALID");
    expect(failedGates).toEqual(["ACCOUNTING_INVARIANTS"]);
  });

  it("returns RESTORE_INVALID when a mandatory gate never ran at all (missing, not just failed)", () => {
    const results = passAll().filter((r) => r.gate !== "AUDIT_CHAIN_VERIFICATION");
    const { verdict, failedGates } = evaluateRecovery(results);
    expect(verdict).toBe("RESTORE_INVALID");
    expect(failedGates).toEqual(["AUDIT_CHAIN_VERIFICATION"]);
  });

  it("reports every failed gate, not just the first", () => {
    const results = passAll();
    results[0] = { ...results[0], passed: false };
    results[6] = { ...results[6], passed: false };
    const { verdict, failedGates } = evaluateRecovery(results);
    expect(verdict).toBe("RESTORE_INVALID");
    expect(failedGates.length).toBe(2);
  });

  it("6 of 7 mandatory gates passing is still RESTORE_INVALID, not 'mostly passed'", () => {
    const results = passAll();
    results[results.length - 1] = { ...results[results.length - 1], passed: false };
    expect(evaluateRecovery(results).verdict).toBe("RESTORE_INVALID");
  });
});
