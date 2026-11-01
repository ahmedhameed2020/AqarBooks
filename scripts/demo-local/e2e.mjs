#!/usr/bin/env node
// node scripts/demo-local/e2e.mjs [playwright args...]   e.g.  tests/e2e/accounting-journey.spec.ts --headed
// Runs Playwright against the LOCAL clean stack and the local app on :3100. Refuses anything else.
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stackEnv, root, API_PORT, DB_CONTAINER, APP_PORT, stackDir } from "./lib.mjs";

const s = stackEnv();
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_API_PORTS: String(API_PORT),
  LOCAL_DB_CONTAINER: DB_CONTAINER,
  // tests that resolve their target with `supabase status` run from the repo would otherwise find the DEV stack
  SUPABASE_WORKDIR: stackDir,
  LOCAL_SUPABASE_WORKDIR: stackDir,
  PLAYWRIGHT_BASE_URL: `http://localhost:${APP_PORT}`,
};
// Playwright artifacts (traces, failure screenshots) go to the system temp folder, not the repo drive: a full disk
// there made otherwise-passing tests fail while writing a screenshot. Screens kept as evidence stay under docs/.
const outputDir = process.env.PW_OUTPUT_DIR ?? join(tmpdir(), "aqarbooks-pw-results");
const r = spawnSync("npx", ["playwright", "test", `--output=${outputDir}`, ...process.argv.slice(2)], { cwd: root, env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
