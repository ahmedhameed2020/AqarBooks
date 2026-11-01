// Task 7 addition -- no playwright.config.ts existed anywhere in this
// worktree's git history before this file (verified via `git log --all --
// playwright.config.ts`), despite tests/e2e/*.spec.ts already existing and
// docs/superpowers referencing `npm run test:e2e` / port-3100 conventions
// extensively. This config is new, not a pre-existing pattern being
// "followed" -- see the Task 7 completion report for the full finding.
//
// `defineConfig` avoided for the same reason vitest.config.ts avoids
// `defineConfig` from "vitest/config": @playwright/test is not a declared
// project dependency (resolved via `npx playwright`, not node_modules), so
// a plain config object keeps `npx playwright test` working without an
// install step.
import { config as loadEnv } from "dotenv";
import { assertKnownLocalSupabaseUrl } from "./tests/helpers/local-target";
import { assertIsolatedStack } from "./tests/helpers/isolated-target";
import { assertClientUrlIsVerifiedTarget } from "./tests/helpers/isolated-target";
import { installClientGuard } from "./tests/helpers/install-client-guard";

// Phase 2 safety: these specs create users, organizations and journal rows with the service key.
// Resolve the target the same way the specs do (.env.local fills only variables the caller did not
// set) and refuse to start unless it is a known local Supabase stack, and the app is on loopback.
// The separate clean demo stack (API :55321) is opted in with LOCAL_SUPABASE_API_PORTS=55321.
loadEnv({ path: ".env.local" });
assertKnownLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
// ...and prove, before any spec runs, that it is the ISOLATED stack (never development) and that API and SQL are the same database
assertIsolatedStack();
// ...and bind every createClient(url) a spec or helper builds to that verified target (the development port is refused even if listed,
// another stack is refused, the dummy port 1 stays allowed). The check runs BEFORE the real constructor, hence before any request. This
// file is loaded by the main process and by every worker, so the guard is installed in each of them; it throws if it cannot be installed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
installClientGuard(require("@supabase/supabase-js"), assertClientUrlIsVerifiedTarget);

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) {
  throw new Error(`Refusing to run Playwright against a non-local app host: ${new URL(baseURL).hostname}`);
}

export default {
  testDir: "./tests/e2e",
  timeout: 120_000, // the dev server compiles each route on first visit
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
};
