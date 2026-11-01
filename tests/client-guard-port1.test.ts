import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertClientUrlIsVerifiedTarget } from "./helpers/isolated-target";
import { guardCreateClient } from "./setup/guarded-create-client";

/**
 * Port 1 is the unroutable dummy of pure unit runs. It is allowed — for LOOPBACK hosts only. These tests call the REAL
 * assertClientUrlIsVerifiedTarget (not the pure evaluateClientTarget) and the REAL wrapper around it, with spies for the original
 * constructor and for fetch: a refusal must happen before either is touched.
 */
let original: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  original = vi.fn(() => ({ client: true }));
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const REFUSED_PORT_1 = [
  "http://example-project.supabase.co:1",
  "http://10.1.2.3:1",
  "http://192.168.0.10:1",
  "http://0.0.0.0:1",
  "http://127.0.0.1.evil.example:1",
  "http://user:pw@127.0.0.1:1",
  "https://127.0.0.1:1",
  "https://abc.supabase.co:1",
  "ftp://127.0.0.1:1",
];
const ACCEPTED_PORT_1 = ["http://127.0.0.1:1", "http://localhost:1", "http://[::1]:1", "http://127.0.0.1:1/rest/v1"];

describe("assertClientUrlIsVerifiedTarget (the real function)", () => {
  it.each(REFUSED_PORT_1)("refuses %s", (url) => {
    expect(() => assertClientUrlIsVerifiedTarget(url)).toThrow(/Refusing to run/);
  });
  it.each(ACCEPTED_PORT_1)("accepts the loopback dummy %s", (url) => {
    expect(() => assertClientUrlIsVerifiedTarget(url)).not.toThrow();
  });
  it("still refuses what is not a URL, and the development port", () => {
    expect(() => assertClientUrlIsVerifiedTarget("not a url")).toThrow();
    expect(() => assertClientUrlIsVerifiedTarget(undefined)).toThrow();
    expect(() => assertClientUrlIsVerifiedTarget("http://127.0.0.1:54321")).toThrow();
  });
});

describe("the wrapper around the real function: zero calls to the constructor and to fetch on a refusal", () => {
  it.each(REFUSED_PORT_1)("%s", (url) => {
    const create = guardCreateClient(original as unknown as (u: string, k: string) => unknown, assertClientUrlIsVerifiedTarget);
    expect(() => create(url, "key")).toThrow();
    expect(original).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("and accepts the loopback dummy exactly once per call", () => {
    const create = guardCreateClient(original as unknown as (u: string, k: string) => unknown, assertClientUrlIsVerifiedTarget);
    for (const url of ACCEPTED_PORT_1) create(url, "key");
    expect(original).toHaveBeenCalledTimes(ACCEPTED_PORT_1.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
