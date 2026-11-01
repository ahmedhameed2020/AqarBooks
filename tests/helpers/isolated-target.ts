/**
 * Isolation gate for every test that can WRITE (users, organizations, rows).
 *
 * Why it exists: several suites resolve their target with `supabase status` run from the repository, which is the
 * DEVELOPMENT stack, and/or hard-coded the development container name. Run without the isolated stack they silently wrote
 * test data into the development database; run half-configured they sent API calls to one database and SQL to another.
 * There is no automatic fallback to the development target any more. Before the first write a run must prove ALL of:
 *
 *   1. the isolated stack is configured: LOCAL_SUPABASE_API_PORTS, SUPABASE_WORKDIR (the stack's own project folder),
 *      LOCAL_DB_CONTAINER, NEXT_PUBLIC_SUPABASE_URL and the service key are all present;
 *   2. it is not the development stack: not the repository's own project, not its container, not its API port, and the
 *      workdir is not the repository;
 *   3. API and SQL belong to the same stack: the container is `supabase_db_<project_id>` of the workdir's config and the
 *      API URL carries that config's API port;
 *   4. (live, read-only) they are the same DATABASE: the newest auth user found through SQL is found, with the same
 *      email, through the auth admin API (an empty database must be empty through both).
 *
 * `evaluateIsolation` is pure (inputs injected) so every refusal is covered by negative tests without Docker.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evaluateR6Contract, realR6Inspect } from "./isolated-target-r6";

export type Probes = {
  /** newest auth user in the given container that the auth API itself can see (created through it: instance_id set, not deleted;
   *  rows inserted by raw SQL are invisible to GoTrue and are skipped), or null when there is none */
  latestSqlUser(container: string): { id: string; email: string } | null;
  /** auth admin API: one user by id (404 when absent) */
  apiUser(url: string, key: string, id: string): { status: number; email: string | null };
  /** auth admin API: number of users on the first page (0 for an empty database) */
  apiFirstPageCount(url: string, key: string): number | null;
};
export type IsolationInput = {
  env: Record<string, string | undefined>;
  repoRoot: string;
  readFile(path: string): string | null;
  probes: Probes;
};
export type IsolationResult = { ok: true; project: string; container: string; apiPort: string } | { ok: false; check: string; reason: string };

const DEV_API_PORT = "54321";
const fail = (check: string, reason: string): IsolationResult => ({ ok: false, check, reason });
const projectId = (toml: string) => /^project_id\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
const apiPort = (toml: string) => /\[api\][^[]*?\bport\s*=\s*(\d+)/.exec(toml)?.[1] ?? null;
const norm = (p: string) => resolve(p).replace(/[\\/]+$/, "").toLowerCase();

export function evaluateIsolation(input: IsolationInput): IsolationResult {
  const { env, repoRoot, readFile, probes } = input;
  const ports = (env.LOCAL_SUPABASE_API_PORTS ?? "").split(",").map((p) => p.trim()).filter((p) => /^\d{2,5}$/.test(p));
  const workdir = (env.SUPABASE_WORKDIR ?? "").trim();
  const container = (env.LOCAL_DB_CONTAINER ?? "").trim();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  // 1. configured
  if (ports.length === 0) return fail("configured", "LOCAL_SUPABASE_API_PORTS is not set: the isolated stack is not configured (there is no default target)");
  if (!workdir) return fail("configured", "SUPABASE_WORKDIR is not set: `supabase status` would resolve to the development stack");
  if (!container) return fail("configured", "LOCAL_DB_CONTAINER is not set: SQL helpers have no isolated container (no default)");
  if (!url || !key) return fail("configured", "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set for the isolated stack");

  // 2. not development
  const stackToml = readFile(join(workdir, "supabase", "config.toml"));
  if (!stackToml) return fail("configured", `SUPABASE_WORKDIR has no supabase/config.toml: ${workdir}`);
  if (norm(workdir) === norm(repoRoot)) return fail("not-development", "SUPABASE_WORKDIR is the repository itself, i.e. the development stack");
  const stackProject = projectId(stackToml);
  const devToml = readFile(join(repoRoot, "supabase", "config.toml")) ?? "";
  const devProject = projectId(devToml);
  const devPort = apiPort(devToml) ?? DEV_API_PORT;
  if (!stackProject) return fail("configured", "the isolated stack's config.toml declares no project_id");
  if (devProject && stackProject === devProject) return fail("not-development", `the stack project "${stackProject}" is the development project`);
  if (devProject && container === `supabase_db_${devProject}`) return fail("not-development", `LOCAL_DB_CONTAINER is the development database container (${container})`);

  // 3. API and SQL belong to the same stack
  const expectedContainer = `supabase_db_${stackProject}`;
  if (container !== expectedContainer) return fail("same-stack", `LOCAL_DB_CONTAINER is ${container} but the stack in SUPABASE_WORKDIR is ${stackProject} (expected ${expectedContainer}): API and SQL would hit different databases`);
  const stackApiPort = apiPort(stackToml);
  if (!stackApiPort) return fail("configured", "the isolated stack's config.toml declares no [api] port");
  let target: URL;
  try { target = new URL(url); } catch { return fail("configured", "NEXT_PUBLIC_SUPABASE_URL is not a URL"); }
  if (target.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(target.hostname)) return fail("not-development", `the API target ${target.hostname} is not loopback http`);
  if (target.port === devPort || target.port === DEV_API_PORT) return fail("not-development", `the API target port ${target.port} is the development stack's`);
  if (target.port !== stackApiPort) return fail("same-stack", `the API target port ${target.port} is not the stack's API port ${stackApiPort}: API and SQL would hit different databases`);
  if (!ports.includes(target.port)) return fail("configured", `LOCAL_SUPABASE_API_PORTS does not include ${target.port}`);

  // 4. same database (live, read-only)
  const base = `${target.protocol}//${target.host}`;
  const latest = probes.latestSqlUser(container);
  if (latest) {
    const viaApi = probes.apiUser(base, key, latest.id);
    if (viaApi.status !== 200 || (viaApi.email ?? "").toLowerCase() !== latest.email.toLowerCase()) {
      return fail("same-database", `the newest auth user in ${container} is not found through the API at ${target.host} (HTTP ${viaApi.status}): API and SQL are different databases`);
    }
  } else {
    const count = probes.apiFirstPageCount(base, key);
    if (count !== 0) return fail("same-database", `${container} has no auth users but the API at ${target.host} reports ${count === null ? "an error" : "some"}: API and SQL are different databases`);
  }
  return { ok: true, project: stackProject, container, apiPort: stackApiPort };
}

export const realProbes: Probes = {
  latestSqlUser(container) {
    const out = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-F", "|", "-c", "select id::text, email from auth.users where email is not null and instance_id = '00000000-0000-0000-0000-000000000000' and deleted_at is null and created_at is not null order by created_at desc limit 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" } }).trim();
    if (!out) return null;
    const [id, email] = out.split("|");
    return { id, email };
  },
  apiUser(url, key, id) {
    const out = execFileSync(process.execPath, [join(process.cwd(), "scripts", "demo-local", "probe-auth-user.mjs"), url, key, id], { encoding: "utf8", timeout: 30_000 }).trim();
    const j = JSON.parse(out) as { status: number; email: string | null };
    return { status: j.status, email: j.email };
  },
  apiFirstPageCount(url, key) {
    const out = execFileSync(process.execPath, [join(process.cwd(), "scripts", "demo-local", "probe-auth-user.mjs"), url, key, "-"], { encoding: "utf8", timeout: 30_000 }).trim();
    return (JSON.parse(out) as { count: number | null }).count;
  },
};

let cached: IsolationResult | null = null;
/** Throws unless the process is configured for, and verified against, the isolated stack. Result is cached per process. */
export function assertIsolatedStack(): Extract<IsolationResult, { ok: true }> {
  if (!cached && process.env.ISOLATED_CONTRACT === "r6") {
    // Explicit, separate contract for the disposable r6 stack (see isolated-target-r6.ts). Never selected by default.
    cached = evaluateR6Contract({ env: process.env, inspect: realR6Inspect, probes: realProbes });
  }
  if (!cached) {
    cached = evaluateIsolation({
      env: process.env,
      repoRoot: process.cwd(),
      readFile: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
      probes: realProbes,
    });
  }
  if (!cached.ok) {
    throw new Error(
      `Refusing to run (isolation check "${cached.check}"): ${cached.reason}. ` +
        "Run through the isolated runners (`node scripts/demo-local/run-vitest-local.mjs ...` / `npm run demo:e2e -- ...`) against the clean stack; " +
        "there is deliberately no fallback to the development stack.",
    );
  }
  return cached;
}
/** The only way for a test file to learn the SQL container: verified, never defaulted. */
export function isolatedDbContainer(): string {
  return assertIsolatedStack().container;
}

export type ClientTargetResult = { ok: true } | { ok: false; check: string; reason: string };
/**
 * Pure: may a client be constructed for `url`, given the port of the verified isolated stack? The development port is refused
 * even if someone added it to LOCAL_SUPABASE_API_PORTS, and so is any other stack's port: the only reachable client target is the
 * one `assertIsolatedStack` verified. Port 1 (the unroutable dummy of pure unit runs) is the only other accepted value.
 */
export function evaluateClientTarget(url: unknown, verifiedApiPort: string, devPorts: string[] = [DEV_API_PORT]): ClientTargetResult {
  let u: URL;
  try { u = new URL(String(url)); } catch { return { ok: false, check: "client-target", reason: "the client URL is not a URL" }; }
  if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || u.username || u.password) {
    return { ok: false, check: "client-target", reason: `the client target ${u.hostname}:${u.port} is not loopback http` };
  }
  if (u.port === "1") return { ok: true };
  if (devPorts.includes(u.port)) return { ok: false, check: "client-target", reason: `the client target port ${u.port} is the development stack's (refused even if listed in LOCAL_SUPABASE_API_PORTS)` };
  if (u.port !== verifiedApiPort) return { ok: false, check: "client-target", reason: `the client target port ${u.port} is not the verified isolated stack's API port ${verifiedApiPort}` };
  return { ok: true };
}
/** Throws unless `url` is the target `assertIsolatedStack` verified (or the dummy port 1). */
export function assertClientUrlIsVerifiedTarget(url: unknown): void {
  const u = (() => { try { return new URL(String(url)); } catch { return null; } })();
  // pure unit runs: nothing is reachable on port 1 — but ONLY on this machine. A hosted or LAN host on port 1 gets no exception.
  if (u && u.port === "1" && u.protocol === "http:" && !u.username && !u.password && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return;
  const verified = assertIsolatedStack();
  const devPorts = [DEV_API_PORT];
  const devToml = existsSync(join(process.cwd(), "supabase", "config.toml")) ? readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8") : "";
  const cfgPort = apiPort(devToml);
  if (cfgPort) devPorts.push(cfgPort);
  const r = evaluateClientTarget(url, verified.apiPort, devPorts);
  if (!r.ok) {
    throw new Error(`Refusing to run (isolation check "${r.check}"): ${r.reason}. The client must use exactly the isolated stack that was verified; there is deliberately no fallback to the development stack.`);
  }
}
export function resetIsolationCacheForTests() {
  cached = null;
}
