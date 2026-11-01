#!/usr/bin/env node
// node scripts/demo-local/run-vitest-local.mjs <vitest args...> [--each]
// Runs vitest against the LOCAL clean stack only, with DUMMY payment-provider settings (no real credentials and
// nothing external: the Fawry base URL points at a closed loopback port, so any accidental call fails fast).
// --each runs every file separately and prints one result line per file.
import { spawnSync } from "node:child_process";
import { stackEnv, root, API_PORT, DB_CONTAINER, stackDir } from "./lib.mjs";

const s = stackEnv();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_API_PORTS: String(API_PORT),
  LOCAL_SUPABASE_WORKDIR: stackDir,
  LOCAL_DB_CONTAINER: DB_CONTAINER,
  // tests that resolve their target with `supabase status` run from the repo would otherwise find the DEV stack
  SUPABASE_WORKDIR: stackDir,
  // dummy payment-provider configuration (fake values; FAWRY_BASE_URL is a closed local port)
  PAYMOB_SECRET_KEY: "dummy-paymob-secret",
  PAYMOB_PUBLIC_KEY: "dummy-paymob-public",
  PAYMOB_HMAC_SECRET: "dummy-paymob-hmac",
  PAYMOB_INTEGRATION_ID: "0000000",
  FAWRY_MERCHANT_CODE: "dummy-merchant",
  FAWRY_SECURE_KEY: "dummy-secure-key",
  FAWRY_BASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_APP_URL: "http://localhost:3100",
};
const args = process.argv.slice(2);
const each = args.includes("--each");
const files = args.filter((a) => a !== "--each");
const run = (list) => spawnSync("npx", ["vitest", "run", ...list, "--hookTimeout=180000", "--testTimeout=120000"], { cwd: root, env, shell: true, encoding: "utf8" });

if (!each) {
  const r = spawnSync("npx", ["vitest", "run", ...files, "--hookTimeout=180000", "--testTimeout=120000"], { cwd: root, env, stdio: "inherit", shell: true });
  process.exit(r.status ?? 1);
}
let failed = 0;
for (const f of files) {
  const r = run([f]);
  const out = `${r.stdout}\n${r.stderr}`;
  const tests = out.match(/Tests\s+([^\n]+)/)?.[1]?.replace(/\x1b\[[0-9;]*m/g, "").trim() ?? "no test summary";
  const fileLine = out.match(/Test Files\s+([^\n]+)/)?.[1]?.replace(/\x1b\[[0-9;]*m/g, "").trim() ?? "";
  console.log(`${r.status === 0 ? "PASS" : "FAIL"}  ${f}  |  files: ${fileLine}  |  tests: ${tests}`);
  if (r.status !== 0) {
    failed++;
    const why = out.split("\n").filter((l) => /Error:|AssertionError|FAIL /.test(l)).slice(0, 4).map((l) => "      " + l.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 220));
    console.log(why.join("\n"));
  }
}
process.exit(failed ? 1 : 0);
