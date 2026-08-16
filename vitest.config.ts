import path from "node:path";

// NOTE: `vitest`/`vite` are not declared as project dependencies (tests are
// currently run via `npx vitest`, which resolves them from the npx cache),
// so this config intentionally avoids importing `defineConfig` from
// "vitest/config" -- that import is unresolvable in this project as
// configured and would break `npx vitest` entirely. A plain config object
// is functionally equivalent for vitest's config loader.
export default {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
};
