// Run one Playwright spec against a temporary r6-only Next server, then stop that server.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = "D:/Web/AqarBooks";
const SECRETS = "C:/Users/Lenovo/AppData/Local/Temp/g0-r6";
const OUT = join(REPO, "docs/progress/evidence-r6-run10/results");
const spec = process.argv[2];
const label = process.argv[3] ?? "run";
if (!spec || !/^tests\/e2e\/[A-Za-z0-9_-]+\.spec\.ts$/.test(spec)) throw new Error("Expected one tests/e2e/*.spec.ts file");
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
  LOCAL_DB_CONTAINER: "g0r6-db",
  LOCAL_SUPABASE_API_PORTS: "58461",
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3176",
  ProgramData: "C:\\ProgramData",
};
const envNames = existsSync(join(REPO, ".env.local"))
  ? readFileSync(join(REPO, ".env.local"), "utf8").split(/\r?\n/).map((l) => l.split("=")[0].trim()).filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
  : [];
const env = { ...process.env };
for (const n of envNames) env[n] = explicit[n] ?? "";
Object.assign(env, explicit);
for (const n of ["SUPABASE_WORKDIR", "SUPABASE_URL", "DATABASE_URL", "SUPABASE_DB_URL", "RESEND_API_KEY", "FAWRY_MERCHANT_CODE", "FAWRY_SECURE_KEY"]) env[n] = env[n] ?? "";
env.PATH = "C:\\Users\\Lenovo\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;" + (env.PATH ?? "");

const serverLog = join(OUT, `${label}-server.txt`);
const fd = openSync(serverLog, "w");
const server = spawn(process.execPath, [join(REPO, "node_modules/next/dist/bin/next"), "start", "-p", "3176"], {
  cwd: REPO, env, stdio: ["ignore", fd, fd], detached: false,
});
let result = 1;
const started = Date.now();
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`Next server exited early: ${server.exitCode}`);
    try {
      const response = await fetch("http://127.0.0.1:3176/en/login", { signal: AbortSignal.timeout(3000) });
      if (response.status < 500) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready) throw new Error("Next server did not become ready on r6 port 3176");
  const r = spawnSync(process.execPath, [join(REPO, "node_modules/@playwright/test/cli.js"), "test", spec, "--reporter=list", `--output=${join(OUT, `${label}-artifacts`)}`], {
    cwd: REPO, env, encoding: "utf8", timeout: 1200000, maxBuffer: 64 * 1024 * 1024,
  });
  result = r.status ?? 1;
  writeFileSync(join(OUT, `${label}.txt`), `$ ${spec}\nlabel=${label}\nexit=${result}\nelapsed_ms=${Date.now() - started}\n\n${r.stdout ?? ""}${r.stderr ?? ""}`);
} catch (error) {
  writeFileSync(join(OUT, `${label}.txt`), `$ ${spec}\nlabel=${label}\nexit=1\n\n${error?.stack ?? error}`);
} finally {
  if (server.exitCode === null) spawnSync("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  closeSync(fd);
}
console.log(`exit=${result} elapsed_ms=${Date.now() - started} log=${join(OUT, `${label}.txt`)}`);
process.exitCode = result;
