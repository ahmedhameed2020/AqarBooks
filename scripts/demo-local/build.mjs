#!/usr/bin/env node
// node scripts/demo-local/build.mjs [--next-only]
// Production build with the SAME isolated environment as the demo app: every variable named in .env* is blanked
// and only the local clean stack's URL/keys are set, so no production value can be inlined into the bundle.
// Default = the project's real build (`opennextjs-cloudflare build`, which runs `next build` first);
// --next-only runs just `next build`. Nothing is deployed or uploaded.
import { spawnSync } from "node:child_process";
import { appEnv, root } from "./lib.mjs";

const env = { ...appEnv(), NEXT_TELEMETRY_DISABLED: "1" };
const nextOnly = process.argv.includes("--next-only");
const cmd = nextOnly ? ["next", "build"] : ["opennextjs-cloudflare", "build"];
console.log(`build → ${cmd.join(" ")}  (Supabase ${env.NEXT_PUBLIC_SUPABASE_URL})`);
const r = spawnSync("npx", cmd, { cwd: root, env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
