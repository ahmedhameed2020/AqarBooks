/**
 * Restore verification gates — the decision logic behind
 * VERIFIED_RECOVERY / RESTORE_INVALID.
 *
 * This module holds the pass/fail SEMANTICS only: given a set of gate
 * results (each produced elsewhere, by code that actually queries the
 * restored database), decide the final verdict. It intentionally contains
 * no database access — that keeps the "no partial credit" rule testable in
 * isolation, and keeps this module usable the moment a disposable
 * non-production target exists, without rewriting the decision logic.
 *
 * Mirrors the mandatory gate list from the Phase 0 report §32 (steps 10-16
 * of the owner-approved restore sequence) and the explicit requirement:
 * "No mostly passed." Any missing or failed mandatory gate is
 * RESTORE_INVALID — never a partial or advisory result.
 */

export type GateName =
  | "FULL_FK_INTEGRITY_SWEEP"
  | "CROSS_TENANT_FK_SWEEP"
  | "ACCOUNTING_INVARIANTS"
  | "AUDIT_CHAIN_VERIFICATION"
  | "DOCUMENT_NUMBERING_VERIFICATION"
  | "STORAGE_REFERENCE_VERIFICATION"
  | "SOURCE_VS_RESTORE_RECONCILIATION";

/** Order matches steps 10-16 of the restore sequence in the Phase 0 report §32. */
export const MANDATORY_GATES: readonly GateName[] = [
  "FULL_FK_INTEGRITY_SWEEP",
  "CROSS_TENANT_FK_SWEEP",
  "ACCOUNTING_INVARIANTS",
  "AUDIT_CHAIN_VERIFICATION",
  "DOCUMENT_NUMBERING_VERIFICATION",
  "STORAGE_REFERENCE_VERIFICATION",
  "SOURCE_VS_RESTORE_RECONCILIATION",
];

export interface GateResult {
  gate: GateName;
  passed: boolean;
  /** Free-text diagnostic — required when passed=false, so a RESTORE_INVALID verdict always carries a reason. */
  detail?: string;
}

export type RecoveryVerdict = "VERIFIED_RECOVERY" | "RESTORE_INVALID";

export interface RecoveryEvaluation {
  verdict: RecoveryVerdict;
  /** Every mandatory gate that was missing entirely or reported passed=false. Empty only when verdict is VERIFIED_RECOVERY. */
  failedGates: GateName[];
}

/**
 * Evaluates the final restore verdict. Fails closed on every axis:
 * a gate that never ran counts the same as a gate that ran and failed,
 * and a single failed/missing mandatory gate makes the whole restore
 * RESTORE_INVALID regardless of how many other gates passed — there is no
 * "mostly passed" outcome.
 *
 * Note: audit-chain verification is expected to legitimately report
 * is_valid=false for a Model-B (identity-remapped) restore, per Phase 0
 * §29 — TB&R-001 forbids that model for recovery-grade restores in the
 * first place, so a caller following the owner-approved contract should
 * never be evaluating a Model-B restore here. If one somehow reaches this
 * function, it must still fail this gate — this function does not know or
 * care why a gate failed, only that it did.
 */
export function evaluateRecovery(results: readonly GateResult[]): RecoveryEvaluation {
  const byGate = new Map(results.map((r) => [r.gate, r]));
  const failedGates: GateName[] = [];

  for (const gate of MANDATORY_GATES) {
    const result = byGate.get(gate);
    if (!result || !result.passed) {
      failedGates.push(gate);
    }
  }

  return {
    verdict: failedGates.length === 0 ? "VERIFIED_RECOVERY" : "RESTORE_INVALID",
    failedGates,
  };
}
