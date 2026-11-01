import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateClientTarget, evaluateIsolation, type Probes } from "./helpers/isolated-target";
import { installClientGuard, uninstallClientGuard } from "./helpers/install-client-guard";

/**
 * The Playwright side of "every createClient(url) is bound to the verified target". Simulated: a fake module whose constructor and
 * a fake fetch are spies; the refusals must happen BEFORE the original constructor is called and before any request is sent.
 * (tests/isolated-target-negative-runs.test.ts runs the same refusals in real child Playwright processes.)
 */
const REPO = "D:/Web/AqarBooks";
const STACK = "C:/tmp/aqarbooks-clean-stack";
const files: Record<string, string> = {
  [`${STACK}/supabase/config.toml`]: 'project_id = "aqarbooks_clean"\n[api]\nport = 55321\n',
  [`${REPO}/supabase/config.toml`]: 'project_id = "aqarbooks"\n',
};
const goodEnv = { LOCAL_SUPABASE_API_PORTS: "55321", SUPABASE_WORKDIR: STACK, LOCAL_DB_CONTAINER: "supabase_db_aqarbooks_clean", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_SERVICE_ROLE_KEY: "k" };
const probes: Probes = { latestSqlUser: () => ({ id: "u", email: "a@x.test" }), apiUser: () => ({ status: 200, email: "a@x.test" }), apiFirstPageCount: () => 0 };
const verified = () => {
  const r = evaluateIsolation({ env: goodEnv, repoRoot: REPO, readFile: (p) => files[p.replaceAll("\\", "/")] ?? null, probes });
  if (!r.ok) throw new Error("fixture must be valid");
  return r;
};
const verify = (url: unknown) => {
  const r = evaluateClientTarget(url, verified().apiPort, ["54321"]);
  if (!r.ok) throw new Error(`Refusing to run (isolation check "${r.check}"): ${r.reason}`);
};

let original: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;
let fake: { createClient: unknown };

beforeEach(() => {
  original = vi.fn(() => ({ client: true }));
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubEnv("LOCAL_SUPABASE_API_PORTS", "55321,55421");
  fake = { createClient: original };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("installing the guard on a Playwright-style module object", () => {
  it("refuses the development URL, a listed development port, another stack and a hosted URL BEFORE the constructor and before any request", () => {
    expect(installClientGuard(fake, verify)).toBe("installed");
    const create = fake.createClient as (url: string, key: string) => unknown;
    vi.stubEnv("LOCAL_SUPABASE_API_PORTS", "55321,54321,55421");
    for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://127.0.0.1:55421", "https://abc.supabase.co", "http://10.1.2.3:55321"]) {
      expect(() => create(url, "key"), url).toThrow();
    }
    expect(original).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("lets exactly the verified target (and the dummy port 1) through to the original constructor, once per call", () => {
    installClientGuard(fake, verify);
    const create = fake.createClient as (url: string, key: string) => unknown;
    create("http://127.0.0.1:55321", "key");
    create("http://localhost:55321", "key");
    create("http://127.0.0.1:1", "key");
    expect(original).toHaveBeenCalledTimes(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("installing twice (main process + worker, or a re-import) does not nest wrappers", () => {
    expect(installClientGuard(fake, verify)).toBe("installed");
    const once = fake.createClient;
    expect(installClientGuard(fake, verify)).toBe("already-installed");
    expect(fake.createClient).toBe(once);
    (fake.createClient as (u: string, k: string) => unknown)("http://127.0.0.1:55321", "key");
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("fails closed: a module whose createClient cannot be replaced (or is not a function) stops the run at install time", () => {
    const frozen = Object.freeze({ createClient: original });
    expect(() => installClientGuard(frozen, verify)).toThrow(/read-only|cannot be bound/);
    expect(() => installClientGuard({ createClient: 5 }, verify)).toThrow(/cannot guard/);
    expect(() => installClientGuard({} as never, verify)).toThrow(/cannot guard/);
    expect(original).not.toHaveBeenCalled();
  });

  it("a getter-only (non-configurable) property is refused too, not silently skipped", () => {
    const m = {} as { createClient: unknown };
    Object.defineProperty(m, "createClient", { get: () => original, enumerable: true, configurable: false });
    expect(() => installClientGuard(m, verify)).toThrow(/cannot guard/);
  });
});

describe("the real @supabase/supabase-js CommonJS module that Playwright specs load", () => {
  it("exposes a replaceable createClient, and once guarded refuses the development URL without calling the real constructor", () => {
    const real = createRequire(import.meta.url)("@supabase/supabase-js") as ClientModule;
    const before = real.createClient;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(real, "createClient");
      expect(descriptor?.writable || descriptor?.configurable, "createClient must be replaceable for the Playwright guard to work").toBe(true);
      expect(installClientGuard(real, verify)).toMatch(/installed/);
      expect(() => (real.createClient as (u: string, k: string) => unknown)("http://127.0.0.1:54321", "key")).toThrow(/Refusing to run/);
      expect(() => (real.createClient as (u: string, k: string) => unknown)("https://abc.supabase.co", "key")).toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      uninstallClientGuard(real);
      expect(real.createClient).toBe(before);
    }
  });
});

type ClientModule = { createClient: unknown };
