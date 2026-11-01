// Shared helpers for the local accounting demo / E2E environment.
// Everything here talks to 127.0.0.1 only. Nothing reads or forwards production secrets.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..", "..");
export const stackDir = process.env.DEMO_STACK_DIR ?? join(tmpdir(), "aqarbooks-clean-stack");
// Default: the shared clean stack (see scripts/demo-local/supabase/config.toml; the development stack uses 54321).
// A DEDICATED stack (e.g. for the hardware outbox file) is selected with DEMO_STACK_PROJECT + DEMO_STACK_API_PORT + DEMO_STACK_DIR
// (see scripts/demo-local/hardware-stack.mjs). The development project/port can never be selected.
export const API_PORT = Number(process.env.DEMO_STACK_API_PORT ?? 55321);
export const PROJECT_ID = process.env.DEMO_STACK_PROJECT ?? "aqarbooks_clean";
export const DB_CONTAINER = `supabase_db_${PROJECT_ID}`;
if (PROJECT_ID === "aqarbooks" || API_PORT === 54321 || !/^[a-z0-9_]+$/.test(PROJECT_ID) || !Number.isInteger(API_PORT) || API_PORT < 1024) {
  throw new Error(`Refusing: ${PROJECT_ID}:${API_PORT} cannot be an isolated demo stack (the development stack is never selectable).`);
}
export const APP_PORT = 3100;

/** Throws unless the URL is the loopback API of THIS clean stack. */
export function assertCleanStackUrl(url) {
  const u = new URL(url);
  if (u.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(u.hostname) || Number(u.port) !== API_PORT) {
    throw new Error(`Refusing: ${u.hostname}:${u.port} is not the local clean stack (127.0.0.1:${API_PORT}).`);
  }
}

export function supabase(args, opts = {}) {
  return execFileSync("supabase", [...args, "--workdir", stackDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32", ...opts });
}

/** Copies the repo's config + migrations into the stack dir (the usual `supabase start` migration path). */
export function syncStackProject() {
  mkdirSync(join(stackDir, "supabase"), { recursive: true });
  const cfg = readFileSync(join(root, "scripts", "demo-local", "supabase", "config.toml"), "utf8")
    .replace(/^project_id\s*=.*$/m, `project_id = "${PROJECT_ID}"`)
    .replace(/^(\[api\][^[]*?port\s*=\s*)\d+/m, (_, a) => `${a}${API_PORT}`)
    .replace(/^(\[db\][^[]*?port\s*=\s*)\d+/m, (_, a) => `${a}${API_PORT + 1}`)
    .replace(/^(shadow_port\s*=\s*)\d+/m, (_, a) => `${a}${API_PORT - 1}`);
  writeFileSync(join(stackDir, "supabase", "config.toml"), cfg);
  const target = join(stackDir, "supabase", "migrations");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const f of readdirSync(join(root, "supabase", "migrations")).filter((n) => /^\d{14}_.+\.sql$/.test(n))) {
    cpSync(join(root, "supabase", "migrations", f), join(target, f));
  }
}

export function stackEnv() {
  const out = supabase(["status", "-o", "env"]);
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.API_URL || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw new Error("clean stack is not running (npm run demo:stack-up)");
  assertCleanStackUrl(env.API_URL);
  return env;
}

export function stackIsUp() {
  try { stackEnv(); return true; } catch { return false; }
}

/**
 * Environment for the Next.js process: local stack values, and every variable that .env.local /
 * .env.production define is overridden (blank unless set here), because Next only fills variables
 * that are undefined in the process. That keeps production URLs, keys and provider credentials out.
 */
export function appEnv(extra = {}) {
  const s = stackEnv();
  const env = { ...process.env };
  for (const file of [".env.local", ".env.production", ".env"]) {
    const p = join(root, file);
    if (!existsSync(p)) continue;
    for (const line of execFileSync(process.execPath, ["-e", `process.stdout.write(require("fs").readFileSync(${JSON.stringify(p)},"utf8"))`], { encoding: "utf8" }).split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m) env[m[1]] = "";
    }
  }
  Object.assign(env, {
    NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
    RESEND_API_KEY: "",
    CRON_SECRET: "",
    FAWRY_PRODUCTION_BASE_URL: "",
    PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS: "",
    // no AI provider credentials in the demo unless a test injects a fake one explicitly
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    AI_GATEWAY_API_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
    WRANGLER_SEND_METRICS: "false",
    ...extra,
  });
  return env;
}
