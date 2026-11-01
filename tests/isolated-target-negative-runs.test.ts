import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertIsolatedStack } from "./helpers/isolated-target";

/**
 * REAL negative runs: a child vitest process tries to build a fixture (a write) under five broken environments. Each must
 * (a) fail with the isolation refusal, (b) print nothing that looks like a pass for the probe, and (c) leave BOTH the
 * development database and the isolated database exactly as they were. The before/after fingerprints are read-only
 * (default_transaction_read_only=on). The development container is only ever READ here, to prove it is not written.
 */
vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });
const DEV = "supabase_db_aqarbooks";
const stack = assertIsolatedStack(); // this very file only runs on the verified isolated stack
const running = (name: string) => {
  try {
    return execFileSync("docker", ["inspect", "-f", "{{.State.Running}}", name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch {
    return false;
  }
};
const fingerprint = (container: string) =>
  execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c",
    "select (select count(*) from public.organizations)||'|'||(select count(*) from auth.users)||'|'||(select count(*) from public.gate_devices)||'|'||(select count(*) from public.platform_audit_logs)"],
    { encoding: "utf8", env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" } }).trim();

const cases: Array<[string, (env: NodeJS.ProcessEnv) => void, RegExp]> = [
  ["no isolated-stack configuration at all", (e) => { for (const k of ["LOCAL_SUPABASE_API_PORTS", "SUPABASE_WORKDIR", "LOCAL_SUPABASE_WORKDIR", "LOCAL_DB_CONTAINER"]) delete e[k]; }, /Refusing to run/],
  ["SUPABASE_WORKDIR missing (supabase status would resolve to the development stack)", (e) => { delete e.SUPABASE_WORKDIR; delete e.LOCAL_SUPABASE_WORKDIR; }, /Refusing to run/],
  ["the SQL container is the development container", (e) => { e.LOCAL_DB_CONTAINER = DEV; }, /Refusing to run.*(development|isolation check)/s],
  ["the API target is the development port", (e) => { e.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"; e.LOCAL_SUPABASE_API_PORTS = "54321,55321"; }, /Refusing to run/],
  ["the API target and the SQL container belong to different stacks", (e) => { e.LOCAL_DB_CONTAINER = "supabase_db_someone_else"; }, /Refusing to run.*different databases/s],
];

describe.skipIf(!running(stack.container))("a write attempt under a broken environment is refused before it writes", () => {
  for (const [name, mutate, expected] of cases) {
    it(name, () => {
      const hasDev = running(DEV);
      const before = { dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) };
      const env: NodeJS.ProcessEnv = { ...process.env, AQAR_NEGATIVE_PROBE: "1" };
      mutate(env);
      const child = spawnSync("npx", ["vitest", "run", "tests/negative-probes/write-attempt.test.ts"], { cwd: process.cwd(), env, encoding: "utf8", shell: true, timeout: 200_000 });
      const output = `${child.stdout}\n${child.stderr}`;
      expect(child.status, "the probe must fail").not.toBe(0);
      expect(output).toMatch(expected);
      expect(output).not.toMatch(/1 passed/);
      const after = { dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) };
      expect(after, "no database may have been written").toEqual(before);
    });
  }

  for (const [name, url, listed] of [
    ["correct clean environment, but the client URL is the development stack", "http://127.0.0.1:54321", "55321"],
    ["correct clean environment, development port also added to the allowed list", "http://127.0.0.1:54321", "55321,54321"],
    ["correct clean environment, but the client URL is another stack", "http://127.0.0.1:55421", "55321,55421"],
  ] as const) {
    it(name, () => {
      const hasDev = running(DEV);
      const before = { dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) };
      const env: NodeJS.ProcessEnv = { ...process.env, AQAR_NEGATIVE_PROBE: "1", AQAR_PROBE_CLIENT_URL: url, LOCAL_SUPABASE_API_PORTS: listed };
      const child = spawnSync("npx", ["vitest", "run", "tests/negative-probes/client-url-attempt.test.ts"], { cwd: process.cwd(), env, encoding: "utf8", shell: true, timeout: 200_000 });
      const output = `${child.stdout}
${child.stderr}`;
      expect(child.status, "the probe must fail").not.toBe(0);
      expect(output).toMatch(/Refusing to run/);
      expect(output).not.toMatch(/1 passed/);
      expect({ dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) }).toEqual(before);
    });
  }
  // The same refusals in a real PLAYWRIGHT child process (workers load playwright.config.ts, which installs the createClient guard).
  for (const [name, url, listed] of [
    ["playwright: correct clean environment, but the client URL is the development stack", "http://127.0.0.1:54321", "55321"],
    ["playwright: development port also added to the allowed list", "http://127.0.0.1:54321", "55321,54321"],
    ["playwright: client URL is another stack", "http://127.0.0.1:55421", "55321,55421"],
    ["playwright: client URL is a hosted project", "https://example-project.supabase.co", "55321"],
  ] as const) {
    it(name, () => {
      const hasDev = running(DEV);
      const before = { dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) };
      const env: NodeJS.ProcessEnv = { ...process.env, AQAR_NEGATIVE_PROBE: "1", AQAR_PROBE_CLIENT_URL: url, LOCAL_SUPABASE_API_PORTS: listed };
      const child = spawnSync("npx", ["playwright", "test", "tests/e2e/negative-probes/client-url-attempt.spec.ts", "--reporter=line", `--output=${join(tmpdir(), "aqarbooks-pw-negative")}`], { cwd: process.cwd(), env, encoding: "utf8", shell: true, timeout: 200_000 });
      const output = `${child.stdout}
${child.stderr}`;
      expect(child.status, "the probe must fail").not.toBe(0);
      expect(output).toMatch(/Refusing to run/);
      expect(output).not.toMatch(/1 passed/);
      expect({ dev: hasDev ? fingerprint(DEV) : null, isolated: fingerprint(stack.container) }).toEqual(before);
    });
  }
  it("playwright control: the verified target itself is accepted by the guard (a client is built, nothing is sent)", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, AQAR_NEGATIVE_PROBE: "1", AQAR_PROBE_CLIENT_URL: process.env.NEXT_PUBLIC_SUPABASE_URL };
    const child = spawnSync("npx", ["playwright", "test", "tests/e2e/negative-probes/client-url-attempt.spec.ts", "--reporter=line", `--output=${join(tmpdir(), "aqarbooks-pw-negative")}`], { cwd: process.cwd(), env, encoding: "utf8", shell: true, timeout: 200_000 });
    const output = `${child.stdout}
${child.stderr}`;
    expect(output).not.toMatch(/Refusing to run/);
    expect(output).toMatch(/1 passed/);
    expect(child.status).toBe(0);
  });
  it("control: the same probe under the correct environment is NOT refused by the gate (it proceeds to its fixture)", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, AQAR_NEGATIVE_PROBE: "1" };
    const child = spawnSync("npx", ["vitest", "run", "tests/negative-probes/write-attempt.test.ts"], { cwd: process.cwd(), env, encoding: "utf8", shell: true, timeout: 200_000 });
    const output = `${child.stdout}\n${child.stderr}`;
    expect(output).not.toMatch(/Refusing to run/);
    expect(child.status).toBe(0); // it wrote its fixture into the isolated stack only
  });
});
