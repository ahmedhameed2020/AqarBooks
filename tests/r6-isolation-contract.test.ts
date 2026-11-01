import { describe, expect, it } from "vitest";
import { evaluateR6Contract, type ContainerFacts, type R6Input } from "./helpers/isolated-target-r6";

// Negative and positive tests for the r6 isolation contract. Pure: docker and the live probes are injected.
const GOOD_ENV = {
  ISOLATED_CONTRACT: "r6",
  R6_DB_CONTAINER: "g0r6-db",
  R6_API_CONTAINER: "g0r6-kong",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58461",
  SUPABASE_SERVICE_ROLE_KEY: "k",
};
const DB_OK: ContainerFacts = { running: true, networks: ["g0r6-internal"], ports: {} };
const API_OK: ContainerFacts = {
  running: true,
  networks: ["g0r6-internal", "g0r6-edge"],
  ports: { "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "58461" }] },
};
const PROBES_OK = {
  latestSqlUser: () => ({ id: "u1", email: "a@x.test" }),
  apiUser: () => ({ status: 200, email: "A@x.test" }),
  apiFirstPageCount: () => 0,
};

const run = (over: { env?: Record<string, string | undefined>; db?: ContainerFacts; api?: ContainerFacts; probes?: R6Input["probes"] } = {}) =>
  evaluateR6Contract({
    env: { ...GOOD_ENV, ...(over.env ?? {}) },
    inspect: (c) => (c === "g0r6-db" ? over.db ?? DB_OK : over.api ?? API_OK),
    probes: over.probes ?? PROBES_OK,
  });

describe("r6 contract: accepts exactly the r6 pair", () => {
  it("accepts the disposable r6 stack with its loopback binding and the same database", () => {
    expect(run()).toMatchObject({ ok: true, project: "r6", container: "g0r6-db", apiPort: "58461" });
  });
});

describe("r6 contract: refuses every wrong target before any write", () => {
  it("refuses a database container that is not g0r6-db (Supabase CLI stacks and other rehearsal containers)", () => {
    for (const name of ["supabase_db_clean_stack", "supabase_db_other_project", "g0rehearsal-b1b-20261024r5"]) {
      const r = run({ env: { R6_DB_CONTAINER: name } });
      expect(r.ok).toBe(false);
    }
  });
  it("refuses a database container that publishes a port", () => {
    const r = run({ db: { running: true, networks: ["g0r6-internal"], ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54322" }] } } });
    expect(r).toMatchObject({ ok: false, check: "isolation" });
  });
  it("refuses a database attached to the default bridge network", () => {
    expect(run({ db: { running: true, networks: ["bridge"], ports: {} } })).toMatchObject({ ok: false, check: "isolation" });
  });
  it("refuses an API published on all interfaces (0.0.0.0)", () => {
    const r = run({ api: { running: true, networks: ["g0r6-internal"], ports: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "58461" }] } } });
    expect(r).toMatchObject({ ok: false, check: "isolation" });
  });
  it("refuses an API with a second binding", () => {
    const r = run({ api: { running: true, networks: ["g0r6-internal"], ports: { "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: "58461" }, { HostIp: "127.0.0.1", HostPort: "58462" }] } } });
    expect(r).toMatchObject({ ok: false, check: "isolation" });
  });
  it("refuses a development or clean-stack API port even when it is the only binding", () => {
    for (const port of ["54321", "55321"]) {
      const r = run({
        env: { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}` },
        api: { running: true, networks: ["g0r6-internal"], ports: { "8000/tcp": [{ HostIp: "127.0.0.1", HostPort: port }] } },
      });
      expect(r.ok).toBe(false);
    }
  });
  it("refuses a client URL that is not loopback", () => {
    expect(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" } })).toMatchObject({ ok: false, check: "not-development" });
  });
  it("refuses a client URL whose port differs from the published binding", () => {
    expect(run({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:58462" } })).toMatchObject({ ok: false, check: "same-stack" });
  });
  it("refuses when the database is not running", () => {
    expect(run({ db: { ...DB_OK, running: false } })).toMatchObject({ ok: false, check: "identity" });
  });
  it("refuses when SQL and the API see different databases", () => {
    const r = run({ probes: { ...PROBES_OK, apiUser: () => ({ status: 404, email: null }) } });
    expect(r).toMatchObject({ ok: false, check: "same-database" });
  });
  it("refuses an empty declaration (no implicit default)", () => {
    expect(run({ env: { R6_DB_CONTAINER: "" } })).toMatchObject({ ok: false, check: "configured" });
  });
  it("refuses when the contract flag is absent", () => {
    expect(run({ env: { ISOLATED_CONTRACT: undefined } })).toMatchObject({ ok: false, check: "configured" });
  });
});
