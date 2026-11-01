#!/usr/bin/env node
// node scripts/demo-local/start-prod.mjs
// Serves the PRODUCTION build (`node scripts/demo-local/build.mjs --next-only` first) on :3100 with the same isolated
// local-only environment as the dev launcher. Use it instead of `demo:app` when the disk is tight: it writes almost
// nothing, and the browser suites then exercise exactly what a production build serves.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appEnv, root, APP_PORT } from "./lib.mjs";

if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  console.error("no production build found: run  node scripts/demo-local/build.mjs --next-only  first");
  process.exit(1);
}
const env = { ...appEnv(), NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
console.log(`production build → http://localhost:${APP_PORT}  (Supabase ${env.NEXT_PUBLIC_SUPABASE_URL})`);
const child = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: root, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
