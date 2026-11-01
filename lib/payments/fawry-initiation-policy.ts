import "server-only";

export const FAWRY_INITIATION_DISABLED = "FAWRY_INITIATION_DISABLED";

/** V1 has no approved Fawry merchant agreement. No client/env flag enables it.
 * This policy covers initiation only: existing reads and signed settlement
 * deliberately do not call it. Re-enabling requires a reviewed code change.
 */
export function isFawryInitiationAllowed(): boolean {
  return false;
}

export function assertFawryInitiationAllowed(): void {
  if (!isFawryInitiationAllowed()) {
    throw new Error(FAWRY_INITIATION_DISABLED);
  }
}
