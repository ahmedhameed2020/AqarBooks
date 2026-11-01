// Builds and serves the Next app against the r6 stack ONLY. Secret values are read from the r6 secret folder and never printed.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = "D:/Web/AqarBooks";
const SECRETS = "C:/Users/Lenovo/AppData/Local/Temp/g0-r6";
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
  LOCAL_DB_CONTAINER: "g0r6-db",
  LOCAL_SUPABASE_API_PORTS: "58461",
};
const envNames = existsSync(join(REPO, ".env.local"))
  ? readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.split("=")[0].trim()).filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
  : [];
const env = { ...process.env };
for (const n of envNames) env[n] = explicit[n] ?? "";
Object.assign(env, explicit);
for (const n of ["SUPABASE_WORKDIR", "SUPABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL", "RESEND_API_KEY", "FAWRY_MERCHANT_CODE", "FAWRY_SECURE_KEY"]) env[n] = env[n] ?? "";

const mode = process.argv[2];
const next = join(REPO, "node_modules/next/dist/bin/next");
if (mode === "build") {
  const r = spawnSync(process.execPath, [next, "build", ...process.argv.slice(3)], { cwd: REPO, env, stdio: "inherit", timeout: 3_000_000 });
  console.log("build exit", r.status);
  process.exit(r.status ?? 1);
} else if (mode === "start") {
  const child = spawn(process.execPath, [next, "start", "-p", "3100"], { cwd: REPO, env, stdio: "ignore", detached: true });
  child.unref();
  console.log("started pid", child.pid);
}
if (mode === "pw") {
  const specs = ["asset-disposal", "einvoice-flow", "enterprise-suite-pillars", "finance-screens-show-their-data", "fixed-assets", "projects-wip", "reports-suite-flow", "supplier-invoice-fx"];
  const pwEnv = { ...env, PLAYWRIGHT_BASE_URL: "http://localhost:3100" };
  let failures = 0;
  for (const s of specs) {
    const r = spawnSync(process.execPath, [join(REPO, "node_modules/@playwright/test/cli.js"), "test", `tests/e2e/${s}.spec.ts`, "--reporter=list"], {
      cwd: REPO, env: pwEnv, encoding: "utf8", timeout: 1_500_000, maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    readFileSync; // no-op
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join("C:/Users/Lenovo/AppData/Local/Temp/g0-r6-run", `pw2_${s}.txt`), (r.stdout ?? "") + (r.stderr ?? ""));
    console.log(s, "exit", r.status);
    if (r.status !== 0) failures++;
  }
  process.exitCode = failures ? 1 : 0;
}
if (mode === "pw1") {
  const s = process.argv[3];
  const r = spawnSync(process.execPath, [join(REPO, "node_modules/@playwright/test/cli.js"), "test", `tests/e2e/${s}.spec.ts`, "--reporter=list"], {
    cwd: REPO, env: { ...env, PLAYWRIGHT_BASE_URL: "http://localhost:3100" }, encoding: "utf8", timeout: 1_500_000, maxBuffer: 256 * 1024 * 1024,
  });
  console.log("exit", r.status);
  console.log((r.stdout ?? "").slice(-3000));
  console.log((r.stderr ?? "").slice(-3000));
}
if (mode === "pwo") {
  const [, , , spec, outDir] = process.argv;
  const r = spawnSync(process.execPath, [join(REPO, "node_modules/@playwright/test/cli.js"), "test", `tests/e2e/${spec}.spec.ts`, "--reporter=list", `--output=${outDir}`], {
    cwd: REPO, env: { ...env, PLAYWRIGHT_BASE_URL: "http://localhost:3100" }, encoding: "utf8", timeout: 1_500_000, maxBuffer: 256 * 1024 * 1024,
  });
  console.log("exit", r.status);
  console.log((r.stdout ?? "") + (r.stderr ?? ""));
  process.exitCode = r.status ?? 1;
}
if (mode === "selftest-fail") { const r = spawnSync(process.execPath, ["-e", "process.exit(3)"]); console.log("child exit", r.status); process.exitCode = r.status ?? 1; }
