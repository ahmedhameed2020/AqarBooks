/**
 * Storage snapshot completeness state machine — Phase 0 report §25.
 *
 * Replaces "best effort" with an explicit contract: a package can only be
 * treated as fully restorable (COMPLETE_VERIFIED) when every DB-referenced
 * Storage object was captured with a matching checksum. A single failed or
 * mismatched object, once the retry/cutoff window has closed, moves the
 * WHOLE package to FAILED — never a silent partial success.
 */

export type StorageObjectState =
  | "PENDING"
  | "IN_PROGRESS"
  | "CAPTURED"
  | "CAPTURE_FAILED"
  | "CHECKSUM_MISMATCH";

export type PackageStorageState = "COMPLETE_VERIFIED" | "INCOMPLETE" | "FAILED";

/**
 * `cutoffReached` models the retry/cutoff boundary from §25: while capture
 * is still within its retry budget, unresolved objects keep the package
 * INCOMPLETE (transient, not yet a verdict). Once cutoff passes, anything
 * still unresolved or bad makes the package FAILED — permanently, for this
 * snapshot attempt.
 */
export function evaluatePackageStorageState(
  objectStates: readonly StorageObjectState[],
  cutoffReached: boolean
): PackageStorageState {
  const hasFailure = objectStates.some(
    (s) => s === "CAPTURE_FAILED" || s === "CHECKSUM_MISMATCH"
  );
  const hasUnresolved = objectStates.some((s) => s === "PENDING" || s === "IN_PROGRESS");

  if (hasFailure) {
    return cutoffReached ? "FAILED" : "INCOMPLETE";
  }
  if (hasUnresolved) {
    return cutoffReached ? "FAILED" : "INCOMPLETE";
  }
  return "COMPLETE_VERIFIED";
}

/** A package with zero referenced Storage objects is trivially complete — there is nothing to fail. */
export function evaluateEmptyManifestState(): PackageStorageState {
  return evaluatePackageStorageState([], false);
}
