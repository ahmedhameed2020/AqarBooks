#!/usr/bin/env node
// node scripts/demo-local/hardware-stack.mjs up|verify|run <vitest args...>|down
// A stack DEDICATED to the hardware outbox file (project aqarbooks_hw, API 55431, DB 55432). The production worker claims
// from one global queue, so that file must not share a database with other suites. Nothing else is run here, nothing is
// cleaned elsewhere, and the worker contract is untouched. Same migrations, same config, only name and ports differ.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { root } from "./lib.mjs";

const env = {
  ...process.env,
  DEMO_STACK_PROJECT: "aqarbooks_hw",
  DEMO_STACK_API_PORT: "55431",
  DEMO_STACK_DIR: join(tmpdir(), "aqarbooks-hw-stack"),
};
const [cmd, ...rest] = process.argv.slice(2);
const node = (script, args = []) => spawnSync(process.execPath, [join(root, "scripts", "demo-local", script), ...args], { cwd: root, env, stdio: "inherit" }).status ?? 1;
if (cmd === "up") process.exit(node("stack.mjs", ["up"]));
else if (cmd === "migrate") process.exit(node("stack.mjs", ["migrate"]));
else if (cmd === "verify") process.exit(node("stack.mjs", ["verify"]));
else if (cmd === "down") process.exit(node("stack.mjs", ["down"]));
else if (cmd === "run") process.exit(node("run-vitest-local.mjs", rest));
else { console.error("usage: hardware-stack.mjs up|migrate|verify|run <vitest args>|down"); process.exit(2); }
