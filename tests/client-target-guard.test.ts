import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateClientTarget, evaluateIsolation, type Probes } from "./helpers/isolated-target";
import { guardCreateClient } from "./setup/guarded-create-client";
import { isKnownLocalSupabaseUrl } from "./helpers/local-target";

/**
 * Every createClient(url) must be bound to the target that assertIsolatedStack verified. Simulated only: the "original
 * constructor" and global fetch are spies, and the tests prove the refusal happens BEFORE either is touched. Nothing here
 * contacts, let alone writes to, any database.
 */
const REPO = "D:/Web/AqarBooks";
const STACK = "C:/tmp/aqarbooks-clean-stack";
const goodEnv = { LOCAL_SUPABASE_API_PORTS: "55321", SUPABASE_WORKDIR: STACK, LOCAL_DB_CONTAINER: "supabase_db_aqarbooks_clean", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321", SUPABASE_SERVICE_ROLE_KEY: "k" };
const files: Record<string, string> = { [`${STACK}/supabase/config.toml`]: 'project_id = "aqarbooks_clean"\n[api]\nport = 55321\n', [`${REPO}/supabase/config.toml`]: 'project_id = "aqarbooks"\n' };
const probes: Probes = { latestSqlUser: () => ({ id: "u", email: "a@x.test" }), apiUser: () => ({ status: 200, email: "a@x.test" }), apiFirstPageCount: () => 0 };
/** a CORRECT clean-stack environment, verified by the real gate logic (pure inputs) */
const verified = () => {
  const r = evaluateIsolation({ env: goodEnv, repoRoot: REPO, readFile: (p) => files[p.replaceAll("\\", "/")] ?? null, probes });
  if (!r.ok) throw new Error("fixture must be a valid isolated environment");
  return r;
};
const verify = (url: unknown) => {
  const v = verified();
  const r = evaluateClientTarget(url, v.apiPort, ["54321"]);
  if (!r.ok) throw new Error(`Refusing to run (isolation check "${r.check}"): ${r.reason}`);
};

afterEach(() => vi.unstubAllEnvs());

function harness(listedPorts: string) {
  vi.stubEnv("LOCAL_SUPABASE_API_PORTS", listedPorts);
  const original = vi.fn(() => ({ client: true }));
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  return { original, fetchSpy, create: guardCreateClient(original as unknown as (url: string) => unknown, verify) as (url: string, ...r: unknown[]) => unknown };
}

describe("createClient is bound to the verified isolated target", () => {
  it("refuses a client whose URL points at the development stack although the environment itself is a correct clean-stack one", () => {
    const h = harness("55321");
    expect(verified().apiPort).toBe("55321"); // the environment is valid
    expect(() => h.create("http://127.0.0.1:54321", "key")).toThrow(/not a known local|development stack/i);
    expect(h.original).not.toHaveBeenCalled();
    expect(h.fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses the development port even when it was added to the allowed-port list", () => {
    const h = harness("55321,54321");
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:54321")).toBe(false); // the list itself no longer admits it
    expect(() => h.create("http://127.0.0.1:54321", "key")).toThrow();
    expect(evaluateClientTarget("http://127.0.0.1:54321", "55321", ["54321"])).toMatchObject({ ok: false, check: "client-target" });
    expect(h.original).not.toHaveBeenCalled();
    expect(h.fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses another stack's URL even if its port is listed, before the constructor", () => {
    const h = harness("55321,55421");
    expect(isKnownLocalSupabaseUrl("http://127.0.0.1:55421")).toBe(true); // passes the old allow-list check ...
    expect(() => h.create("http://127.0.0.1:55421", "key")).toThrow(/not the verified isolated stack/); // ... but not the binding
    expect(h.original).not.toHaveBeenCalled();
    expect(h.fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses hosted and non-loopback URLs before the constructor", () => {
    const h = harness("55321");
    for (const u of ["https://abc.supabase.co", "http://10.0.0.5:55321", "http://user:pw@127.0.0.1:55321"]) expect(() => h.create(u, "key")).toThrow();
    expect(h.original).not.toHaveBeenCalled();
    expect(h.fetchSpy).not.toHaveBeenCalled();
  });

  it("accepts exactly the verified target and the dummy port 1 (unit runs)", () => {
    const h = harness("55321");
    h.create("http://127.0.0.1:55321", "key");
    h.create("http://localhost:55321", "key");
    h.create("http://127.0.0.1:1", "key");
    expect(h.original).toHaveBeenCalledTimes(3);
    expect(h.fetchSpy).not.toHaveBeenCalled(); // the wrapper itself never sends anything
  });
});

describe("evaluateClientTarget (pure)", () => {
  it.each([
    ["http://127.0.0.1:54321", /development stack/],
    ["http://127.0.0.1:55999", /not the verified/],
    ["not a url", /not a URL/],
    ["https://127.0.0.1:55321", /not loopback http/],
  ])("%s is refused", (url, reason) => {
    const r = evaluateClientTarget(url, "55321", ["54321"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });
  it("also refuses the repository's own configured API port", () => {
    expect(evaluateClientTarget("http://127.0.0.1:54399", "55321", ["54321", "54399"]).ok).toBe(false);
  });
});
