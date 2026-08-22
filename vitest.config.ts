import path from "node:path";

export default {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    // These suites run multiple sequential live RPC round-trips against a
    // remote Supabase project (not mocked) -- vitest's 5000ms default is too
    // tight for the longer multi-step integration tests.
    testTimeout: 30000,
    exclude: ["**/.worktrees/**", "**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
};
