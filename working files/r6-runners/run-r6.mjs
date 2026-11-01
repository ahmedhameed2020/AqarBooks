// Runs the vitest integration files against the r6 stack ONLY. Values are read from the r6 secret folder and are never printed.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = "D:/Web/AqarBooks";
const SECRETS = "C:/Users/Lenovo/AppData/Local/Temp/g0-r6";
const OUT = "C:/Users/Lenovo/AppData/Local/Temp/g0-r6-run";

// keys file: first file in the secret folder whose name starts with "key"
const keysFile = readdirSync(SECRETS).find((f) => f.startsWith("key"));
const kv = {};
for (const line of readFileSync(join(SECRETS, keysFile), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) kv[m[1]] = m[2];
}
const url = "http://127.0.0.1:58461";
const explicit = {
  ISOLATED_CONTRACT: "r6",
  R6_DB_CONTAINER: "g0r6-db",
  R6_API_CONTAINER: "g0r6-kong",
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: kv.ANON_KEY,
  R6_ANON_KEY: kv.ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: kv.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: kv.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: kv.SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_API_PORTS: "58461",
  LOCAL_DB_CONTAINER: "g0r6-db",
};
// Every name that .env.local would inject is overridden: explicit r6 value, or blank. dotenv never overrides an existing key.
const envNames = existsSync(join(REPO, ".env.local"))
  ? readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.split("=")[0].trim()).filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
  : [];
const env = { ...process.env };
for (const n of envNames) env[n] = explicit[n] ?? "";
Object.assign(env, explicit);
for (const n of ["SUPABASE_WORKDIR", "SUPABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL", "RESEND_API_KEY", "FAWRY_MERCHANT_CODE", "FAWRY_SECURE_KEY"]) env[n] = env[n] ?? "";

const files = JSON.parse(readFileSync(join(OUT, "files.json"), "utf8"));
const summary = [];
for (const f of files) {
  const safe = f.replace(/[\/]/g, "_");
  const r = spawnSync(process.execPath, [join(REPO, "node_modules/vitest/vitest.mjs"), "run", f, "--reporter=json", `--outputFile=${join(OUT, safe + ".json")}`], {
    cwd: REPO, env, encoding: "utf8", timeout: 600000,
  });
  let counts = "no-json";
  try {
    const j = JSON.parse(readFileSync(join(OUT, safe + ".json"), "utf8"));
    counts = `total=${j.numTotalTests} passed=${j.numPassedTests} failed=${j.numFailedTests} pending=${j.numPendingTests} suiteErrors=${(j.testResults ?? []).filter((t) => t.status === "failed" && (t.assertionResults ?? []).length === 0).length}`;
  } catch {}
  summary.push(`${f} | exit=${r.status} | ${counts}`);
}
writeFileSync(join(OUT, "summary.txt"), summary.join("\n") + "\n");
console.log("done", summary.length);
