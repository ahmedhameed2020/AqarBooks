import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error plain ESM module without types
import { checkBundleEnv } from "../scripts/lib/build-env-check.mjs";

const chunk = (body: string, path = "chunk.js") => ({ path, body });

describe("build env verification (deploy gate)", () => {
  const prod = "https://abcdefghijklmnopqrst.supabase.co";

  it("passes when the expected project host is inlined and nothing else is", () => {
    const result = checkBundleEnv({
      expectedUrl: prod,
      chunks: [chunk(`fetch("${prod}/auth/v1")`)],
    });
    expect(result.ok).toBe(true);
    expect(result.matches).toBe(1);
  });

  it("fails when the expected host is missing (build ran without the variable)", () => {
    const result = checkBundleEnv({
      expectedUrl: prod,
      chunks: [chunk(`const url = "https://placeholder-project.supabase.co"`)],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/not present/);
  });

  it("fails when another Supabase project is inlined", () => {
    const result = checkBundleEnv({
      expectedUrl: prod,
      chunks: [chunk(`fetch("${prod}"); fetch("https://zzzzzzzzzzzzzzzzzzzz.supabase.co")`)],
    });
    expect(result.ok).toBe(false);
    expect(result.foreignHosts).toContain("zzzzzzzzzzzzzzzzzzzz.supabase.co");
  });

  it("fails when a development marker leaks into a production build", () => {
    const result = checkBundleEnv({
      expectedUrl: prod,
      chunks: [chunk(`fetch("${prod}"); const dev = "http://127.0.0.1:58461"`)],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/development marker/);
  });

  it("refuses a non-production expected URL", () => {
    const result = checkBundleEnv({
      expectedUrl: "https://placeholder-project.supabase.co",
      chunks: [chunk("anything")],
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/non-production/);
  });

  it("allows localhost expectations only when they are the explicit target", () => {
    const local = "http://127.0.0.1:58461";
    const result = checkBundleEnv({
      expectedUrl: local,
      chunks: [chunk(`fetch("${local}")`)],
      requireProduction: false,
    });
    expect(result.ok).toBe(true);
    // ...and the same URL is refused when a production build is required.
    expect(checkBundleEnv({ expectedUrl: local, chunks: [chunk(`fetch("${local}")`)] }).ok).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("deploy workflow gates (deploy.yml)", () => {
  const workflow = readFileSync(fileURLToPath(new URL("../.github/workflows/deploy.yml", import.meta.url)), "utf8");

  it("requires an explicit production project ref before building", () => {
    expect(workflow).toContain("PRODUCTION_SUPABASE_PROJECT_REF");
    expect(workflow).toContain("Validate expected production project");
  });

  it("verifies the built bundle against the expected project before deploy", () => {
    expect(workflow).toContain("verify-build-env.mjs");
    const buildAt = workflow.indexOf("npx opennextjs-cloudflare build");
    const verifyAt = workflow.indexOf("verify-build-env.mjs");
    const deployAt = workflow.indexOf("opennextjs-cloudflare deploy");
    expect(buildAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(buildAt);
    expect(deployAt).toBeGreaterThan(verifyAt);
  });
});
