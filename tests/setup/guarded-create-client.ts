import { assertKnownLocalSupabaseUrl } from "../helpers/local-target";

/**
 * Wraps the real createClient so that every client is checked BEFORE the original constructor is called (hence before any
 * request can be made). `verifyClientUrl` is `assertClientUrlIsVerifiedTarget` in the vitest setup; tests inject a stub.
 */
export function guardCreateClient<F extends (...a: never[]) => unknown>(actual: F, verifyClientUrl: (url: unknown) => void): F {
  return ((url: unknown, ...rest: unknown[]) => {
    assertKnownLocalSupabaseUrl(url);
    verifyClientUrl(url); // refuses the development port, other stacks, anything but the verified isolated target (port 1 stays the dummy)
    return (actual as unknown as (...a: unknown[]) => unknown)(url, ...rest);
  }) as unknown as F;
}
