#!/usr/bin/env node
// One command for the suites that need a throwaway PostgreSQL (tests/*.local-sql.test.ts):
// creates a scratch cluster, replays supabase/migrations/ onto it, runs the suites, then
// stops and deletes the cluster. It listens on 127.0.0.1 only and never reads .env.local.
//
//   PG_BIN="C:/path/to/postgresql/bin" node scripts/local-db/run-sql-tests.mjs [vitest args...]
//
// Defaults: port 54329, suite tests/owner-portal-access.local-sql.test.ts.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const bin = process.env.PG_BIN ?? "";
const exe = (name) => (bin ? join(bin, name) : name);
const port = process.env.LOCAL_PG_PORT ?? "54329";
const dir = join(mkdtempSync(join(tmpdir(), "aqar-pg-")), "data");
const quiet = { stdio: "ignore" };
let code = 1;

try {
  execFileSync(exe("initdb"), ["-D", dir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"], quiet);
  execFileSync(exe("pg_ctl"), ["-D", dir, "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "-l", join(dir, "log"), "-w", "start"], quiet);
  const env = { ...process.env, LOCAL_PG_PORT: port, PG_BIN: bin };
  execFileSync(process.execPath, [join(root, "scripts", "local-db", "replay.mjs")], { env, stdio: "inherit" });
  const suites = process.argv.slice(2);
  const args = ["vitest", "run", ...(suites.length ? suites : ["tests/owner-portal-access.local-sql.test.ts"]), "--hookTimeout=180000", "--testTimeout=120000"];
  // The suites only talk to the scratch cluster; dummy Supabase values keep app imports inert.
  const result = spawnSync("npx", args, {
    cwd: root,
    shell: true,
    stdio: "inherit",
    env: { ...env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x" },
  });
  code = result.status ?? 1;
} finally {
  try { execFileSync(exe("pg_ctl"), ["-D", dir, "-m", "immediate", "-w", "stop"], quiet); } catch { /* not started */ }
  rmSync(join(dir, ".."), { recursive: true, force: true });
}
process.exit(code);
