/**
 * Restore target safety guard.
 *
 * Phase 1 mandate: "The harness must refuse production targets... The
 * production AqarBooks project must be hard-denied." This module is the
 * single place that decision is made — pure validation, no DB connection,
 * no side effects. Every restore entry point must call
 * `assertRestoreTargetIsSafe` before touching a connection string.
 */

/** AqarBooks / ResortOS production Supabase project ref — hard-denied as a restore target, not configurable. */
export const PRODUCTION_PROJECT_REF = "ataslxkcflxuilpgyepm";

export type EnvironmentClassification =
  | "production"
  | "disposable-non-production"
  | "unclassified";

export interface RestoreTargetDescriptor {
  projectRef: string;
  environmentClassification: EnvironmentClassification;
  /** The operator must explicitly acknowledge this run is validation-only — never implied by defaults. */
  validationModeAcknowledged: boolean;
}

export class ProductionRestoreDeniedError extends Error {
  constructor(projectRef: string) {
    super(
      `Refusing to restore into "${projectRef}" — this is the production AqarBooks project ` +
        `(${PRODUCTION_PROJECT_REF}). Production is hard-denied as a restore target in Phase 1 ` +
        `with no override. There is no configuration flag that changes this.`
    );
    this.name = "ProductionRestoreDeniedError";
  }
}

export class AmbiguousRestoreTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousRestoreTargetError";
  }
}

/**
 * Throws unless the target is positively identified as a disposable
 * non-production environment, with the operator's explicit validation-mode
 * acknowledgment. Every failure mode fails closed: an unclassified target,
 * a missing acknowledgment, and the literal production ref are all refused
 * — there is no default that lets a restore proceed silently.
 */
export function assertRestoreTargetIsSafe(target: RestoreTargetDescriptor): void {
  if (target.projectRef === PRODUCTION_PROJECT_REF) {
    throw new ProductionRestoreDeniedError(target.projectRef);
  }
  if (!target.projectRef || target.projectRef.trim().length === 0) {
    throw new AmbiguousRestoreTargetError(
      "Refusing restore: no target project ref was provided."
    );
  }
  if (target.environmentClassification !== "disposable-non-production") {
    throw new AmbiguousRestoreTargetError(
      `Refusing restore into "${target.projectRef}": environment classification is ` +
        `"${target.environmentClassification}", not the required "disposable-non-production". ` +
        `An environment must be positively classified by the operator before it can be a restore target — ` +
        `it is never inferred from the project's name, status, or any other heuristic.`
    );
  }
  if (!target.validationModeAcknowledged) {
    throw new AmbiguousRestoreTargetError(
      `Refusing restore into "${target.projectRef}": validation-mode was not explicitly acknowledged. ` +
        `This flag must be set deliberately by the operator triggering the restore, never defaulted to true.`
    );
  }
}
