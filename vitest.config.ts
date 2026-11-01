import path from "node:path";

export default {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // Refuse to build a Supabase client for anything but the known local stack (tests/helpers/local-target.ts).
    setupFiles: ["./tests/setup/local-only-guard.ts"],
    // These suites run multiple sequential live RPC round-trips against the local stack (not mocked) --
    // vitest's 5000ms default is too
    // tight for the longer multi-step integration tests.
    testTimeout: 30000,
    // PGlite / docker-backed suites start slowly when the machine is busy; vitest's 10 s default hook timeout flaked.
    hookTimeout: 60000,
    exclude: ["**/.worktrees/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
};
