import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateIsolation, type IsolationInput, type Probes } from "./helpers/isolated-target";

/**
 * NEGATIVE tests for the isolation gate: every way a run could miss the isolated stack, or point its API at one database
 * and its SQL at another, or land on the development stack, must be refused BEFORE any write (the gate is evaluated
 * before the first client is built; see also isolated-target-negative-runs.test.ts for real child runs).
 * Pure: environment, config files and the live probes are injected.
 */
const REPO = "D:/Web/AqarBooks";
const STACK = "C:/tmp/aqarbooks-clean-stack";
const STACK_TOML = 'project_id = "aqarbooks_clean"\n\n[api]\nenabled = true\nport = 55321\n';
const DEV_TOML = 'project_id = "aqarbooks"\n';
const goodEnv = {
  LOCAL_SUPABASE_API_PORTS: "55321",
  SUPABASE_WORKDIR: STACK,
  LOCAL_DB_CONTAINER: "supabase_db_aqarbooks_clean",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  SUPABASE_SERVICE_ROLE_KEY: "k",
};
const goodProbes: Probes = {
  latestSqlUser: () => ({ id: "u1", email: "a@x.test" }),
  apiUser: () => ({ status: 200, email: "A@x.test" }),
  apiFirstPageCount: () => 0,
};
const files: Record<string, string> = { [`${STACK}/supabase/config.toml`]: STACK_TOML, [`${REPO}/supabase/config.toml`]: DEV_TOML };
const run = (over: Partial<IsolationInput> & { env?: Record<string, string | undefined>; files?: Record<string, string> } = {}) =>
  evaluateIsolation({
    env: { ...goodEnv, ...(over.env ?? {}) },
    repoRoot: REPO,
    readFile: (p) => (over.files ?? files)[p.replace(/\\/g, "/")] ?? null,
    probes: over.probes ?? goodProbes,
  });
const refused = (r: ReturnType<typeof run>, check: string, reason: RegExp) => {
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.check).toBe(check);
    expect(r.reason).toMatch(reason);
  }
};

describe("isolated-stack gate: accepts exactly the verified isolated stack", () => {
  it("accepts a fully configured, consistent, same-database setup", () => {
    const r = run();
    expect(r).toMatchObject({ ok: true, project: "aqarbooks_clean", container: "supabase_db_aqarbooks_clean", apiPort: "55321" });
  });
  it("accepts an empty database that is empty through both paths", () => {
    expect(run({ probes: { ...goodProbes, latestSqlUser: () => null, apiFirstPageCount: () => 0 } }).ok).toBe(true);
  });
});

describe("refused: the isolated stack is not configured (no fallback to development)", () => {
  for (const [name, key] of [
    ["no opted-in API port", "LOCAL_SUPABASE_API_PORTS"],
    ["no SUPABASE_WORKDIR (supabase status would resolve to development)", "SUPABASE_WORKDIR"],
    ["no LOCAL_DB_CONTAINER (SQL helpers would have no container)", "LOCAL_DB_CONTAINER"],
    ["no API URL", "NEXT_PUBLIC_SUPABASE_URL"],
    ["no service key", "SUPABASE_SERVICE_ROLE_KEY"],
  ] as const) {
    it(name, () => refused(run({ env: { [key]: undefined } }), "configured", /not set|no default/i));
  }
  it("everything missing at once", () => {
    expect(evaluateIsolation({ env: {}, repoRoot: REPO, readFile: () => null, probes: goodProbes }).ok).toBe(false);
  });
  it("a workdir without a stack config", () => refused(run({ files: { [`${REPO}/supabase/config.toml`]: DEV_TOML } }), "configured", /config\.toml/));
  it("an opted-in port list that does not include the API port", () => refused(run({ env: { LOCAL_SUPABASE_API_PORTS: "55999" } }), "configured", /does not include 55321/));
});

describe("refused: the target is the development stack", () => {
  it("the workdir is the repository itself", () => refused(run({ env: { SUPABASE_WORKDIR: REPO }, files: { ...files, [`${REPO}/supabase/config.toml`]: STACK_TOML } }), "not-development", /repository itself/));
  it("the stack's project is the development project", () => refused(run({ files: { ...files, [`${STACK}/supabase/config.toml`]: 'project_id = "aqarbooks"\n[api]\nport = 54321\n' } }), "not-development", /development project/));
  it("the SQL container is the development container", () => refused(run({ env: { LOCAL_DB_CONTAINER: "supabase_db_aqarbooks" } }), "not-development", /development database container/));
  it("the API port is the development stack's 54321", () => refused(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", LOCAL_SUPABASE_API_PORTS: "54321,55321" } }), "not-development", /54321/));
  it("a hosted or non-loopback API", () => {
    refused(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" } }), "not-development", /not loopback http/);
    refused(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://10.0.0.5:55321" } }), "not-development", /not loopback http/);
  });
});

describe("refused: the API target differs from the SQL container", () => {
  it("container of another project than the workdir's stack", () => refused(run({ env: { LOCAL_DB_CONTAINER: "supabase_db_someone_else" } }), "same-stack", /different databases/));
  it("API port that is not the workdir stack's API port", () => refused(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55399", LOCAL_SUPABASE_API_PORTS: "55321,55399" } }), "same-stack", /not the stack's API port/));
});

describe("refused: the live fingerprint says API and SQL are different databases", () => {
  it("the newest SQL user does not exist through the API", () =>
    refused(run({ probes: { ...goodProbes, apiUser: () => ({ status: 404, email: null }) } }), "same-database", /not found through the API/));
  it("the user exists but with another email", () =>
    refused(run({ probes: { ...goodProbes, apiUser: () => ({ status: 200, email: "someone-else@x.test" }) } }), "same-database", /different databases/));
  it("SQL is empty but the API has users", () =>
    refused(run({ probes: { ...goodProbes, latestSqlUser: () => null, apiFirstPageCount: () => 1 } }), "same-database", /no auth users/));
  it("SQL is empty and the API errors", () =>
    refused(run({ probes: { ...goodProbes, latestSqlUser: () => null, apiFirstPageCount: () => null } }), "same-database", /error/));
});

describe("no test source can bring the development fallback back", () => {
  const skip = new Set(["isolated-target.ts", "isolated-target-guard.test.ts", "isolated-target-negative-runs.test.ts"]);
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "node_modules") walk(p); continue; }
      if (/\.(ts|tsx|mjs)$/.test(name) && !skip.has(name)) sources.push(p);
    }
  };
  walk(join(process.cwd(), "tests"));
  walk(join(process.cwd(), "scripts", "demo-local"));
  sources.push(join(process.cwd(), "playwright.config.ts"));

  it("no file names the development container, or defaults the container with ??", () => {
    const offenders = sources.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /["'`]supabase_db_aqarbooks["'`]/.test(text) || /LOCAL_DB_CONTAINER\s*\?\?/.test(text);
    });
    expect(offenders).toEqual([]);
  });
  it("every file that runs SQL through docker asks the verified helper for the container", () => {
    const rawDocker = sources.filter((f) => {
      const text = readFileSync(f, "utf8");
      return /execFile(Sync)?\(\s*["']docker["']\s*,\s*\[\s*["']exec["']/.test(text) && !/isolatedDbContainer\(\)/.test(text) && !/stackEnv|supabase_db_aqarbooks_clean|DB_CONTAINER/.test(text);
    });
    expect(rawDocker).toEqual([]);
    // DB_CONTAINER (scripts/demo-local/lib.mjs) is acceptable only because lib.mjs refuses the development project and port
    const lib = readFileSync(join(process.cwd(), "scripts", "demo-local", "lib.mjs"), "utf8");
    expect(lib).toMatch(/PROJECT_ID === "aqarbooks"/);
    expect(lib).toMatch(/API_PORT === 54321/);
    expect(lib).toMatch(/export const DB_CONTAINER = `supabase_db_\$\{PROJECT_ID\}`/);
  });
  it("the Supabase CLI default port is not a built-in test target", () => {
    const text = readFileSync(join(process.cwd(), "tests", "helpers", "local-target.ts"), "utf8");
    expect(text).toMatch(/DEFAULT_LOCAL_PORTS = \["1"\]/);
  });
});
