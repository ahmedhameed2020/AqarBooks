import { guardCreateClient } from "../setup/guarded-create-client";

/**
 * Binds every createClient(url) made through a module object to the verified isolated target — for processes that have no
 * vitest module mock, i.e. Playwright workers. Playwright compiles the specs to CommonJS, so `createClient` is read from the
 * module object AT CALL TIME and replacing that property reaches every spec and every helper (tests/e2e/**, tests/helpers/**).
 * It fails closed: if the property cannot be replaced or the replacement is not what the module now exposes, installing throws
 * and the run does not start (there is no state in which a client can be built unguarded and the run goes on).
 */
const MARK = Symbol.for("aqarbooks.supabaseClientGuard");

export type ClientModule = { createClient: unknown };

export function installClientGuard(target: ClientModule, verifyClientUrl: (url: unknown) => void): "installed" | "already-installed" {
  const descriptor = Object.getOwnPropertyDescriptor(target, "createClient");
  if (!descriptor || typeof descriptor.value !== "function") {
    throw new Error("Refusing to run: cannot guard createClient (it is not a plain function property of the module).");
  }
  if ((descriptor.value as unknown as Record<symbol, boolean>)[MARK]) return "already-installed";
  if (!descriptor.writable && !descriptor.configurable) {
    throw new Error("Refusing to run: createClient is read-only, so it cannot be bound to the verified target.");
  }
  const wrapped = guardCreateClient(descriptor.value as (...a: never[]) => unknown, verifyClientUrl) as unknown as Record<symbol, unknown> & (() => unknown);
  wrapped[MARK] = true;
  wrapped[Symbol.for("aqarbooks.supabaseClientGuard.original")] = descriptor.value;
  if (descriptor.writable) (target as { createClient: unknown }).createClient = wrapped;
  else Object.defineProperty(target, "createClient", { ...descriptor, value: wrapped });
  if (target.createClient !== wrapped) throw new Error("Refusing to run: the createClient guard did not take effect.");
  return "installed";
}

/** test helper: put the original function back */
export function uninstallClientGuard(target: ClientModule): void {
  const current = target.createClient as unknown as Record<symbol, unknown>;
  const original = current[Symbol.for("aqarbooks.supabaseClientGuard.original")];
  if (typeof original === "function") (target as { createClient: unknown }).createClient = original;
}
