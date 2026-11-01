/**
 * R6 isolation contract (approved 2026-10-28, scope: the disposable r6 stack only).
 *
 * The general gate (isolated-target.ts) requires the container to be `supabase_db_<project_id>` of a Supabase CLI
 * project. The r6 stack is built from plain containers, so it cannot satisfy that name rule. Instead of weakening the
 * general gate, this contract is selected ONLY when the process declares ISOLATED_CONTRACT=r6, and it proves every
 * property the general gate proves, by other means:
 *
 *   1. the declared containers are exactly the r6 ones (database g0r6-db, API g0r6-kong) and are not development,
 *      production, or any other project's container (refused by name, not only by pattern);
 *   2. the database container is attached to g0r6-internal ONLY and publishes NO port;
 *   3. the API container is attached to g0r6-internal and publishes exactly ONE binding, 127.0.0.1:<port>; no 0.0.0.0,
 *      no IPv6 wildcard, no second binding;
 *   4. the client URL is exactly http://127.0.0.1:<that port> (same host, same port), and the port is not a development
 *      or clean-stack port;
 *   5. (live, read-only) the newest auth user in the r6 database is found through the r6 API with the same email.
 *
 * Pure evaluation (inputs injected) so every refusal is covered without Docker.
 */
import { execFileSync } from "node:child_process";
import type { IsolationResult, Probes } from "./isolated-target";

export const R6_DB_CONTAINER = "g0r6-db";
export const R6_API_CONTAINER = "g0r6-kong";
export const R6_NETWORK = "g0r6-internal";
/** Every Supabase CLI stack container (development, clean stacks, other projects) is refused by prefix, never targeted. */
const FOREIGN_PREFIX = "supabase_";
/** Development and clean-stack API ports, never valid under this contract. */
const FORBIDDEN_PORTS = ["54321", "55321"];

export type ContainerFacts = {
  running: boolean;
  networks: string[];
  /** published bindings keyed like docker's NetworkSettings.Ports, e.g. "8000/tcp": [{HostIp, HostPort}] or null */
  ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
};
export type R6Input = {
  env: Record<string, string | undefined>;
  inspect(container: string): ContainerFacts;
  probes: Probes;
};

const fail = (check: string, reason: string): IsolationResult => ({ ok: false, check, reason });

export function evaluateR6Contract(input: R6Input): IsolationResult {
  const { env, inspect, probes } = input;
  if ((env.ISOLATED_CONTRACT ?? "") !== "r6") return fail("configured", "ISOLATED_CONTRACT is not r6");
  const dbName = (env.R6_DB_CONTAINER ?? "").trim();
  const apiName = (env.R6_API_CONTAINER ?? "").trim();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  // 1. declared containers are exactly the r6 pair
  if (!dbName || !apiName || !url || !key) return fail("configured", "R6_DB_CONTAINER, R6_API_CONTAINER, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set");
  if (dbName !== R6_DB_CONTAINER) return fail("identity", `R6_DB_CONTAINER is ${dbName}; the r6 database is ${R6_DB_CONTAINER}`);
  if (apiName !== R6_API_CONTAINER) return fail("identity", `R6_API_CONTAINER is ${apiName}; the r6 API is ${R6_API_CONTAINER}`);
  if (dbName.startsWith(FOREIGN_PREFIX) || apiName.startsWith(FOREIGN_PREFIX)) return fail("not-development", "a Supabase CLI stack container is named; r6 uses only its own containers");
  if (env.LOCAL_DB_CONTAINER !== undefined && env.LOCAL_DB_CONTAINER !== R6_DB_CONTAINER) return fail("identity", `LOCAL_DB_CONTAINER is ${env.LOCAL_DB_CONTAINER}; under r6 it must be ${R6_DB_CONTAINER} or absent`);

  // 2. database: running, on the internal network only, no published port
  const db = inspect(dbName);
  if (!db.running) return fail("identity", `${dbName} is not running`);
  if (db.networks.length !== 1 || db.networks[0] !== R6_NETWORK) return fail("isolation", `${dbName} is attached to [${db.networks.join(", ")}]; it must be on ${R6_NETWORK} only`);
  const dbPublished = Object.entries(db.ports).filter(([, v]) => v && v.length > 0);
  if (dbPublished.length > 0) return fail("isolation", `${dbName} publishes ports (${dbPublished.map(([k]) => k).join(", ")}); the database must publish none`);

  // 3. API: on the internal network, exactly one loopback binding
  const api = inspect(apiName);
  if (!api.running) return fail("identity", `${apiName} is not running`);
  if (!api.networks.includes(R6_NETWORK)) return fail("isolation", `${apiName} is not attached to ${R6_NETWORK}`);
  const bindings = Object.entries(api.ports).flatMap(([port, v]) => (v ?? []).map((b) => ({ port, ...b })));
  if (bindings.length !== 1) return fail("isolation", `${apiName} publishes ${bindings.length} bindings; exactly one (127.0.0.1) is allowed`);
  const [only] = bindings;
  if (only.HostIp !== "127.0.0.1") return fail("isolation", `the API binding is ${only.HostIp || "(any interface)"}; it must be 127.0.0.1`);
  if (FORBIDDEN_PORTS.includes(only.HostPort)) return fail("not-development", `the API is published on ${only.HostPort}, a development or clean-stack port`);

  // 4. the client URL is the published binding, exactly
  let target: URL;
  try { target = new URL(url); } catch { return fail("configured", "NEXT_PUBLIC_SUPABASE_URL is not a URL"); }
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1") return fail("not-development", `the API URL host is ${target.hostname}; r6 is reachable on 127.0.0.1 only`);
  if (target.port !== only.HostPort) return fail("same-stack", `the API URL port ${target.port} is not the r6 API binding ${only.HostPort}`);

  // 5. same database, live and read-only: the newest auth user found through SQL is found through the API
  const base = `${target.protocol}//${target.host}`;
  const latest = probes.latestSqlUser(dbName);
  if (latest) {
    const viaApi = probes.apiUser(base, key, latest.id);
    if (viaApi.status !== 200 || (viaApi.email ?? "").toLowerCase() !== latest.email.toLowerCase()) {
      return fail("same-database", `the newest auth user in ${dbName} is not found through the r6 API (HTTP ${viaApi.status})`);
    }
  } else {
    const count = probes.apiFirstPageCount(base, key);
    if (count !== 0) return fail("same-database", `${dbName} has no auth users but the r6 API reports ${count === null ? "an error" : "some"}`);
  }
  return { ok: true, project: "r6", container: dbName, apiPort: only.HostPort };
}

/** Real inspection: docker inspect, read-only. */
export const realR6Inspect = (container: string): ContainerFacts => {
  const out = execFileSync(
    "docker",
    ["inspect", container, "--format", "{{json .State.Running}}|{{json .NetworkSettings.Networks}}|{{json .NetworkSettings.Ports}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 },
  ).trim();
  const [running, networks, ports] = out.split("|");
  return {
    running: JSON.parse(running) === true,
    networks: Object.keys(JSON.parse(networks) ?? {}),
    ports: JSON.parse(ports) ?? {},
  };
};
