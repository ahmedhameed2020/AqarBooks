// Run exactly one Vitest file against r6. Secrets stay in the r6 folder and are never printed.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = "D:/Web/AqarBooks";
const SECRETS = "C:/Users/Lenovo/AppData/Local/Temp/g0-r6";
const OUT = join(REPO, "docs/progress/evidence-r6-run10/results");
const file = process.argv[2];
const label = process.argv[3] ?? "run";
if (!file || !/^tests\/[A-Za-z0-9_./-]+\.test\.ts$/.test(file)) throw new Error("Expected one tests/*.test.ts file");
mkdirSync(OUT, { recursive: true });

const keysFile = readdirSync(SECRETS).find((f) => f.startsWith("key"));
if (!keysFile) throw new Error("r6 key file not found");
const kv = {};
for (const line of readFileSync(join(SECRETS, keysFile), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) kv[m[1]] = m[2];
}
const explicit = {
  ISOLATED_CONTRACT: "r6",
  R6_DB_CONTAINER: "g0r6-db",
  R6_API_CONTAINER: "g0r6-kong",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58461",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: kv.ANON_KEY,
  R6_ANON_KEY: kv.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: kv.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: kv.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: kv.SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_API_PORTS: "58461",
  LOCAL_DB_CONTAINER: "g0r6-db",
};
const envNames = existsSync(join(REPO, ".env.local"))
  ? readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.split("=")[0].trim()).filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
  : [];
const env = { ...process.env };
for (const n of envNames) env[n] = explicit[n] ?? "";
Object.assign(env, explicit);
for (const n of ["SUPABASE_WORKDIR", "SUPABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL", "RESEND_API_KEY", "FAWRY_MERCHANT_CODE", "FAWRY_SECURE_KEY"]) env[n] = env[n] ?? "";
env.PATH = "C:\\Users\\Lenovo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;" + (env.PATH ?? "");

const jsonPath = join(OUT, `${label}.json`);
const started = Date.now();
const r = spawnSync(process.execPath, [join(REPO, "node_modules/vitest/vitest.mjs"), "run", file, "--reporter=default", "--reporter=json", `--outputFile.json=${jsonPath}`], {
  cwd: REPO, env, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024,
});
const log = `$ ${file}\nlabel=${label}\nexit=${r.status}\nelapsed_ms=${Date.now() - started}\n\n${r.stdout ?? ""}${r.stderr ?? ""}`;
writeFileSync(join(OUT, `${label}.txt`), log);
console.log(`exit=${r.status} elapsed_ms=${Date.now() - started} log=${join(OUT, `${label}.txt`)}`);
process.exitCode = r.status ?? 1;
