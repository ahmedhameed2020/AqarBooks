#!/usr/bin/env node
// Starts the Next.js dev server on :3100 against the LOCAL clean stack with an isolated environment.
import { spawn } from "node:child_process";
import { appEnv, root, APP_PORT } from "./lib.mjs";

const env = appEnv();
console.log(`app → http://localhost:${APP_PORT}  (Supabase ${env.NEXT_PUBLIC_SUPABASE_URL})`);
const child = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], { cwd: root, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
