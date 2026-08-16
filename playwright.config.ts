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
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default {
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
};
